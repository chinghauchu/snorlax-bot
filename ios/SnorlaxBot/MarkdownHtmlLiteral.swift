// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.60: raw HTML stays literal text in a completed assistant
/// LEFT `kind=message`.
///
/// Setext headings already shipped in v1.44. ATX closing hashes
/// already match CommonMark. Nested `***` / `___` emphasis
/// already renders as bold italic. This cut is inline raw HTML,
/// which the parser would otherwise drop.
///
/// The whole tag is a `§§SBE` token until the text is painted.
/// A character reference inside the tag is already its own token;
/// restore unwraps that too (v1.61), so the character shows and
/// is not markdown syntax. Inline tags and type 7 (`<br>`,
/// `<kbd>`, `x<y>`, a mid-line comment) are stashed. A type 1–6
/// HTML block that starts a line stays raw so a list or quote
/// still ends there.
///
/// Code, angle autolinks, and link destinations stay as written.
/// Streaming (`completed: false`) returns the source unchanged.
/// Copy controls keep markdown source. This type does not write
/// the pasteboard. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownHtmlLiteral.ts`.
enum MarkdownHtmlLiteral {
    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        if reduceMotion { return nil }
        return nil
    }

    /// Stash inline and type-7 raw HTML outside code and link
    /// destinations. `completed: false` returns `text` unchanged.
    static func literalize(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty || !text.contains("<") { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let next = rewrite(src)
        if next == src { return text.contains("\r") ? src : text }
        return next
    }

    private static func rewrite(_ src: String) -> String {
        let chars = Array(src)
        let opaque = MarkdownEscape.opaqueSpans(in: src)
        let blocked = merge(opaque + htmlBlockRanges(chars, opaque))
        var out = ""
        out.reserveCapacity(chars.count)
        var index = 0
        var block = 0
        var depth = 0
        while index < chars.count {
            if block < blocked.count, index >= blocked[block].start, index < blocked[block].end {
                out.append(contentsOf: chars[index..<blocked[block].end])
                index = blocked[block].end
                block += 1
                continue
            }
            while block < blocked.count, index >= blocked[block].end { block += 1 }
            let ch = chars[index]
            if depth > 0 {
                if ch == "(" { depth += 1 }
                else if ch == ")" { depth -= 1 }
                out.append(ch)
                index += 1
                continue
            }
            if ch == "]", index + 1 < chars.count, chars[index + 1] == "(" {
                out.append("](")
                depth = 1
                index += 2
                continue
            }
            if ch == "<", let end = htmlTagEnd(chars, index), end > index, !overlaps(index, end, blocked) {
                out.append(token(String(chars[index..<end])))
                index = end
                continue
            }
            out.append(ch)
            index += 1
        }
        return out
    }

    private static func htmlBlockRanges(
        _ chars: [Character],
        _ opaque: [(start: Int, end: Int)]
    ) -> [(start: Int, end: Int)] {
        let lines = lineSpans(chars)
        let texts = lines.map { $0.text }
        var ranges: [(start: Int, end: Int)] = []
        var index = 0
        while index < lines.count {
            let line = lines[index]
            if covered(line.start, opaque) || !MarkdownList.htmlBlockInterrupts(line.text) {
                index += 1
                continue
            }
            let next: Int
            if let until = MarkdownList.htmlUntilBlockEnd(texts, index: index, paragraphOpen: true) {
                next = until
            } else {
                var cursor = index + 1
                while cursor < lines.count, !isBlank(lines[cursor].text) { cursor += 1 }
                next = cursor
            }
            let end = next < lines.count ? lines[next].start : chars.count
            if end > line.start {
                ranges.append((start: line.start, end: end))
            }
            index = max(next, index + 1)
        }
        return ranges
    }

    private static func lineSpans(
        _ chars: [Character]
    ) -> [(start: Int, end: Int, text: String)] {
        var lines: [(start: Int, end: Int, text: String)] = []
        var index = 0
        while index <= chars.count {
            var end = index
            while end < chars.count, chars[end] != "\n" { end += 1 }
            lines.append((start: index, end: end, text: String(chars[index..<end])))
            if end >= chars.count { break }
            index = end + 1
        }
        return lines
    }

    private static func isBlank(_ line: String) -> Bool {
        for ch in line where ch != " " && ch != "\t" { return false }
        return true
    }

    private static func covered(_ index: Int, _ ranges: [(start: Int, end: Int)]) -> Bool {
        ranges.contains { index >= $0.start && index < $0.end }
    }

    private static func overlaps(
        _ start: Int,
        _ end: Int,
        _ ranges: [(start: Int, end: Int)]
    ) -> Bool {
        ranges.contains { start < $0.end && end > $0.start }
    }

    private static func merge(
        _ ranges: [(start: Int, end: Int)]
    ) -> [(start: Int, end: Int)] {
        let sorted = ranges
            .filter { $0.end > $0.start }
            .sorted { $0.start < $1.start || ($0.start == $1.start && $0.end < $1.end) }
        var out: [(start: Int, end: Int)] = []
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

    /// End of a raw HTML tag starting at `index`, or nil.
    private static func htmlTagEnd(_ chars: [Character], _ index: Int) -> Int? {
        guard index < chars.count, chars[index] == "<" else { return nil }
        if hasPrefix(chars, index, "<!--") {
            guard let close = find(Array("-->"), in: chars, from: index + 2) else { return nil }
            return close + 3
        }
        if hasPrefix(chars, index, "<![CDATA[") {
            guard let close = find(Array("]]>"), in: chars, from: index + 9) else { return nil }
            return close + 3
        }
        if hasPrefix(chars, index, "<?") {
            guard let close = find(Array("?>"), in: chars, from: index + 2) else { return nil }
            return close + 2
        }
        if index + 2 < chars.count, chars[index + 1] == "!", isUpper(chars[index + 2]) {
            guard let close = find(Array(">"), in: chars, from: index + 3) else { return nil }
            return close + 1
        }
        var cursor = index + 1
        let closing = cursor < chars.count && chars[cursor] == "/"
        if closing { cursor += 1 }
        guard cursor < chars.count, isLetter(chars[cursor]) else { return nil }
        cursor += 1
        while cursor < chars.count, isTagNameChar(chars[cursor]) { cursor += 1 }
        if closing {
            cursor = skipWs(chars, cursor)
            guard cursor < chars.count, chars[cursor] == ">" else { return nil }
            return cursor + 1
        }
        while true {
            let afterWs = skipWs(chars, cursor)
            if afterWs == cursor { break }
            guard let nameEnd = attrNameEnd(chars, afterWs) else {
                cursor = afterWs
                break
            }
            cursor = nameEnd
            let eq = skipWs(chars, cursor)
            if eq >= chars.count || chars[eq] != "=" { continue }
            guard let valEnd = attrValueEnd(chars, skipWs(chars, eq + 1)) else { return nil }
            cursor = valEnd
        }
        cursor = skipWs(chars, cursor)
        if cursor < chars.count, chars[cursor] == "/" {
            cursor += 1
            cursor = skipWs(chars, cursor)
        }
        guard cursor < chars.count, chars[cursor] == ">" else { return nil }
        return cursor + 1
    }

    private static func skipWs(_ chars: [Character], _ index: Int) -> Int {
        var cursor = index
        var line = false
        while cursor < chars.count {
            let ch = chars[cursor]
            if ch == " " || ch == "\t" {
                cursor += 1
                continue
            }
            if ch == "\n", !line {
                line = true
                cursor += 1
                continue
            }
            break
        }
        return cursor
    }

    private static func attrNameEnd(_ chars: [Character], _ index: Int) -> Int? {
        guard index < chars.count, isAttrNameStart(chars[index]) else { return nil }
        var cursor = index + 1
        while cursor < chars.count, isAttrNameChar(chars[cursor]) { cursor += 1 }
        return cursor
    }

    private static func attrValueEnd(_ chars: [Character], _ index: Int) -> Int? {
        guard index < chars.count else { return nil }
        let ch = chars[index]
        if ch == "'" || ch == "\"" {
            guard let close = find([ch], in: chars, from: index + 1) else { return nil }
            return close + 1
        }
        if isUnquotedStop(ch) { return nil }
        var cursor = index + 1
        while cursor < chars.count, !isUnquotedStop(chars[cursor]) { cursor += 1 }
        return cursor
    }

    private static func hasPrefix(_ chars: [Character], _ index: Int, _ prefix: String) -> Bool {
        let needle = Array(prefix)
        guard index + needle.count <= chars.count else { return false }
        for offset in 0..<needle.count where chars[index + offset] != needle[offset] { return false }
        return true
    }

    private static func find(_ needle: [Character], in chars: [Character], from: Int) -> Int? {
        guard !needle.isEmpty, from <= chars.count else { return nil }
        var index = from
        while index + needle.count <= chars.count {
            var matches = true
            for offset in 0..<needle.count where chars[index + offset] != needle[offset] {
                matches = false
                break
            }
            if matches { return index }
            index += 1
        }
        return nil
    }

    private static func token(_ value: String) -> String {
        var hex = ""
        for scalar in value.unicodeScalars {
            hex += String(format: "%06X", scalar.value)
        }
        return "§§SBE\(hex)§§"
    }

    private static func isLetter(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "A" && scalar <= "Z") || (scalar >= "a" && scalar <= "z")
    }

    private static func isUpper(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return scalar >= "A" && scalar <= "Z"
    }

    private static func isTagNameChar(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return isLetter(ch) || (scalar >= "0" && scalar <= "9") || ch == "-"
    }

    private static func isAttrNameStart(_ ch: Character) -> Bool {
        isLetter(ch) || ch == "_" || ch == ":"
    }

    private static func isAttrNameChar(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return isAttrNameStart(ch) || (scalar >= "0" && scalar <= "9") || ch == "." || ch == "-"
    }

    private static func isUnquotedStop(_ ch: Character) -> Bool {
        ch == " " || ch == "\t" || ch == "\n" || ch == "\r"
            || ch == "\"" || ch == "'" || ch == "=" || ch == "<" || ch == ">" || ch == "`"
    }
}
