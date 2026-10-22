// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v1.39: CommonMark reference-style links on a completed assistant
/// LEFT `kind=message`.
///
/// Full `[text][ref]`, collapsed `[ref][]`, and shortcut `[ref]`
/// resolve against a link reference definition anywhere in the same
/// message. Labels match case-insensitively after whitespace is
/// collapsed. Resolved links are rewritten to inline links so the
/// existing link style, long-press Open/Copy Link preview, and http(s)
/// safe-scheme rules apply. Definition lines are removed. Unresolved
/// references stay literal. `[^1]` stays a footnote. Task-list markers
/// stay markers. Fences, inline code, and math are not parsed.
/// Reference images rewrite to inline images. Streaming
/// (`completed: false`) returns the text unchanged. Copy keeps
/// markdown source. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownReferenceLink.ts`.
enum MarkdownReferenceLink {
    private struct Target {
        var dest: String
        var title: String?
    }

    private struct Span {
        var start: Int
        var end: Int
    }

    private struct ParsedDef {
        var label: String
        var dest: String
        var title: String?
        var start: Int
        var end: Int
    }

    private struct Bracket {
        var raw: String
        var next: Int
    }

    private struct LineSpan {
        var text: String
        var start: Int
        var end: Int
    }

    /// `completed: false`, or a message with no definition, returns `text`.
    static func resolve(_ text: String, completed: Bool) -> String {
        if !completed || text.isEmpty || !text.contains("[") { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let chars = Array(src)
        let blocked = protectedRanges(chars)
        let collected = collectDefinitions(chars, blocked: blocked)
        if collected.cuts.isEmpty { return text }
        let stripped = removeRanges(chars, collected.cuts)
        let resolved = applyReferences(stripped, map: collected.map, blocked: protectedRanges(stripped))
        return String(resolved)
    }

    private static func collectDefinitions(
        _ chars: [Character],
        blocked: [Span]
    ) -> (map: [String: Target], cuts: [Span]) {
        let lines = lineSpans(chars)
        let tables = tableLineSet(lines)
        var map: [String: Target] = [:]
        var cuts: [Span] = []
        var i = 0
        while i < lines.count {
            if tables.contains(i) || lineIsFootnoteOwned(lines, i) {
                i += 1
                continue
            }
            let line = lines[i]
            if rangeAt(line.start, blocked) != nil {
                i += 1
                continue
            }
            guard let parsed = parseDefinition(chars, lineStart: line.start, blocked: blocked) else {
                i += 1
                continue
            }
            var endLine = i
            while endLine < lines.count && lines[endLine].start < parsed.end { endLine += 1 }
            var bad = false
            if i < endLine {
                for k in i..<endLine where tables.contains(k) { bad = true }
            }
            if bad || overlaps(parsed.start, parsed.end, blocked) {
                i += 1
                continue
            }
            if map[parsed.label] == nil {
                map[parsed.label] = Target(dest: parsed.dest, title: parsed.title)
            }
            cuts.append(Span(start: parsed.start, end: parsed.end))
            i = max(endLine, i + 1)
        }
        return (map, cuts)
    }

    private static func parseDefinition(
        _ chars: [Character],
        lineStart: Int,
        blocked: [Span]
    ) -> ParsedDef? {
        let eol = lineEnd(chars, lineStart)
        let line = slice(chars, lineStart, eol)
        let prefix = quotePrefixLength(line)
        var i = lineStart + prefix
        var spaces = 0
        while char(chars, i) == " " && spaces < 4 {
            spaces += 1
            i += 1
        }
        if spaces >= 4 || char(chars, i) == "\t" { return nil }
        if char(chars, i) != "[" || isEscaped(chars, i) { return nil }
        if rangeAt(i, blocked) != nil { return nil }
        guard let bracket = readBracket(chars, i, blocked),
              validLabel(bracket.raw),
              !isFootnoteLabel(bracket.raw)
        else { return nil }
        var j = skipSpTab(chars, bracket.next)
        if char(chars, j) != ":" { return nil }
        j += 1
        guard let destAt = skipDestWs(chars, j, blocked),
              let dest = readDestination(chars, destAt)
        else { return nil }
        j = dest.next
        var title: String?
        if let titled = tryTitle(chars, j, blocked) {
            title = titled.title
            j = titled.next
        }
        j = skipSpTab(chars, j)
        if j < chars.count && char(chars, j) != "\n" { return nil }
        let end = j < chars.count ? j + 1 : j
        let lineLimit = eol < chars.count ? eol + 1 : eol
        if prefix > 0 && end > lineLimit { return nil }
        return ParsedDef(
            label: normalizeLabel(bracket.raw),
            dest: dest.dest,
            title: title,
            start: lineStart,
            end: end
        )
    }

    private static func applyReferences(
        _ chars: [Character],
        map: [String: Target],
        blocked: [Span]
    ) -> [Character] {
        var parts: [Character] = []
        var i = 0
        while i < chars.count {
            if let blockedAt = rangeAt(i, blocked) {
                parts.append(contentsOf: chars[i..<blockedAt.end])
                i = blockedAt.end
                continue
            }
            if char(chars, i) == "!" && char(chars, i + 1) == "[" && !isEscaped(chars, i) {
                let image = takeImage(chars, i + 1, blocked, map)
                parts.append(contentsOf: Array(image.replacement))
                i = image.next
                continue
            }
            if char(chars, i) != "[" || isEscaped(chars, i) {
                if let ch = char(chars, i) { parts.append(ch) }
                i += 1
                continue
            }
            if let footnoteEnd = footnoteBracketEnd(chars, i) {
                parts.append(contentsOf: chars[i..<footnoteEnd])
                i = footnoteEnd
                continue
            }
            guard let bracket = readBracket(chars, i, blocked) else {
                if let ch = char(chars, i) { parts.append(ch) }
                i += 1
                continue
            }
            let after = bracket.next
            if char(chars, after) == "(" {
                if let inlineEnd = skipInline(chars, after) {
                    parts.append(contentsOf: chars[i..<inlineEnd])
                    i = inlineEnd
                    continue
                }
            }
            if char(chars, after) == "[" {
                if let second = readBracket(chars, after, blocked) {
                    let collapsed = second.raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    let labelRaw = collapsed ? bracket.raw : second.raw
                    if let target = lookupLabel(map, labelRaw),
                       !(collapsed && isFootnoteLabel(bracket.raw))
                    {
                        parts.append(contentsOf: Array(emitLink(bracket.raw, target, false)))
                        i = second.next
                        continue
                    }
                }
            }
            if validLabel(bracket.raw) && !isFootnoteLabel(bracket.raw) && !isTaskMarker(chars, i) {
                if let target = lookupLabel(map, bracket.raw) {
                    parts.append(contentsOf: Array(emitLink(bracket.raw, target, false)))
                    i = bracket.next
                    continue
                }
            }
            if let ch = char(chars, i) { parts.append(ch) }
            i += 1
        }
        return parts
    }

    private static func takeImage(
        _ chars: [Character],
        _ open: Int,
        _ blocked: [Span],
        _ map: [String: Target]
    ) -> (replacement: String, next: Int) {
        let bang = open - 1
        guard let bracket = readBracket(chars, open, blocked) else {
            return (String(char(chars, bang) ?? "!"), bang + 1)
        }
        let after = bracket.next
        if char(chars, after) == "(" {
            if let inlineEnd = skipInline(chars, after) {
                return (slice(chars, bang, inlineEnd), inlineEnd)
            }
        }
        if char(chars, after) == "[" {
            if let second = readBracket(chars, after, blocked) {
                let collapsed = second.raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                let labelRaw = collapsed ? bracket.raw : second.raw
                if let target = lookupLabel(map, labelRaw),
                   !(collapsed && isFootnoteLabel(bracket.raw))
                {
                    return (emitLink(bracket.raw, target, true), second.next)
                }
                return (slice(chars, bang, second.next), second.next)
            }
        }
        if let target = lookupLabel(map, bracket.raw), !isFootnoteLabel(bracket.raw) {
            return (emitLink(bracket.raw, target, true), bracket.next)
        }
        return (slice(chars, bang, bracket.next), bracket.next)
    }

    private static func lookupLabel(_ map: [String: Target], _ raw: String) -> Target? {
        if !validLabel(raw) || isFootnoteLabel(raw) { return nil }
        return map[normalizeLabel(raw)]
    }

    private static func emitLink(_ text: String, _ target: Target, _ image: Bool) -> String {
        let dest = formatDest(target.dest)
        let body: String
        if let title = target.title {
            body = "[\(text)](\(dest) \"\(formatTitle(title))\")"
        } else {
            body = "[\(text)](\(dest))"
        }
        return image ? "!\(body)" : body
    }

    private static func formatDest(_ dest: String) -> String {
        if dest.contains(where: { $0 == " " || $0 == "\t" || $0 == "\n" || $0 == "<" || $0 == ">" || $0 == "(" || $0 == ")" }) {
            let safe = dest.replacingOccurrences(of: "<", with: "%3C").replacingOccurrences(of: ">", with: "%3E")
            return "<\(safe)>"
        }
        return dest
    }

    private static func formatTitle(_ title: String) -> String {
        title.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }

    private static func readBracket(_ chars: [Character], _ open: Int, _ blocked: [Span]) -> Bracket? {
        if char(chars, open) != "[" || isEscaped(chars, open) || rangeAt(open, blocked) != nil { return nil }
        var i = open + 1
        var depth = 1
        var raw = ""
        while i < chars.count {
            if rangeAt(i, blocked) != nil { return nil }
            let ch = chars[i]
            if ch == "\\" && i + 1 < chars.count {
                raw.append(ch)
                raw.append(chars[i + 1])
                i += 2
                continue
            }
            if ch == "[" {
                depth += 1
                raw.append(ch)
                i += 1
                continue
            }
            if ch == "]" {
                depth -= 1
                if depth == 0 { return Bracket(raw: raw, next: i + 1) }
                raw.append(ch)
                i += 1
                continue
            }
            if ch == "\n" && char(chars, i + 1) == "\n" { return nil }
            raw.append(ch)
            i += 1
        }
        return nil
    }

    private static func skipInline(_ chars: [Character], _ openParen: Int) -> Int? {
        if char(chars, openParen) != "(" { return nil }
        var j = openParen + 1
        var lineBreaks = 0
        while char(chars, j) == " " || char(chars, j) == "\t" || char(chars, j) == "\n" {
            if char(chars, j) == "\n" {
                lineBreaks += 1
                if lineBreaks > 1 || char(chars, j + 1) == "\n" { return nil }
            }
            j += 1
        }
        if char(chars, j) == ")" { return nil }
        guard let dest = readDestination(chars, j) else { return nil }
        j = dest.next
        while char(chars, j) == " " || char(chars, j) == "\t" { j += 1 }
        if char(chars, j) == "\"" || char(chars, j) == "'" || (char(chars, j) == "(" && !dest.dest.isEmpty) {
            guard let title = readTitle(chars, j) else { return nil }
            j = title.next
            while char(chars, j) == " " || char(chars, j) == "\t" { j += 1 }
        }
        if char(chars, j) != ")" { return nil }
        return j + 1
    }

    private static func readDestination(_ chars: [Character], _ i: Int) -> (dest: String, next: Int)? {
        if i >= chars.count { return nil }
        if char(chars, i) == "<" {
            var j = i + 1
            var out = ""
            while j < chars.count {
                let ch = chars[j]
                if ch == "\n" || ch == "<" || ch == " " || ch == "\t" { return nil }
                if ch == "\\" {
                    if j + 1 >= chars.count { return nil }
                    out.append(chars[j + 1])
                    j += 2
                    continue
                }
                if ch == ">" {
                    if out.isEmpty { return nil }
                    return (out, j + 1)
                }
                out.append(ch)
                j += 1
            }
            return nil
        }
        var j = i
        var out = ""
        var depth = 0
        while j < chars.count {
            let ch = chars[j]
            if ch == "\\" {
                if j + 1 >= chars.count { break }
                out.append(chars[j + 1])
                j += 2
                continue
            }
            if ch == " " || ch == "\t" || ch == "\n" || ch == "\r" { break }
            if ch.asciiValue.map({ $0 < 32 }) == true { break }
            if ch == "(" {
                depth += 1
                out.append(ch)
                j += 1
                continue
            }
            if ch == ")" {
                if depth == 0 { break }
                depth -= 1
                out.append(ch)
                j += 1
                continue
            }
            out.append(ch)
            j += 1
        }
        if out.isEmpty || depth != 0 { return nil }
        return (out, j)
    }

    private static func readTitle(_ chars: [Character], _ i: Int) -> (title: String, next: Int)? {
        guard let opener = char(chars, i) else { return nil }
        let closer: Character = opener == "(" ? ")" : opener
        if opener != "\"" && opener != "'" && opener != "(" { return nil }
        var j = i + 1
        var out = ""
        while j < chars.count {
            let ch = chars[j]
            if ch == "\n" { return nil }
            if ch == "\\" {
                if j + 1 >= chars.count { return nil }
                out.append(chars[j + 1])
                j += 2
                continue
            }
            if ch == closer { return (out, j + 1) }
            out.append(ch)
            j += 1
        }
        return nil
    }

    private static func tryTitle(
        _ chars: [Character],
        _ i: Int,
        _ blocked: [Span]
    ) -> (title: String, next: Int)? {
        guard let at = skipDestWs(chars, i, blocked), at != i else { return nil }
        let opener = char(chars, at)
        if opener != "\"" && opener != "'" && opener != "(" { return nil }
        return readTitle(chars, at)
    }

    private static func skipDestWs(_ chars: [Character], _ i: Int, _ blocked: [Span]) -> Int? {
        var j = i
        while char(chars, j) == " " || char(chars, j) == "\t" { j += 1 }
        if char(chars, j) != "\n" { return j }
        let nextLine = j + 1
        if nextLine >= chars.count || char(chars, nextLine) == "\n" { return nil }
        if rangeAt(nextLine, blocked) != nil { return nil }
        var k = nextLine
        var spaces = 0
        while char(chars, k) == " " && spaces < 3 {
            k += 1
            spaces += 1
        }
        if char(chars, k) == " " || char(chars, k) == "\t" { return nil }
        return k
    }

    private static func skipSpTab(_ chars: [Character], _ i: Int) -> Int {
        var j = i
        while char(chars, j) == " " || char(chars, j) == "\t" { j += 1 }
        return j
    }

    private static func validLabel(_ raw: String) -> Bool {
        let chars = Array(raw)
        if chars.isEmpty || chars.count > 999 { return false }
        var has = false
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            if ch == "\\" && i + 1 < chars.count {
                has = true
                i += 2
                continue
            }
            if ch == "[" || ch == "]" { return false }
            if ch != " " && ch != "\t" && ch != "\n" && ch != "\r" { has = true }
            i += 1
        }
        return has
    }

