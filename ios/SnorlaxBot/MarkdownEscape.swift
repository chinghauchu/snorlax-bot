// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.40: CommonMark backslash escapes and HTML character references
/// on a completed assistant LEFT `kind=message`.
///
/// A backslash before ASCII punctuation becomes that character and
/// must not start emphasis, a link, a list, or any other construct.
/// Named references (the HTML5 set cmark-gfm uses) and decimal / hex
/// numeric references decode to their characters. Unknown names and
/// broken references stay literal. A numeric reference that is zero, a
/// surrogate, a noncharacter, a disallowed control, or past
/// U+10FFFF becomes U+FFFD, matching CommonMark.
/// v1.90: titles and image alts share this lookup, so `&ouml;` and
/// `&ngE;` decode there too. `decodedText` paints a fence info
/// string. The code body is not passed through it.
///
/// Code spans, fenced code, and indented code blocks stay literal.
/// Call this after math is split out: `\(` / `\)` and `$$` are
/// already math, so a delimiter is not turned into a parenthesis.
///
/// The decoded character is a `§§SBE` token until the text is
/// painted, so a later pass cannot treat it as syntax and it is
/// never injected as HTML. v1.61: a raw-HTML stash can wrap one
/// of these tokens. Restoring repeats until the character shows,
/// including inside a tag or an inline comment. Streaming
/// (`completed: false`) returns the source unchanged. Copy
/// controls keep markdown source.
/// v1.69: 8 or more decimal digits, or 7 or more hex digits, stay
/// the source characters. `&#87654321;` is not U+FFFD and
/// `&#x0001F600;` is not an emoji.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownEscape.ts`.
enum MarkdownEscape {
    private struct Span {
        var start: Int
        var end: Int
    }

    /// CommonMark ASCII punctuation.
    private static let asciiPunct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")

    /// Fences, inline code, and indented code, as character offsets.
    /// The raw-HTML pass skips these spans.
    static func opaqueSpans(in text: String) -> [(start: Int, end: Int)] {
        codeSpans(in: Array(text))
    }

    /// Fences, inline code, and indented code. Destinations are not
    /// included, so a destination scan can call this without looping.
    static func codeSpans(in chars: [Character]) -> [(start: Int, end: Int)] {
        protectedCode(chars).map { (start: $0.start, end: $0.end) }
    }

    /// Rewrite escapes and character references outside code.
    /// `completed: false` returns `text` unchanged.
    /// v1.67 stashes `__init__`-style identifiers first, so a
    /// word-boundary dunder stays literal when there is no escape.
    /// v1.68 then stashes BMP Unicode symbols so `*` flanking matches.
    /// v1.69 stashes a numeric reference with more digits than
    /// CommonMark allows, so `&#87654321;` and `&#x0001F600;` stay
    /// the characters instead of U+FFFD or an emoji.
    /// v1.79 leaves a link or image destination untouched so
    /// `&#38;` in the href reaches the markdown parser.
    /// v1.91: a backslash inside an angle autolink or raw HTML
    /// stays a backslash. An autolink is copied whole, so
    /// `&amp;` in the URL stays the source characters. A raw
    /// HTML tag or HTML block still decodes a character
    /// reference. `\<` before a tag is still an escape.
    static func protect(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty { return text }
        let underscored = MarkdownUnderscore.protect(text, completed: true)
        let prepared = MarkdownSymbol.protect(underscored, completed: true)
        if !prepared.contains("\\") && !prepared.contains("&") { return prepared }
        let chars = Array(prepared)
        let blocked = protectedRanges(chars)
        let literal = slashLiteralSpans(chars, blocked: blocked)
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        var block = 0
        var lit = 0
        while index < chars.count {
            while block < blocked.count, index >= blocked[block].end { block += 1 }
            while lit < literal.count, index >= literal[lit].end { lit += 1 }
            if block < blocked.count, index >= blocked[block].start, index < blocked[block].end {
                out.append(contentsOf: chars[index..<blocked[block].end])
                index = blocked[block].end
                block += 1
                continue
            }
            if lit < literal.count, index >= literal[lit].start, index < literal[lit].end {
                let end = literal[lit].end
                while index < end {
                    while block < blocked.count, index >= blocked[block].end { block += 1 }
                    if block < blocked.count, index >= blocked[block].start, blocked[block].start < end {
                        let stop = min(blocked[block].end, end)
                        out.append(contentsOf: chars[index..<stop])
                        index = stop
                        continue
                    }
                    if chars[index] == "&", let ref = readReference(chars, index), ref.next <= end {
                        out.append(token(ref.value))
                        index = ref.next
                        continue
                    }
                    out.append(chars[index])
                    index += 1
                }
                lit += 1
                continue
            }
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count, asciiPunct.contains(chars[index + 1]) {
                out.append(token(String(chars[index + 1])))
                index += 2
                continue
            }
            if ch == "&", let ref = readReference(chars, index) {
                out.append(token(ref.value))
                index = ref.next
                continue
            }
            out.append(ch)
            index += 1
        }
        return out
    }

