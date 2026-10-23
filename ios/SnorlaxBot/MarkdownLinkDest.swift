// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.79: character references and backslash escapes inside link and
/// image destinations on a completed assistant LEFT `kind=message`.
///
/// Checked v1.78 on main first. That cut rewrites link titles.
/// Destinations still followed the platform parser, and the escape
/// pass ran first, so `&amp;` and `&copy;` inside a destination did
/// not percent-encode the way cmark-gfm does.
///
/// cmark trims space, tab, LF, and CR, decodes HTML character
/// references, then drops a backslash only before ASCII punctuation.
/// The href percent-encodes unsafe bytes. `&` is written back as
/// `&#38;` and `'` as `&#x27;` so the parser decodes them once.
/// A numeric reference with 8 or more decimal digits, or 7 or more
/// hex digits, stays the source characters (v1.69). In-range
/// references use the full HTML5 named set.
///
/// Streaming returns the text unchanged. Copy keeps markdown source.
/// No new HTTP.
/// Keep in lockstep with `desktop/src/markdownLinkDest.ts`.
enum MarkdownLinkDest {
    private struct Hit {
        var start: Int
        var end: Int
        var raw: String
    }

    private static let punct = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
    private static let hrefSafe = Set(
        Array("!#$%()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~")
            .compactMap { $0.asciiValue }
    )
    private static let footnoteChar = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

    /// Rewrite link and image destinations, including a reference
    /// definition, to the cmark-gfm href. `completed: false` returns
    /// `text`. A destination that is already in that form stays.
    static func prepare(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty || !text.contains("[") { return text }
        let chars = Array(text)
        var edits: [(start: Int, end: Int, text: String)] = []
        for hit in destinationHits(chars) {
            let encoded = href(hit.raw)
            let original = slice(chars, hit.start, hit.end)
            if encoded.isEmpty && original.isEmpty { continue }
            let replacement = markdownDestination(encoded)
            if replacement == original { continue }
            edits.append((hit.start, hit.end, replacement))
        }
        if edits.isEmpty { return text }
        edits.sort { $0.start < $1.start || ($0.start == $1.start && $0.end < $1.end) }
        var out = ""
        var cursor = 0
        for edit in edits {
            if edit.start < cursor { continue }
            out += slice(chars, cursor, edit.start)
            out += edit.text
            cursor = edit.end
        }
        out += slice(chars, cursor, chars.count)
        return out
    }

    /// Destination spans, including angle brackets. The escape pass
    /// and the autolink pass skip these.
    static func spans(_ chars: [Character]) -> [(start: Int, end: Int)] {
        let text = String(chars)
        if text.isEmpty || !text.contains("[") { return [] }
        return destinationHits(chars)
            .filter { $0.end > $0.start }
            .map { (start: $0.start, end: $0.end) }
    }

    /// Logical destination after trim, entities, and backslash escapes,
    /// then cmark href percent-encoding. `&` and `'` stay characters.
    static func href(_ raw: String) -> String {
        let trimmed = trimCmark(raw)
        if trimmed.isEmpty { return "" }
        return encodeHref(unescape(trimmed))
    }

    private static func markdownDestination(_ encoded: String) -> String {
        let body = encoded
            .replacingOccurrences(of: "&", with: "&#38;")
            .replacingOccurrences(of: "'", with: "&#x27;")
        if body.isEmpty || bareWouldBreak(body) { return "<" + body + ">" }
        return body
    }

    private static func destinationHits(_ chars: [Character]) -> [Hit] {
        let blocked = blockedRanges(chars)
        func blockedAt(_ index: Int) -> Bool { inRange(index, blocked) }
        var hits: [Hit] = []
        var index = 0
        while index < chars.count {
            if blockedAt(index) {
                index += 1
                continue
            }
            if let footnote = footnoteBracketEnd(chars, index) {
                index = footnote
                continue
            }
            let image = hasPrefix(chars, "![", at: index) && !isEscaped(chars, index)
            if (image || char(chars, index) == "[") && !isEscaped(chars, index) {
                let bracketAt = image ? index + 1 : index
                let next = takeInline(chars, bracketAt, blockedAt, &hits)
                index = next > bracketAt ? next : index + 1
                continue
            }
            index += 1
        }
        pushDefinitions(chars, blocked, blockedAt, &hits)
        return hits
    }

