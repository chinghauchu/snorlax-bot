// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

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
/// is not markdown syntax. A type 7 tag that is not on the
/// v1.75 allowlist (`x<y>`, a mid-line comment) is stashed.
/// A type 1–6 HTML block that starts a line stays raw so a
/// list or quote still ends there.
///
/// Code, angle autolinks, and link destinations stay as written.
/// Streaming (`completed: false`) returns the source unchanged.
/// Copy controls keep markdown source. This type does not write
/// the pasteboard. No animation. No new HTTP.
///
/// v1.75: a bare inline `<br>`, `<kbd>`, `<sub>`, or `<sup>`
/// (no attributes, no event handlers) renders. `<br>` becomes
/// the same hard-break token v1.41 already paints. A paired
/// `<kbd>`, `<sub>`, or `<sup>` becomes a `§§SBO` / `§§SBC`
/// token. `restoreSafeTags` paints that element after the
/// parse, so `**bold**` inside still emphasizes. An unmatched
/// opener or closer stays the characters. A tag with
/// attributes, a comment, a script, and a non-tag (`<3`,
/// `a <b c`, `<not a tag>`, `1 < 2 > 0`) stay literal text.
/// Nothing in the tag is copied onto the element.
/// Keep in lockstep with `desktop/src/markdownHtmlLiteral.ts`.
enum MarkdownHtmlLiteral {
    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        if reduceMotion { return nil }
        return nil
    }

    /// v1.75: safe inline tags never animate either.
    static func safeAnimation(reduceMotion: Bool) -> Animation? {
        if reduceMotion { return nil }
        return nil
    }

    /// The v1.41 hard-break placeholder. A bare `<br>` uses it.
    private static let safeBreak = "§§SBH§§"
    private static let wrapTags: Set<String> = ["kbd", "sub", "sup"]

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
                out.append(safeOrStash(String(chars[index..<end])))
                index = end
                continue
            }
            out.append(ch)
            index += 1
        }
        return settle(out)
    }

    /// A bare break or wrap tag becomes a render token. Every
    /// other raw tag is stashed so the characters survive.
    private static func safeOrStash(_ raw: String) -> String {
        guard let safe = classify(raw) else { return token(raw) }
        if safe.kind == "br" { return safeBreak }
        if safe.kind == "empty" {
            return safeToken("O", "<\(safe.tag)>") + safeToken("C", "</\(safe.tag)>")
        }
        if safe.kind == "open" { return safeToken("O", raw) }
        if safe.kind == "close" { return safeToken("C", raw) }
        return token(raw)
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
    static func htmlTagEnd(_ chars: [Character], _ index: Int) -> Int? {
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
        "§§SBE\(encodeHex(value))§§"
    }

    private static func safeToken(_ kind: Character, _ raw: String) -> String {
        "§§SB\(kind)\(encodeHex(raw))§§"
    }

    private static func encodeHex(_ value: String) -> String {
        var hex = ""
        for scalar in value.unicodeScalars {
            hex += String(format: "%06X", scalar.value)
        }
        return hex
    }

    private static func decodeHex(_ hex: String) -> String? {
        guard !hex.isEmpty, hex.count % 6 == 0 else { return nil }
        var out = ""
        var index = hex.startIndex
        while index < hex.endIndex {
            let end = hex.index(index, offsetBy: 6)
            let part = hex[index..<end]
            guard let cp = UInt32(part, radix: 16), let scalar = UnicodeScalar(cp) else { return nil }
            out.unicodeScalars.append(scalar)
            index = end
        }
        return out
    }

    /// `br`, `open` / `close` / `empty` plus `kbd` / `sub` / `sup`.
    /// Attributes and every other name return nil.
    private static func classify(_ raw: String) -> (kind: String, tag: String)? {
        guard raw.count >= 3, raw.first == "<", raw.last == ">" else { return nil }
        let body = String(raw.dropFirst().dropLast()).lowercased()
        if isBreakBody(body) { return ("br", "br") }
        if body.hasPrefix("/") {
            if let tag = wrapName(String(body.dropFirst())) { return ("close", tag) }
            return nil
        }
        if let tag = emptyWrap(body) { return ("empty", tag) }
        if let tag = wrapName(body) { return ("open", tag) }
        return nil
    }

    private static func isBreakBody(_ body: String) -> Bool {
        guard body.hasPrefix("br") else { return false }
        var index = body.index(body.startIndex, offsetBy: 2)
        index = skipSpace(body, index)
        if index < body.endIndex, body[index] == "/" {
            index = body.index(after: index)
            index = skipSpace(body, index)
        }
        return index == body.endIndex
    }

    private static func wrapName(_ body: String) -> String? {
        let name = readName(body)
        guard wrapTags.contains(name), !name.isEmpty else { return nil }
        let rest = String(body.dropFirst(name.count))
        if rest.contains("/") { return nil }
        return onlySpace(rest) ? name : nil
    }

    private static func emptyWrap(_ body: String) -> String? {
        let name = readName(body)
        guard wrapTags.contains(name), !name.isEmpty else { return nil }
        var index = skipSpace(body, body.index(body.startIndex, offsetBy: name.count))
        guard index < body.endIndex, body[index] == "/" else { return nil }
        index = skipSpace(body, body.index(after: index))
        return index == body.endIndex ? name : nil
    }

    private static func readName(_ body: String) -> String {
        guard let first = body.first, first >= "a", first <= "z" else { return "" }
        var index = body.index(after: body.startIndex)
        while index < body.endIndex {
            let ch = body[index]
            let ok = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch == "-"
            if !ok { break }
            index = body.index(after: index)
        }
        return String(body[body.startIndex..<index])
    }

    private static func skipSpace(_ body: String, _ index: String.Index) -> String.Index {
        var cursor = index
        while cursor < body.endIndex {
            let ch = body[cursor]
            if ch != " " && ch != "\t" && ch != "\n" { break }
            cursor = body.index(after: cursor)
        }
        return cursor
    }

    private static func onlySpace(_ body: String) -> Bool {
        skipSpace(body, body.startIndex) == body.endIndex
    }

    private struct SafeHit {
        var kind: Character
        var raw: String
        var tag: String
        var start: String.Index
        var end: String.Index
    }

    /// Pair open and close tokens. An unmatched tag is stashed as
    /// its original characters. Matched tokens stay for the parser.
    private static func settle(_ src: String) -> String {
        let hits = safeHits(src)
        if hits.isEmpty { return src }
        var matched = Set<Int>()
        var stack: [Int] = []
        for index in hits.indices {
            let hit = hits[index]
            if hit.tag.isEmpty { continue }
            if hit.kind == "O" {
                stack.append(index)
                continue
            }
            guard let top = stack.last, hits[top].tag == hit.tag else { continue }
            matched.insert(top)
            matched.insert(index)
            stack.removeLast()
        }
        var out = ""
        var cursor = src.startIndex
        for index in hits.indices {
            let hit = hits[index]
            out.append(contentsOf: src[cursor..<hit.start])
            if matched.contains(index) {
                out.append(contentsOf: src[hit.start..<hit.end])
            } else {
                out.append(token(hit.raw))
            }
            cursor = hit.end
        }
        out.append(contentsOf: src[cursor...])
        return out
    }

    private static func safeHits(_ src: String) -> [SafeHit] {
        var hits: [SafeHit] = []
        var index = src.startIndex
        while index < src.endIndex {
            if let hit = readSafeToken(src, index) {
                hits.append(hit)
                index = hit.end
                continue
            }
            index = src.index(after: index)
        }
        return hits
    }

    private static func readSafeToken(_ src: String, _ index: String.Index) -> SafeHit? {
        let marker = "§§SB"
        guard src[index...].hasPrefix(marker) else { return nil }
        var cursor = src.index(index, offsetBy: marker.count)
        guard cursor < src.endIndex else { return nil }
        let kind = src[cursor]
        guard kind == "O" || kind == "C" else { return nil }
        cursor = src.index(after: cursor)
        var hex = ""
        while cursor < src.endIndex {
            if src[cursor...].hasPrefix("§§") {
                guard hex.count >= 6, hex.count % 6 == 0, let raw = decodeHex(hex) else { return nil }
                let safe = classify(raw)
                var tag = ""
                if kind == "O", safe?.kind == "open" { tag = safe?.tag ?? "" }
                if kind == "C", safe?.kind == "close" { tag = safe?.tag ?? "" }
                let end = src.index(cursor, offsetBy: 2)
                return SafeHit(kind: kind, raw: raw, tag: tag, start: index, end: end)
            }
            let ch = src[cursor]
            guard isHexChar(ch) else { return nil }
            hex.append(ch)
            if hex.count > 240 { return nil }
            cursor = src.index(after: cursor)
        }
        return nil
    }

    private static func isHexChar(_ ch: Character) -> Bool {
        guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return false }
        return (scalar >= "0" && scalar <= "9") || (scalar >= "A" && scalar <= "F")
    }

    /// Paint paired kbd / sub / sup tokens. A bare `<br>` is already
    /// a newline from the hard-break restore. Unmatched tags are
    /// already characters. Attributes are never copied.
    static func restoreSafeTags(_ source: AttributedString) -> AttributedString {
        let raw = String(source.characters)
        guard raw.contains("§§SBO") || raw.contains("§§SBC") else { return source }
        let hits = safeHits(raw)
        guard !hits.isEmpty else { return source }
        var matched = Set<Int>()
        var stack: [Int] = []
        for index in hits.indices {
            let hit = hits[index]
            if hit.tag.isEmpty { continue }
            if hit.kind == "O" {
                stack.append(index)
                continue
            }
            guard let top = stack.last, hits[top].tag == hit.tag else { continue }
            matched.insert(top)
            matched.insert(index)
            stack.removeLast()
        }
        var parts: [(text: String, sample: AttributedString)] = []
        for run in source.runs {
            let text = String(source[run.range].characters)
            if text.isEmpty { continue }
            parts.append((text, AttributedString(source[run.range])))
        }
        var output = AttributedString()
        var active: [String] = []
        var cursor = raw.startIndex
        for index in hits.indices {
            let hit = hits[index]
            if cursor < hit.start {
                output.append(paint(slice(parts, raw, cursor, hit.start), tags: active))
            }
            if matched.contains(index) {
                if hit.kind == "O" { active.append(hit.tag) }
                else if active.last == hit.tag { active.removeLast() }
            } else {
                var literal = AttributedString(hit.raw)
                if let sample = parts.first?.sample {
                    literal = styled(hit.raw, from: sample)
                }
                output.append(paint(literal, tags: active))
            }
            cursor = hit.end
        }
        if cursor < raw.endIndex {
            output.append(paint(slice(parts, raw, cursor, raw.endIndex), tags: active))
        }
        return output
    }

    private static func slice(
        _ parts: [(text: String, sample: AttributedString)],
        _ raw: String,
        _ start: String.Index,
        _ end: String.Index
    ) -> AttributedString {
        guard start < end else { return AttributedString() }
        let startOff = raw.distance(from: raw.startIndex, to: start)
        let endOff = raw.distance(from: raw.startIndex, to: end)
        var output = AttributedString()
        var cursor = 0
        for part in parts {
            let partEnd = cursor + part.text.count
            let lo = max(cursor, startOff)
            let hi = min(partEnd, endOff)
            if lo < hi {
                let from = part.text.index(part.text.startIndex, offsetBy: lo - cursor)
                let to = part.text.index(part.text.startIndex, offsetBy: hi - cursor)
                output.append(styled(String(part.text[from..<to]), from: part.sample))
            }
            cursor = partEnd
            if cursor >= endOff { break }
        }
        return output
    }

    private static func styled(_ text: String, from sample: AttributedString) -> AttributedString {
        var piece = AttributedString(text)
        guard let run = sample.runs.first else { return piece }
        piece.inlinePresentationIntent = run.inlinePresentationIntent
        piece.presentationIntent = run.presentationIntent
        piece.foregroundColor = run.foregroundColor
        piece.backgroundColor = run.backgroundColor
        piece.font = run.font
        piece.uiKit.font = run.uiKit.font
        piece.uiKit.baselineOffset = run.uiKit.baselineOffset
        piece.link = run.link
        return piece
    }

    private static func paint(_ slice: AttributedString, tags: [String]) -> AttributedString {
        if tags.isEmpty || slice.characters.isEmpty { return slice }
        var piece = slice
        let wantKbd = tags.contains("kbd")
        var levels = 0
        var offsetSign: CGFloat = 0
        for tag in tags {
            if tag == "sub" {
                levels += 1
                offsetSign -= 1
            }
            if tag == "sup" {
                levels += 1
                offsetSign += 1
            }
        }
        var scale: CGFloat = 1
        for _ in 0..<levels { scale *= 0.75 }
        for run in piece.runs {
            let current = run.uiKit.font ?? UIFont.preferredFont(forTextStyle: .body)
            let size = max(1, current.pointSize * scale)
            let bold = current.fontDescriptor.symbolicTraits.contains(.traitBold)
            let weight: UIFont.Weight = bold ? .semibold : .regular
            let next: UIFont = wantKbd
                ? UIFont.monospacedSystemFont(ofSize: size, weight: weight)
                : UIFont.systemFont(ofSize: size, weight: weight)
            piece[run.range].uiKit.font = next
            let base = run.uiKit.baselineOffset ?? 0
            piece[run.range].uiKit.baselineOffset = base + offsetSign * current.pointSize * 0.3
            if wantKbd {
                piece[run.range].backgroundColor = Color.primary.opacity(0.08)
            }
        }
        return piece
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