    /// Paint tokens as characters. Link targets are restored too,
    /// including when the URL percent-encoded the token.
    static func restore(_ source: AttributedString) -> AttributedString {
        let raw = String(source.characters)
        let needsText = raw.contains("§§SBE")
        let needsLink = source.runs.contains { run in
            guard let link = run.link else { return false }
            let abs = link.absoluteString
            return abs.contains("SBE") || abs.contains("%C2%A7") || abs.contains("%c2%a7")
        }
        if !needsText && !needsLink { return source }
        var output = AttributedString()
        if needsText {
            for run in source.runs {
                let slice = String(source[run.range].characters)
                if !slice.contains("§§SBE") {
                    output.append(source[run.range])
                    continue
                }
                var piece = AttributedString(restoreString(slice))
                piece.inlinePresentationIntent = run.inlinePresentationIntent
                piece.presentationIntent = run.presentationIntent
                piece.foregroundColor = run.foregroundColor
                piece.backgroundColor = run.backgroundColor
                piece.font = run.font
                piece.uiKit.font = run.uiKit.font
                piece.link = run.link
                output.append(piece)
            }
        } else {
            output = source
        }
        return restoreLinkTargets(output)
    }

    /// Paint tokens as characters. A raw-HTML stash can wrap an
    /// entity token, so this repeats until none remain.
    static func restoreString(_ text: String) -> String {
        var current = text
        for _ in 0..<8 {
            guard current.contains("§§SBE") else { return current }
            guard let re = try? NSRegularExpression(pattern: #"§§SBE((?:[0-9A-F]{6})+)§§"#) else {
                return current
            }
            let ns = current as NSString
            let matches = re.matches(in: current, range: NSRange(location: 0, length: ns.length))
            if matches.isEmpty { return current }
            var out = ""
            var cursor = 0
            for match in matches {
                let range = match.range
                if range.location > cursor {
                    out += ns.substring(with: NSRange(location: cursor, length: range.location - cursor))
                }
                let hex = ns.substring(with: match.range(at: 1))
                out += decodeHex(hex) ?? ns.substring(with: range)
                cursor = range.location + range.length
            }
            if cursor < ns.length {
                out += ns.substring(from: cursor)
            }
            if out == current { return current }
            current = out
        }
        return current
    }

    private static func token(_ value: String) -> String {
        var hex = ""
        for scalar in value.unicodeScalars {
            hex += String(format: "%06X", scalar.value)
        }
        return "§§SBE\(hex)§§"
    }

    private static func decodeHex(_ hex: String) -> String? {
        guard !hex.isEmpty, hex.count.isMultiple(of: 6) else { return nil }
        var out = ""
        var index = hex.startIndex
        while index < hex.endIndex {
            guard let next = hex.index(index, offsetBy: 6, limitedBy: hex.endIndex) else { return nil }
            guard let cp = UInt32(hex[index..<next], radix: 16), cp <= 0x10FFFF,
                  let scalar = UnicodeScalar(cp) else { return nil }
            out.append(Character(scalar))
            index = next
        }
        return out
    }