    private static func takeInline(
        _ chars: [Character],
        _ bracketAt: Int,
        _ blockedAt: (Int) -> Bool,
        _ hits: inout [Hit]
    ) -> Int {
        guard let label = readBracket(chars, bracketAt, blockedAt), !isFootnoteLabel(label.raw) else {
            return bracketAt + 1
        }
        guard let open = skipLinkSpace(chars, label.next, blockedAt), char(chars, open) == "(" else {
            return bracketAt + 1
        }
        guard let destAt = skipLinkSpace(chars, open + 1, blockedAt) else { return bracketAt + 1 }
        if char(chars, destAt) == ")" {
            hits.append(Hit(start: destAt, end: destAt, raw: ""))
            return destAt + 1
        }
        guard let dest = scanLinkUrl(chars, destAt) else { return bracketAt + 1 }
        var cursor = dest.end
        if let titleAt = skipLinkSpace(chars, cursor, blockedAt),
           titleAt != cursor,
           isTitleOpen(char(chars, titleAt)) {
            guard let title = readTitle(chars, titleAt, blockedAt) else { return bracketAt + 1 }
            cursor = title.next
        }
        guard let close = skipLinkSpace(chars, cursor, blockedAt), char(chars, close) == ")" else {
            return bracketAt + 1
        }
        hits.append(dest)
        return close + 1
    }

    private static func pushDefinitions(
        _ chars: [Character],
        _ blocked: [(start: Int, end: Int)],
        _ blockedAt: (Int) -> Bool,
        _ hits: inout [Hit]
    ) {
        var index = 0
        while index <= chars.count {
            let end = lineEnd(chars, index)
            if !inRange(index, blocked), let dest = definitionDest(chars, index, blockedAt) {
                if !hits.contains(where: { $0.start == dest.start }) {
                    hits.append(dest)
                }
            }
            if end >= chars.count { break }
            index = end + 1
        }
    }

    private static func definitionDest(
        _ chars: [Character],
        _ lineStart: Int,
        _ blockedAt: (Int) -> Bool
    ) -> Hit? {
        let eol = lineEnd(chars, lineStart)
        let line = slice(chars, lineStart, eol)
        var index = lineStart + quotePrefixLength(line)
        var spaces = 0
        while char(chars, index) == " " && spaces < 4 {
            spaces += 1
            index += 1
        }
        if spaces >= 4 || char(chars, index) == "\t" { return nil }
        if char(chars, index) != "[" || isEscaped(chars, index) || blockedAt(index) { return nil }
        guard let bracket = readBracket(chars, index, blockedAt),
              validLabel(bracket.raw),
              !isFootnoteLabel(bracket.raw) else { return nil }
        var cursor = skipSpTab(chars, bracket.next)
        if char(chars, cursor) != ":" { return nil }
        guard let destAt = skipDestWs(chars, cursor + 1, blockedAt),
              let dest = scanLinkUrl(chars, destAt) else { return nil }
        cursor = dest.end
        if let titleAt = skipDestWs(chars, cursor, blockedAt),
           titleAt != cursor,
           isTitleOpen(char(chars, titleAt)) {
            guard let title = readTitle(chars, titleAt, blockedAt) else { return nil }
            cursor = title.next
        }
        cursor = skipSpTab(chars, cursor)
        if cursor < chars.count && char(chars, cursor) != "\n" { return nil }
        return dest
    }

    private static func scanLinkUrl(_ chars: [Character], _ offset: Int) -> Hit? {
        if offset >= chars.count { return nil }
        if char(chars, offset) == "<" {
            var index = offset + 1
            var closed = false
            while index < chars.count {
                let ch = chars[index]
                if ch == ">" {
                    index += 1
                    closed = true
                    break
                }
                if ch == "\\" {
                    index += 2
                    continue
                }
                if ch == "\n" || ch == "<" { return nil }
                index += 1
            }
            if !closed || index >= chars.count { return nil }
            return Hit(start: offset, end: index, raw: slice(chars, offset + 1, index - 1))
        }
        var index = offset
        var depth = 0
        while index < chars.count {
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count, punct.contains(chars[index + 1]) {
                index += 2
                continue
            }
            if ch == "(" {
                depth += 1
                index += 1
                if depth > 32 { return nil }
                continue
            }
            if ch == ")" {
                if depth == 0 { break }
                depth -= 1
                index += 1
                continue
            }
            if ch == " " || ch == "\t" || ch == "\n" || ch == "\r" {
                if index == offset { return nil }
                break
            }
            index += 1
        }
        if index >= chars.count { return nil }
        return Hit(start: offset, end: index, raw: slice(chars, offset, index))
    }