    private static func isFootnoteLabel(_ raw: String) -> Bool {
        let chars = Array(raw)
        if chars.count < 2 || chars[0] != "^" { return false }
        for ch in chars.dropFirst() {
            if !isFootnoteChar(ch) { return false }
        }
        return true
    }

    private static func isFootnoteChar(_ ch: Character) -> Bool {
        guard let value = ch.asciiValue else { return false }
        return (value >= 65 && value <= 90) || (value >= 97 && value <= 122)
            || (value >= 48 && value <= 57) || ch == "_" || ch == "-"
    }

    private static func footnoteBracketEnd(_ chars: [Character], _ open: Int) -> Int? {
        if char(chars, open) != "[" || char(chars, open + 1) != "^" || isEscaped(chars, open) { return nil }
        var j = open + 2
        if !isFootnoteChar(char(chars, j) ?? " ") { return nil }
        while j < chars.count && isFootnoteChar(chars[j]) { j += 1 }
        if char(chars, j) != "]" { return nil }
        return j + 1
    }

    private static func normalizeLabel(_ raw: String) -> String {
        var out = ""
        let chars = Array(raw)
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            if ch == "\\" && i + 1 < chars.count {
                out.append(chars[i + 1])
                i += 2
                continue
            }
            out.append(ch)
            i += 1
        }
        let parts = out.split { $0.isWhitespace }.map(String.init)
        return parts.joined(separator: " ").lowercased()
    }

    private static func isTaskMarker(_ chars: [Character], _ open: Int) -> Bool {
        var lineStart = open
        while lineStart > 0 && chars[lineStart - 1] != "\n" { lineStart -= 1 }
        let prefix = slice(chars, lineStart, open)
        let rest = String(prefix.dropFirst(quotePrefixLength(prefix)))
        let restChars = Array(rest)
        var i = 0
        var spaces = 0
        while i < restChars.count && restChars[i] == " " && spaces < 4 {
            i += 1
            spaces += 1
        }
        if spaces > 3 || i >= restChars.count { return false }
        let marker = restChars[i]
        if marker != "-" && marker != "*" && marker != "+" { return false }
        i += 1
        if i >= restChars.count || (restChars[i] != " " && restChars[i] != "\t") { return false }
        while i < restChars.count && (restChars[i] == " " || restChars[i] == "\t") { i += 1 }
        if i != restChars.count { return false }
        let mark = char(chars, open + 1)
        if mark != " " && mark != "x" && mark != "X" { return false }
        if char(chars, open + 2) != "]" { return false }
        if open + 3 >= chars.count { return true }
        let after = chars[open + 3]
        return after == " " || after == "\t" || after == "\n"
    }

    private static func quotePrefixLength(_ line: String) -> Int {
        let chars = Array(line)
        var i = 0
        while i < chars.count {
            var j = i
            var spaces = 0
            while j < chars.count && chars[j] == " " && spaces < 3 {
                j += 1
                spaces += 1
            }
            if j >= chars.count || chars[j] != ">" { break }
            j += 1
            if j < chars.count && chars[j] == " " { j += 1 }
            i = j
        }
        return i
    }

    private static func isEscaped(_ chars: [Character], _ index: Int) -> Bool {
        var slashes = 0
        var i = index - 1
        while i >= 0 && chars[i] == "\\" {
            slashes += 1
            i -= 1
        }
        return slashes % 2 == 1
    }

    private static func protectedRanges(_ chars: [Character]) -> [Span] {
        let fences = fenceRanges(chars)
        let codes = inlineCodeRanges(chars, fences)
        return mergeRanges(fences + codes + mathRanges(chars, fences + codes))
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        var ranges: [Span] = []
        var open: (marker: String, start: Int)?
        var i = 0
        while i <= chars.count {
            let end = lineEnd(chars, i)
            let line = slice(chars, i, end)
            if let fence = fenceOpen(line) {
                if open == nil {
                    open = (fence.marker, i)
                } else if let current = open,
                          fence.marker.first == current.marker.first,
                          fence.marker.count >= current.marker.count,
                          fence.info.trimmingCharacters(in: .whitespaces).isEmpty
                {
                    ranges.append(Span(start: current.start, end: end))
                    open = nil
                }
            }
            if end >= chars.count { break }
            i = end + 1
        }
        if let current = open {
            ranges.append(Span(start: current.start, end: chars.count))
        }
        return ranges
    }

    private static func fenceOpen(_ line: String) -> (marker: String, info: String)? {
        let chars = Array(line)
        var i = 0
        var spaces = 0
        while i < chars.count && chars[i] == " " && spaces < 4 {
            i += 1
            spaces += 1
        }
        if spaces > 3 || i >= chars.count { return nil }
        let mark = chars[i]
        if mark != "`" && mark != "~" { return nil }
        var count = 0
        while i < chars.count && chars[i] == mark {
            count += 1
            i += 1
        }
        if count < 3 { return nil }
        return (String(repeating: String(mark), count: count), String(chars[i...]))
    }

    private static func inlineCodeRanges(_ chars: [Character], _ fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var i = 0
        while i < chars.count {
            if rangeAt(i, fences) != nil {
                i += 1
                continue
            }
            if chars[i] != "`" {
                i += 1
                continue
            }
            var n = 1
            while i + n < chars.count && chars[i + n] == "`" { n += 1 }
            var j = i + n
            var closed = false
            while j < chars.count {
                if rangeAt(j, fences) != nil {
                    j += 1
                    continue
                }
                if chars[j] != "`" {
                    j += 1
                    continue
                }
                var m = 1
                while j + m < chars.count && chars[j + m] == "`" { m += 1 }
                if m == n {
                    ranges.append(Span(start: i, end: j + m))
                    i = j + m
                    closed = true
                    break
                }
                j += m
            }
            if !closed { i += n }
        }
        return ranges
    }

    private static func mathRanges(_ chars: [Character], _ skip: [Span]) -> [Span] {
        var ranges: [Span] = []
        let lines = lineSpans(chars)
        var open: Int?
        for line in lines {
            if rangeAt(line.start, skip) != nil {
                open = nil
                continue
            }
            let trimmed = line.text.trimmingCharacters(in: .whitespaces)
            if trimmed == "$$" {
                if open == nil {
                    open = line.start
                } else if let start = open {
                    let end = line.end < chars.count ? line.end + 1 : line.end
                    ranges.append(Span(start: start, end: end))
                    open = nil
                }
                continue
            }
            if open == nil && trimmed.hasPrefix("$$") && trimmed.hasSuffix("$$") && trimmed.count > 4 {
                let end = line.end < chars.count ? line.end + 1 : line.end
                ranges.append(Span(start: line.start, end: end))
            }
        }
        if let start = open {
            ranges.append(Span(start: start, end: chars.count))
        }
        var i = 0
        while i < chars.count {
            if rangeAt(i, skip) != nil || rangeAt(i, ranges) != nil {
                i += 1
                continue
            }
            if char(chars, i) != "\\" || char(chars, i + 1) != "(" {
                i += 1
                continue
            }
            var j = i + 2
            var closed = -1
            while j < chars.count - 1 {
                if rangeAt(j, skip) != nil {
                    j += 1
                    continue
                }
                if chars[j] == "\\" && chars[j + 1] == ")" {
                    closed = j
                    break
                }
                j += 1
            }
            if closed >= 0 {
                ranges.append(Span(start: i, end: closed + 2))
                i = closed + 2
                continue
            }
            ranges.append(Span(start: i, end: chars.count))
            break
        }
        return ranges
    }

    private static func tableLineSet(_ lines: [LineSpan]) -> Set<Int> {
        var inTable = Set<Int>()
        var fence: String?
        var inMath = false
        var i = 0
        while i < lines.count {
            let gate = blockGate(lines[i].text, fence, inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                i += 1
                continue
            }
            let end = tableEnd(lines, i)
            if end > i {
                for k in i..<end { inTable.insert(k) }
                i = end
                continue
            }
            i += 1
        }
        return inTable
    }

    private static func tableEnd(_ lines: [LineSpan], _ start: Int) -> Int {
        MarkdownTable.lineEnd(lines.map(\.text), start: start)
    }

    private static func blockGate(
        _ line: String,
        _ fence: String?,
        _ inMath: Bool
    ) -> (fence: String?, inMath: Bool, blocked: Bool) {
        if !inMath, let match = fenceOpen(line) {
            if fence == nil { return (match.marker, inMath, true) }
            let same = match.marker.first == fence?.first
                && match.marker.count >= (fence?.count ?? 0)
                && match.info.trimmingCharacters(in: .whitespaces).isEmpty
            return (same ? nil : fence, inMath, true)
        }
        if fence != nil { return (fence, inMath, true) }
        if line.trimmingCharacters(in: .whitespaces) == "$$" { return (fence, !inMath, true) }
        if inMath { return (fence, inMath, true) }
        return (fence, inMath, false)
    }

    private static func lineIsFootnoteOwned(_ lines: [LineSpan], _ index: Int) -> Bool {
        if indentColumns(lines[index].text) < 1 { return false }
        if index == 0 { return false }
        for j in stride(from: index - 1, through: 0, by: -1) {
            let text = lines[j].text
            if text.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            if text.range(of: #"^ {0,3}\[\^[A-Za-z0-9_-]+\]:"#, options: .regularExpression) != nil {
                return true
            }
            if indentColumns(text) >= 2 { continue }
            return false
        }
        return false
    }

    private static func indentColumns(_ line: String) -> Int {
        var columns = 0
        for ch in line {
            if ch == " " { columns += 1 }
            else if ch == "\t" { columns += 4 }
            else { break }
        }
        return columns
    }

    private static func overlaps(_ start: Int, _ end: Int, _ ranges: [Span]) -> Bool {
        ranges.contains { start < $0.end && end > $0.start }
    }

    private static func rangeAt(_ index: Int, _ ranges: [Span]) -> Span? {
        ranges.first { index >= $0.start && index < $0.end }
    }

    private static func mergeRanges(_ ranges: [Span]) -> [Span] {
        let sorted = ranges.filter { $0.end > $0.start }.sorted {
            $0.start == $1.start ? $0.end < $1.end : $0.start < $1.start
        }
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

    private static func removeRanges(_ chars: [Character], _ cuts: [Span]) -> [Character] {
        let sorted = cuts.sorted { $0.start < $1.start }
        var out: [Character] = []
        var cursor = 0
        for cut in sorted {
            if cut.start < cursor { continue }
            if cut.start > cursor { out.append(contentsOf: chars[cursor..<cut.start]) }
            cursor = max(cursor, cut.end)
        }
        if cursor < chars.count { out.append(contentsOf: chars[cursor...]) }
        return out
    }

    private static func lineSpans(_ chars: [Character]) -> [LineSpan] {
        var spans: [LineSpan] = []
        var i = 0
        while i <= chars.count {
            let end = lineEnd(chars, i)
            spans.append(LineSpan(text: slice(chars, i, end), start: i, end: end))
            if end >= chars.count { break }
            i = end + 1
        }
        return spans
    }

    private static func lineEnd(_ chars: [Character], _ index: Int) -> Int {
        var i = index
        while i < chars.count && chars[i] != "\n" { i += 1 }
        return i
    }

    private static func char(_ chars: [Character], _ index: Int) -> Character? {
        index >= 0 && index < chars.count ? chars[index] : nil
    }

    private static func slice(_ chars: [Character], _ start: Int, _ end: Int) -> String {
        let lo = max(0, min(start, chars.count))
        let hi = max(lo, min(end, chars.count))
        if lo >= hi { return "" }
        return String(chars[lo..<hi])
    }
}