    /// Same numeric rules as CommonMark. Invalid and zero become U+FFFD.
    private static func decodeNumeric(_ code: Int) -> String {
        if code < 9 || code == 11 || (code > 13 && code < 32) || (code > 126 && code < 160)
            || (code > 55295 && code < 57344) || (code > 64975 && code < 65008)
            || (code & 65535) == 65535 || (code & 65535) == 65534 || code > 1114111
        {
            return "\u{FFFD}"
        }
        guard let scalar = UnicodeScalar(code) else { return "\u{FFFD}" }
        return String(Character(scalar))
    }

    /// Named or numeric character reference at `index`, or nil.
    static func characterReference(
        _ chars: [Character],
        _ index: Int
    ) -> (value: String, next: Int)? {
        readReference(chars, index)
    }

    /// Hide a literal from the markdown parser. `restoreString` paints it.
    static func stash(_ value: String) -> String {
        token(value)
    }

    /// v1.90: cmark's fence info string. Entities decode first, then
    /// a backslash before ASCII punctuation is dropped. The code
    /// body is not passed here, so `&amp;` inside the fence stays
    /// the source characters. An unknown name, a missing semicolon,
    /// and an over-long numeric reference stay literal. A zero or
    /// out-of-range code point is U+FFFD.
    static func decodedText(_ text: String) -> String {
        let decoded = decodeEntities(text)
        if !decoded.contains("\\") { return decoded }
        let chars = Array(decoded)
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        while index < chars.count {
            if chars[index] == "\\", index + 1 < chars.count, asciiPunct.contains(chars[index + 1]) {
                out.append(chars[index + 1])
                index += 2
                continue
            }
            out.append(chars[index])
            index += 1
        }
        return out
    }

    private static func decodeEntities(_ text: String) -> String {
        if !text.contains("&") { return text }
        let chars = Array(text)
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        while index < chars.count {
            if chars[index] == "&", let ref = readReference(chars, index) {
                out += ref.value
                index = ref.next
                continue
            }
            out.append(chars[index])
            index += 1
        }
        return out
    }

    private static func readReference(
        _ chars: [Character],
        _ index: Int
    ) -> (value: String, next: Int)? {
        guard index < chars.count, chars[index] == "&" else { return nil }
        if index + 1 < chars.count, chars[index + 1] == "#" {
            return readNumeric(chars, index)
        }
        var cursor = index + 1
        var name = ""
        while cursor < chars.count, name.count < 31, isName(chars[cursor]) {
            name.append(chars[cursor])
            cursor += 1
        }
        guard !name.isEmpty, cursor < chars.count, chars[cursor] == ";",
              let value = MarkdownCmarkEntities.named[name] else {
            return nil
        }
        return (value, cursor + 1)
    }

    private static func readNumeric(
        _ chars: [Character],
        _ index: Int
    ) -> (value: String, next: Int)? {
        var cursor = index + 2
        var hex = false
        if cursor < chars.count, chars[cursor] == "x" || chars[cursor] == "X" {
            hex = true
            cursor += 1
        }
        let max = hex ? 6 : 7
        let start = cursor
        while cursor < chars.count, isDigit(chars[cursor], hex: hex) {
            cursor += 1
        }
        let digits = cursor - start
        guard digits > 0, cursor < chars.count, chars[cursor] == ";" else { return nil }
        // v1.69: more digits than CommonMark allows stay literal.
        // cmark-gfm would decode &#87654321; and &#x0001F600;.
        if digits > max {
            return (String(chars[index...cursor]), cursor + 1)
        }
        let text = String(chars[start..<cursor])
        guard let code = Int(text, radix: hex ? 16 : 10) else { return nil }
        return (decodeNumeric(code), cursor + 1)
    }