    private static func readTitle(
        _ chars: [Character],
        _ index: Int,
        _ blockedAt: (Int) -> Bool
    ) -> (next: Int)? {
        let open = char(chars, index)
        if open != "\"" && open != "'" && open != "(" { return nil }
        let close: Character = open == "(" ? ")" : open
        var cursor = index + 1
        var raw = ""
        while cursor < chars.count {
            if blockedAt(cursor) { return nil }
            let ch = chars[cursor]
            if ch == "\0" { return nil }
            if ch == "\\", cursor + 1 < chars.count {
                let next = chars[cursor + 1]
                if next != "\0", punct.contains(next) {
                    if blockedAt(cursor + 1) { return nil }
                    raw.append(ch)
                    raw.append(next)
                    cursor += 2
                    continue
                }
            }
            if open == "(" && ch == "(" { return nil }
            if ch == close {
                if raw.contains("\n\n") || raw.range(of: "\n[ \t]*\n", options: .regularExpression) != nil {
                    return nil
                }
                return (cursor + 1)
            }
            raw.append(ch)
            cursor += 1
        }
        return nil
    }

    private static func readBracket(
        _ chars: [Character],
        _ open: Int,
        _ blockedAt: (Int) -> Bool
    ) -> (raw: String, next: Int)? {
        if char(chars, open) != "[" || isEscaped(chars, open) || blockedAt(open) { return nil }
        var index = open + 1
        var depth = 1
        var raw = ""
        while index < chars.count {
            if blockedAt(index) { return nil }
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count {
                raw.append(ch)
                raw.append(chars[index + 1])
                index += 2
                continue
            }
            if ch == "[" {
                depth += 1
                raw.append(ch)
                index += 1
                continue
            }
            if ch == "]" {
                depth -= 1
                if depth == 0 { return (raw, index + 1) }
                raw.append(ch)
                index += 1
                continue
            }
            if ch == "\n", index + 1 < chars.count, chars[index + 1] == "\n" { return nil }
            raw.append(ch)
            index += 1
        }
        return nil
    }

    private static func unescape(_ raw: String) -> String {
        let chars = Array(raw)
        var entities = ""
        var index = 0
        while index < chars.count {
            if chars[index] == "&", let ref = readEntity(chars, index) {
                entities += ref.value
                index = ref.next
                continue
            }
            entities.append(chars[index])
            index += 1
        }
        let decoded = Array(entities)
        var out = ""
        var cursor = 0
        while cursor < decoded.count {
            let ch = decoded[cursor]
            if ch == "\\", cursor + 1 < decoded.count, punct.contains(decoded[cursor + 1]) {
                out.append(decoded[cursor + 1])
                cursor += 2
                continue
            }
            out.append(ch)
            cursor += 1
        }
        return out
    }

    private static func readEntity(_ chars: [Character], _ index: Int) -> (value: String, next: Int)? {
        if char(chars, index) != "&" { return nil }
        if char(chars, index + 1) == "#" { return readNumeric(chars, index) }
        let limit = min(chars.count, index + 1 + 32)
        var cursor = index + 3
        while cursor < limit {
            let ch = chars[cursor]
            if ch == " " { break }
            if ch == ";" {
                let name = slice(chars, index + 1, cursor)
                if let value = MarkdownCmarkEntities.named[name] {
                    return (value, cursor + 1)
                }
                break
            }
            cursor += 1
        }
        return nil
    }

    private static func readNumeric(_ chars: [Character], _ index: Int) -> (value: String, next: Int)? {
        var cursor = index + 2
        var hex = false
        if char(chars, cursor) == "x" || char(chars, cursor) == "X" {
            hex = true
            cursor += 1
        }
        let maxDigits = hex ? 6 : 7
        let start = cursor
        while cursor < chars.count, isRefDigit(chars[cursor], hex) { cursor += 1 }
        let digits = cursor - start
        if digits == 0 || char(chars, cursor) != ";" { return nil }
        if digits > maxDigits { return nil }
        var code = 0
        let base = hex ? 16 : 10
        var digitAt = start
        while digitAt < cursor {
            code = code * base + digitValue(chars[digitAt], hex)
            if code >= 0x110000 { code = 0x110000 }
            digitAt += 1
        }
        if code == 0 || (code >= 0xD800 && code <= 0xDFFF) || code >= 0x110000 {
            return ("\u{FFFD}", cursor + 1)
        }
        guard let scalar = Unicode.Scalar(UInt32(code)) else { return ("\u{FFFD}", cursor + 1) }
        return (String(scalar), cursor + 1)
    }

