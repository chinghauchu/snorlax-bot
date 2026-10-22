// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v1.40: CommonMark backslash escapes and HTML character references
/// on a completed assistant LEFT `kind=message`.
///
/// A backslash before ASCII punctuation becomes that character and
/// must not start emphasis, a link, a list, or any other construct.
/// Named references (the common HTML5 set) and decimal / hex numeric
/// references decode to their characters. Unknown names and broken
/// references stay literal. A numeric reference that is zero, a
/// surrogate, a noncharacter, a disallowed control, or past
/// U+10FFFF becomes U+FFFD, matching CommonMark.
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
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownEscape.ts`.
enum MarkdownEscape {
    private struct Span {
        var start: Int
        var end: Int
    }

    /// CommonMark ASCII punctuation.
    private static let asciiPunct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")

    /// Common HTML5 names, the uppercase aliases HTML5 defines, and
    /// the check marks. Names are case-sensitive.
    private static let named: [String: String] = [
        "amp": "\u{0026}",
        "AMP": "\u{0026}",
        "lt": "\u{003C}",
        "LT": "\u{003C}",
        "gt": "\u{003E}",
        "GT": "\u{003E}",
        "quot": "\u{0022}",
        "QUOT": "\u{0022}",
        "apos": "\u{0027}",
        "nbsp": "\u{00A0}",
        "copy": "\u{00A9}",
        "COPY": "\u{00A9}",
        "reg": "\u{00AE}",
        "REG": "\u{00AE}",
        "trade": "\u{2122}",
        "TRADE": "\u{2122}",
        "hellip": "\u{2026}",
        "mdash": "\u{2014}",
        "ndash": "\u{2013}",
        "lsquo": "\u{2018}",
        "rsquo": "\u{2019}",
        "ldquo": "\u{201C}",
        "rdquo": "\u{201D}",
        "times": "\u{00D7}",
        "divide": "\u{00F7}",
        "deg": "\u{00B0}",
        "plusmn": "\u{00B1}",
        "middot": "\u{00B7}",
        "bull": "\u{2022}",
        "euro": "\u{20AC}",
        "pound": "\u{00A3}",
        "yen": "\u{00A5}",
        "cent": "\u{00A2}",
        "sect": "\u{00A7}",
        "para": "\u{00B6}",
        "larr": "\u{2190}",
        "rarr": "\u{2192}",
        "uarr": "\u{2191}",
        "darr": "\u{2193}",
        "check": "\u{2713}",
        "checkmark": "\u{2713}",
        "cross": "\u{2717}",
    ]

    /// Fences, inline code, and indented code, as character offsets.
    /// The raw-HTML pass skips these spans.
    static func opaqueSpans(in text: String) -> [(start: Int, end: Int)] {
        protectedRanges(Array(text)).map { (start: $0.start, end: $0.end) }
    }

    /// Rewrite escapes and character references outside code.
    /// `completed: false` returns `text` unchanged.
    /// v1.67 stashes `__init__`-style identifiers first, so a
    /// word-boundary dunder stays literal when there is no escape.
    static func protect(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty { return text }
        let prepared = MarkdownUnderscore.protect(text, completed: true)
        if !prepared.contains("\\") && !prepared.contains("&") { return prepared }
        let chars = Array(prepared)
        let blocked = protectedRanges(chars)
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        var block = 0
        while index < chars.count {
            if block < blocked.count, index >= blocked[block].start, index < blocked[block].end {
                out.append(contentsOf: chars[index..<blocked[block].end])
                index = blocked[block].end
                block += 1
                continue
            }
            while block < blocked.count, index >= blocked[block].end { block += 1 }
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
        guard !name.isEmpty, cursor < chars.count, chars[cursor] == ";", let value = named[name] else {
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
        while cursor < chars.count, cursor - start < max, isDigit(chars[cursor], hex: hex) {
            cursor += 1
        }
        guard cursor > start, cursor < chars.count, chars[cursor] == ";" else { return nil }
        let digits = String(chars[start..<cursor])
        guard let code = Int(digits, radix: hex ? 16 : 10) else { return nil }
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

    private static func protectedRanges(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        let indented = indentedCodeRanges(chars, fences)
        return merge(fences + codes + indented)
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