    private static func isName(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "A" && scalar <= "Z") || (scalar >= "a" && scalar <= "z")
            || (scalar >= "0" && scalar <= "9")
    }

    private static func isDigit(_ ch: Character, hex: Bool) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        if scalar >= "0" && scalar <= "9" { return true }
        if !hex { return false }
        return (scalar >= "a" && scalar <= "f") || (scalar >= "A" && scalar <= "F")
    }

    private static func protectedCode(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        let indented = indentedCodeRanges(chars, fences)
        return merge(fences + codes + indented)
    }

    private static func protectedRanges(_ chars: [Character]) -> [Span] {
        let code = protectedCode(chars)
        var spans = code
        for dest in MarkdownLinkDest.spans(chars) {
            spans.append(Span(start: dest.start, end: dest.end))
        }
        // v1.91: an angle autolink is not an escape context.
        spans.append(contentsOf: autolinkSpans(chars, skipping: code))
        return merge(spans)
    }

    /// Raw HTML where a backslash stays and a character reference
    /// still decodes. Not code, not an autolink, not a destination.
    private static func slashLiteralSpans(_ chars: [Character], blocked: [Span]) -> [Span] {
        let blocks = rawHtmlBlockSpans(chars)
        var skip = blocked
        skip.append(contentsOf: blocks)
        let tags = inlineTagSpans(chars, skipping: merge(skip))
        return merge(blocks + tags)
    }

    /// CommonMark angle autolinks. An escaped `\<` is not one.
    private static func autolinkSpans(_ chars: [Character], skipping: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inSpan(index, skipping) {
                index += 1
                continue
            }
            if chars[index] != "<" || isEscaped(chars, index) {
                index += 1
                continue
            }
            if let end = autolinkEnd(chars, index) {
                ranges.append(Span(start: index, end: end))
                index = end
                continue
            }
            index += 1
        }
        return ranges
    }

    private static func autolinkEnd(_ chars: [Character], _ start: Int) -> Int? {
        var cursor = start + 1
        while cursor < chars.count {
            let ch = chars[cursor]
            if ch == ">" { break }
            if ch == "<" || isAutolinkStop(ch) { return nil }
            cursor += 1
        }
        guard cursor < chars.count, chars[cursor] == ">" else { return nil }
        let inner = String(chars[(start + 1)..<cursor])
        if inner.isEmpty || (!isSchemeAutolink(inner) && !isEmailAutolink(inner)) { return nil }
        return cursor + 1
    }

    private static func isAutolinkStop(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return scalar.value <= 32 || scalar.value == 127
    }

    /// Scheme is a letter, then 1–31 scheme characters, then `:`.
    private static func isSchemeAutolink(_ text: String) -> Bool {
        let chars = Array(text)
        guard chars.count >= 3, isAsciiLetter(chars[0]) else { return false }
        var index = 1
        while index < chars.count, index < 32, isSchemeChar(chars[index]) { index += 1 }
        guard index >= 2, index < chars.count, chars[index] == ":" else { return false }
        return true
    }

    private static func isAsciiLetter(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "A" && scalar <= "Z") || (scalar >= "a" && scalar <= "z")
    }

    private static func isSchemeChar(_ ch: Character) -> Bool {
        if isAsciiLetter(ch) { return true }
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "0" && scalar <= "9") || ch == "+" || ch == "." || ch == "-"
    }

    private static func isEmailAutolink(_ text: String) -> Bool {
        let pattern =
            #"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        return re.firstMatch(in: text, range: range) != nil
    }

    private static func isEscaped(_ chars: [Character], _ index: Int) -> Bool {
        var count = 0
        var cursor = index - 1
        while cursor >= 0, chars[cursor] == "\\" {
            count += 1
            cursor -= 1
        }
        return count % 2 == 1
    }

    /// cmark HTML blocks. A backslash in the block is not an escape.
    private static func rawHtmlBlockSpans(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        var lines: [String] = []
        var starts: [Int] = []
        var index = 0
        while index <= chars.count {
            let end = lineEnd(chars, index)
            starts.append(index)
            lines.append(String(chars[index..<end]))
            if end >= chars.count { break }
            index = end + 1
        }
        var spans: [Span] = []
        var para = false
        var line = 0
        while line < lines.count {
            let start = starts[line]
            if inSpan(start, fences) {
                para = false
                line += 1
                continue
            }
            if lines[line].trimmingCharacters(in: .whitespaces) == "$$" {
                para = false
                line += 1
                while line < lines.count, lines[line].trimmingCharacters(in: .whitespaces) != "$$" {
                    line += 1
                }
                if line < lines.count { line += 1 }
                continue
            }
            if let htmlEnd = MarkdownList.htmlBlockLineEnd(lines, index: line, paragraphOpen: para),
               htmlEnd > line
            {
                let last = htmlEnd - 1
                let rangeEnd = last + 1 < starts.count ? starts[last + 1] - 1 : chars.count
                spans.append(Span(start: start, end: rangeEnd))
                para = false
                line = htmlEnd
                continue
            }
            let text = lines[line]
            para = !isBlankLine(text) && !blockClosesParagraph(text, para: para)
            line += 1
        }
        return spans
    }

    private static func inlineTagSpans(_ chars: [Character], skipping: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inSpan(index, skipping) {
                index += 1
                continue
            }
            if chars[index] == "<", !isEscaped(chars, index),
               let end = MarkdownHtmlLiteral.htmlTagEnd(chars, index)
            {
                ranges.append(Span(start: index, end: end))
                index = end
                continue
            }
            index += 1
        }
        return ranges
    }

    private static func isBlankLine(_ line: String) -> Bool {
        contentIndent(Array(line), 0, line.count) == nil
    }

    /// A line that ends an open paragraph, or is not a paragraph itself.
    private static func blockClosesParagraph(_ line: String, para: Bool) -> Bool {
        if line.range(of: #"^ {0,3}#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil { return true }
        if line.range(of: #"^ {0,3}>"#, options: .regularExpression) != nil { return true }
        if line.range(of: #"^ {0,3}(?:`{3,}|~{3,})"#, options: .regularExpression) != nil { return true }
        if line.range(
            of: #"^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$"#,
            options: .regularExpression
        ) != nil { return true }
        let indent = contentIndent(Array(line), 0, Array(line).count)
        return !para && indent != nil && indent! >= 4
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        var open: (marker: Character, count: Int, start: Int)?
        while index <= chars.count {
            let end = lineEnd(chars, index)
            if let fence = fenceOnLine(chars, index, end) {
                if open == nil {
                    open = (fence.marker, fence.count, index)
                } else if let opened = open,
                          fence.marker == opened.marker,
                          fence.count >= opened.count,
                          fence.infoEmpty
                {
                    ranges.append(Span(start: opened.start, end: end))
                    open = nil
                }
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if let opened = open {
            ranges.append(Span(start: opened.start, end: chars.count))
        }
        return ranges
    }

    private static func fenceOnLine(
        _ chars: [Character],
        _ start: Int,
        _ end: Int
    ) -> (marker: Character, count: Int, infoEmpty: Bool)? {
        var index = start
        var spaces = 0
        while index < end, spaces < 3, chars[index] == " " {
            index += 1
            spaces += 1
        }
        guard index < end else { return nil }
        let marker = chars[index]
        guard marker == "`" || marker == "~" else { return nil }
        var count = 0
        while index < end, chars[index] == marker {
            count += 1
            index += 1
        }
        guard count >= 3 else { return nil }
        if marker == "`", chars[index..<end].contains("`") { return nil }
        var infoEmpty = true
        while index < end {
            if chars[index] != " " && chars[index] != "\t" {
                infoEmpty = false
                break
            }
            index += 1
        }
        return (marker, count, infoEmpty)
    }

    private static func inlineCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if inSpan(index, fences) {
                index += 1
                continue
            }
            if chars[index] != "`" {
                index += 1
                continue
            }
            var count = 1
            while index + count < chars.count, chars[index + count] == "`" { count += 1 }
            var cursor = index + count
            var closed = false
            while cursor < chars.count {
                if inSpan(cursor, fences) {
                    cursor += 1
                    continue
                }
                if chars[cursor] != "`" {
                    cursor += 1
                    continue
                }
                var marks = 1
                while cursor + marks < chars.count, chars[cursor + marks] == "`" { marks += 1 }
                if marks == count {
                    ranges.append(Span(start: index, end: cursor + marks))
                    index = cursor + marks
                    closed = true
                    break
                }
                cursor += marks
            }
            if !closed { index += count }
        }
        return ranges
    }

    private static func indentedCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var inCode = false
        var codeStart = 0
        var prevBlank = true
        var index = 0
        while index <= chars.count {
            let end = lineEnd(chars, index)
            if inSpan(index, fences) {
                if inCode {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                prevBlank = false
            } else {
                let indent = contentIndent(chars, index, end)
                let blank = indent == nil
                if inCode, let indent, indent < 4 {
                    ranges.append(Span(start: codeStart, end: index))
                    inCode = false
                }
                if !inCode, prevBlank, let indent, indent >= 4 {
                    inCode = true
                    codeStart = index
                }
                prevBlank = blank
            }
            if end >= chars.count { break }
            index = end + 1
        }
        if inCode {
            ranges.append(Span(start: codeStart, end: chars.count))
        }
        return ranges
    }

    private static func contentIndent(_ chars: [Character], _ start: Int, _ end: Int) -> Int? {
        var col = 0
        var index = start
        while index < end {
            let ch = chars[index]
            if ch == " " {
                col += 1
            } else if ch == "\t" {
                col += 4 - (col % 4)
            } else {
                return col
            }
            index += 1
        }
        return nil
    }

    private static func lineEnd(_ chars: [Character], _ start: Int) -> Int {
        var index = start
        while index < chars.count, chars[index] != "\n" { index += 1 }
        return index
    }

    private static func inSpan(_ index: Int, _ ranges: [Span]) -> Bool {
        ranges.contains { index >= $0.start && index < $0.end }
    }

    private static func merge(_ ranges: [Span]) -> [Span] {
        let sorted = ranges
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start || ($0.start == $1.start && $0.end < $1.end) }
        var out: [Span] = []
        for range in sorted {
            if var last = out.last, range.start <= last.end {
                last.end = max(last.end, range.end)
                out[out.count - 1] = last
            } else {
                out.append(range)
            }
        }
        return out
    }

    private static func restoreLinkTargets(_ source: AttributedString) -> AttributedString {
        var result = source
        for run in source.runs {
            guard let link = run.link else { continue }
            let abs = link.absoluteString
            guard abs.contains("SBE") || abs.contains("%C2%A7") || abs.contains("%c2%a7") else { continue }
            let restored = restoreURL(abs)
            guard restored != abs, let url = URL(string: restored) else { continue }
            if let start = AttributedString.Index(run.range.lowerBound, within: result),
               let end = AttributedString.Index(run.range.upperBound, within: result)
            {
                result[start..<end].link = url
            }
        }
        return result
    }

    /// Decode a token that a URL percent-encoded (`§` is `%C2%A7`).
    /// Other percent-escapes in the destination stay as written.
    /// Repeats so a percent-encoded stash that wraps an entity token
    /// paints the character.
    private static func restoreURL(_ absolute: String) -> String {
        var text = absolute
        let encoded = #"%[Cc]2%[Aa]7%[Cc]2%[Aa]7SBE((?:[0-9A-F]{6})+)%[Cc]2%[Aa]7%[Cc]2%[Aa]7"#
        for _ in 0..<8 {
            let before = text
            if let re = try? NSRegularExpression(pattern: encoded) {
                let ns = text as NSString
                let matches = re.matches(in: text, range: NSRange(location: 0, length: ns.length))
                if !matches.isEmpty {
                    var out = ""
                    var cursor = 0
                    for match in matches {
                        let range = match.range
                        if range.location > cursor {
                            out += ns.substring(with: NSRange(location: cursor, length: range.location - cursor))
                        }
                        let hex = ns.substring(with: match.range(at: 1))
                        out += decodeHex(hex) ?? ns.substring(with: range)
                        cursor = range.location + range.length
                    }
                    if cursor < ns.length { out += ns.substring(from: cursor) }
                    text = out
                }
            }
            if text.contains("§§SBE") {
                text = restoreString(text)
            }
            if text == before { break }
        }
        return text
    }
}