    private static func encodeHref(_ value: String) -> String {
        var out = ""
        for scalar in value.unicodeScalars {
            for byte in utf8Bytes(scalar.value) {
                if byte == 0x26 {
                    out.append("&")
                } else if byte == 0x27 {
                    out.append("'")
                } else if hrefSafe.contains(byte), let scalar = Unicode.Scalar(UInt32(byte)) {
                    out.append(Character(scalar))
                } else {
                    out += String(format: "%%%02X", Int(byte))
                }
            }
        }
        return out
    }

    private static func utf8Bytes(_ cp: UInt32) -> [UInt8] {
        if cp == 0xFFFE { return [0xFE] }
        if cp == 0xFFFF { return [0xFF] }
        if cp < 0x80 { return [UInt8(cp)] }
        if cp < 0x800 {
            return [UInt8(0xC0 | (cp >> 6)), UInt8(0x80 | (cp & 0x3F))]
        }
        if cp < 0x10000 {
            return [
                UInt8(0xE0 | (cp >> 12)),
                UInt8(0x80 | ((cp >> 6) & 0x3F)),
                UInt8(0x80 | (cp & 0x3F)),
            ]
        }
        return [
            UInt8(0xF0 | (cp >> 18)),
            UInt8(0x80 | ((cp >> 12) & 0x3F)),
            UInt8(0x80 | ((cp >> 6) & 0x3F)),
            UInt8(0x80 | (cp & 0x3F)),
        ]
    }

    private static func trimCmark(_ value: String) -> String {
        let chars = Array(value)
        var start = 0
        var end = chars.count
        while start < end, isTrim(chars[start]) { start += 1 }
        while end > start, isTrim(chars[end - 1]) { end -= 1 }
        return slice(chars, start, end)
    }

    private static func isTrim(_ ch: Character) -> Bool {
        ch == " " || ch == "\t" || ch == "\n" || ch == "\r"
    }

    private static func bareWouldBreak(_ body: String) -> Bool {
        if body.isEmpty { return true }
        let chars = Array(body)
        var depth = 0
        var index = 0
        while index < chars.count {
            let ch = chars[index]
            if ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "<" || ch == ">" {
                return true
            }
            if ch == "\\", index + 1 < chars.count, punct.contains(chars[index + 1]) {
                index += 2
                continue
            }
            if ch == "(" {
                depth += 1
                if depth > 32 { return true }
            } else if ch == ")" {
                if depth == 0 { return true }
                depth -= 1
            }
            index += 1
        }
        return depth != 0
    }

    private static func blockedRanges(_ chars: [Character]) -> [(start: Int, end: Int)] {
        let code = MarkdownEscape.codeSpans(in: chars)
        return merge(code + mathRanges(chars, code))
    }

    private static func mathRanges(
        _ chars: [Character],
        _ skip: [(start: Int, end: Int)]
    ) -> [(start: Int, end: Int)] {
        var ranges: [(start: Int, end: Int)] = []
        var index = 0
        while index < chars.count {
            if inRange(index, skip) {
                index += 1
                continue
            }
            if hasPrefix(chars, "\\(", at: index), let close = find(chars, "\\)", from: index + 2) {
                ranges.append((index, close + 2))
                index = close + 2
                continue
            }
            if hasPrefix(chars, "$$", at: index), let close = find(chars, "$$", from: index + 2) {
                ranges.append((index, close + 2))
                index = close + 2
                continue
            }
            index += 1
        }
        return ranges
    }

    private static func skipLinkSpace(
        _ chars: [Character],
        _ start: Int,
        _ blockedAt: (Int) -> Bool
    ) -> Int? {
        var index = start
        var newline = false
        while index < chars.count {
            if blockedAt(index) { return nil }
            let ch = chars[index]
            if ch == " " || ch == "\t" || ch == "\r" || ch == "\u{000B}" || ch == "\u{000C}" {
                index += 1
                continue
            }
            if ch == "\n" && !newline {
                newline = true
                index += 1
                continue
            }
            break
        }
        return index
    }

    private static func skipDestWs(
        _ chars: [Character],
        _ start: Int,
        _ blockedAt: (Int) -> Bool
    ) -> Int? {
        var index = start
        while char(chars, index) == " " || char(chars, index) == "\t" { index += 1 }
        if char(chars, index) != "\n" { return index }
        let nextLine = index + 1
        if nextLine >= chars.count || char(chars, nextLine) == "\n" { return nil }
        if blockedAt(nextLine) { return nil }
        var cursor = nextLine
        while char(chars, cursor) == " " || char(chars, cursor) == "\t" { cursor += 1 }
        if cursor >= chars.count || char(chars, cursor) == "\n" { return nil }
        return cursor
    }

    private static func skipSpTab(_ chars: [Character], _ start: Int) -> Int {
        var index = start
        while char(chars, index) == " " || char(chars, index) == "\t" { index += 1 }
        return index
    }

    private static func lineEnd(_ chars: [Character], _ start: Int) -> Int {
        var index = start
        while index < chars.count && chars[index] != "\n" { index += 1 }
        return index
    }

    private static func quotePrefixLength(_ line: String) -> Int {
        let chars = Array(line)
        var index = 0
        while index < chars.count {
            var cursor = index
            var spaces = 0
            while cursor < chars.count && chars[cursor] == " " && spaces < 3 {
                cursor += 1
                spaces += 1
            }
            if cursor >= chars.count || chars[cursor] != ">" { break }
            cursor += 1
            if cursor < chars.count && chars[cursor] == " " { cursor += 1 }
            index = cursor
        }
        return index
    }

    private static func validLabel(_ raw: String) -> Bool {
        let chars = Array(raw)
        if chars.isEmpty || chars.count > 999 { return false }
        var has = false
        var index = 0
        while index < chars.count {
            let ch = chars[index]
            if ch == "\\", index + 1 < chars.count {
                has = true
                index += 2
                continue
            }
            if ch == "[" || ch == "]" { return false }
            if ch != " " && ch != "\t" && ch != "\n" && ch != "\r" { has = true }
            index += 1
        }
        return has
    }

    private static func isFootnoteLabel(_ raw: String) -> Bool {
        let chars = Array(raw)
        if chars.count < 2 || chars[0] != "^" { return false }
        for ch in chars.dropFirst() where !footnoteChar.contains(ch) { return false }
        return true
    }

    private static func footnoteBracketEnd(_ chars: [Character], _ open: Int) -> Int? {
        if char(chars, open) != "[" || char(chars, open + 1) != "^" || isEscaped(chars, open) {
            return nil
        }
        var index = open + 2
        if !footnoteChar.contains(char(chars, index)) { return nil }
        while footnoteChar.contains(char(chars, index)) { index += 1 }
        if char(chars, index) != "]" { return nil }
        let after = char(chars, index + 1)
        if after == "(" || after == ":" { return nil }
        return index + 1
    }

    private static func isEscaped(_ chars: [Character], _ index: Int) -> Bool {
        var count = 0
        var cursor = index - 1
        while cursor >= 0 && chars[cursor] == "\\" {
            count += 1
            cursor -= 1
        }
        return count % 2 == 1
    }

    private static func isTitleOpen(_ ch: Character) -> Bool {
        ch == "\"" || ch == "'" || ch == "("
    }

    private static func isRefDigit(_ ch: Character, _ hex: Bool) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        if scalar >= "0" && scalar <= "9" { return true }
        if !hex { return false }
        return (scalar >= "a" && scalar <= "f") || (scalar >= "A" && scalar <= "F")
    }

    private static func digitValue(_ ch: Character, _ hex: Bool) -> Int {
        guard let scalar = ch.unicodeScalars.first else { return 0 }
        let value = Int(scalar.value)
        if value >= 48 && value <= 57 { return value - 48 }
        if !hex { return 0 }
        if value >= 65 && value <= 70 { return value - 55 }
        if value >= 97 && value <= 102 { return value - 87 }
        return 0
    }

    private static func char(_ chars: [Character], _ index: Int) -> Character {
        if index < 0 || index >= chars.count { return "\0" }
        return chars[index]
    }

    private static func slice(_ chars: [Character], _ start: Int, _ end: Int) -> String {
        if start < 0 || end < start || start > chars.count { return "" }
        return String(chars[start..<min(end, chars.count)])
    }

    private static func hasPrefix(_ chars: [Character], _ prefix: String, at index: Int) -> Bool {
        let needle = Array(prefix)
        if index < 0 || index + needle.count > chars.count { return false }
        for offset in needle.indices where chars[index + offset] != needle[offset] { return false }
        return true
    }

    private static func find(_ chars: [Character], _ needle: String, from start: Int) -> Int? {
        let target = Array(needle)
        if target.isEmpty || start < 0 { return nil }
        var index = start
        while index + target.count <= chars.count {
            var matched = true
            for offset in target.indices where chars[index + offset] != target[offset] {
                matched = false
                break
            }
            if matched { return index }
            index += 1
        }
        return nil
    }

    private static func inRange(_ index: Int, _ ranges: [(start: Int, end: Int)]) -> Bool {
        ranges.contains { index >= $0.start && index < $0.end }
    }

    private static func merge(_ ranges: [(start: Int, end: Int)]) -> [(start: Int, end: Int)] {
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
}
