// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.52: CommonMark multi-backtick code spans on a completed
/// assistant LEFT `kind=message`.
///
/// A code span opens with a run of N backticks and closes at the
/// next run of exactly N. ``code with ` inside`` renders as inline
/// code: the delimiter backticks are not shown, and a backtick
/// inside the span is. A line ending inside the span becomes a
/// space and stays in that bubble. A blank line is a paragraph
/// break, so the span does not cross it. A line of three
/// or more backticks whose info string contains a backtick is not
/// a fence. An unmatched opener stays literal and scanning
/// continues after it. Real fences, indented code, and math stay
/// literal. Streaming is unchanged. Copy keeps markdown source.
/// No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownCodeSpan.ts`.
enum MarkdownCodeSpan {
    struct Span {
        var start: Int
        var end: Int
    }

    /// A backtick fence cannot contain a backtick in its info string.
    /// Tilde fences can.
    static func fenceInfoAllowsOpen(marker: String, info: String) -> Bool {
        if marker.hasPrefix("`"), info.contains("`") { return false }
        return true
    }

    /// Closed inline code spans outside real fences.
    static func spans(in text: String) -> [Span] {
        let chars = Array(text)
        return codeSpans(chars, skipping: fenceRanges(chars))
    }

    static func contains(_ offset: Int, _ spans: [Span]) -> Bool {
        spans.contains { offset >= $0.start && offset < $0.end }
    }

    /// v1.98: a fence that is the text of a list marker stays open
    /// until its closer. That closer may sit in the first three
    /// columns and is not a new fence.
    struct DocumentFence {
        var top: String?
        var listMarker: String?
        var listColumn = 0
    }

    enum FenceEvent {
        case none
        case topOpen
        case topInside
        case topClose
        case listOpen
        case listInside
        case listClose
        case listEnded
    }

    static func step(_ state: inout DocumentFence, _ line: String) -> FenceEvent {
        if let top = state.top {
            if closesFence(line, marker: top, contentColumn: 0) {
                state.top = nil
                return .topClose
            }
            return .topInside
        }
        if let marker = state.listMarker {
            let column = state.listColumn
            if itemEnded(line, contentColumn: column) {
                state.listMarker = nil
                _ = step(&state, line)
                return .listEnded
            }
            if closesFence(line, marker: marker, contentColumn: column) {
                state.listMarker = nil
                return .listClose
            }
            return .listInside
        }
        if let top = fenceAtMargin(line) {
            state.top = top.marker
            return .topOpen
        }
        if let list = listMarkerFence(line) {
            state.listMarker = list.marker
            state.listColumn = list.contentColumn
            return .listOpen
        }
        return .none
    }

    private static func fenceRanges(_ chars: [Character]) -> [Span] {
        let text = String(chars)
        var ranges: [Span] = []
        var state = DocumentFence()
        var openAt: Int?
        var offset = 0
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        for (index, line) in lines.enumerated() {
            let event = step(&state, line)
            let lineEnd = offset + line.count
            if event == .topOpen || event == .listOpen {
                openAt = offset
            } else if event == .topClose || event == .listClose {
                if let start = openAt { ranges.append(Span(start: start, end: lineEnd)) }
                openAt = nil
            } else if event == .listEnded {
                if let start = openAt { ranges.append(Span(start: start, end: offset)) }
                openAt = (state.top != nil || state.listMarker != nil) ? offset : nil
            }
            if index == lines.count - 1 { break }
            offset = lineEnd + 1
        }
        if let start = openAt {
            ranges.append(Span(start: start, end: chars.count))
        }
        return ranges
    }

    private static func fenceAtMargin(_ line: String) -> (marker: String, info: String)? {
        var indent = 0
        var index = line.startIndex
        while indent < 4, index < line.endIndex, line[index] == " " {
            indent += 1
            index = line.index(after: index)
        }
        if indent > 3 { return nil }
        return fenceRun(String(line[index...]))
    }

    private static func fenceRun(_ text: String) -> (marker: String, info: String)? {
        guard let first = text.first, first == "`" || first == "~" else { return nil }
        var count = 0
        var index = text.startIndex
        while index < text.endIndex, text[index] == first {
            count += 1
            index = text.index(after: index)
        }
        guard count >= 3 else { return nil }
        let marker = String(repeating: String(first), count: count)
        let info = String(text[index...])
        if !fenceInfoAllowsOpen(marker: marker, info: info) { return nil }
        return (marker, info)
    }

    private static func closesFence(
        _ line: String,
        marker: String,
        contentColumn: Int
    ) -> Bool {
        if line.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        if contentColumn > 0, leadingColumns(line).columns < contentColumn { return false }
        let body = contentColumn > 0 ? dedentColumns(line, columns: contentColumn) : line
        guard let fence = fenceAtMargin(body) else { return false }
        guard fence.marker.first == marker.first, fence.marker.count >= marker.count else {
            return false
        }
        return fence.info.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private static func itemEnded(_ line: String, contentColumn: Int) -> Bool {
        if line.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        return leadingColumns(line).columns < contentColumn
    }

    private static func listMarkerFence(_ line: String) -> (marker: String, contentColumn: Int)? {
        if isMarginThematicBreak(line) { return nil }
        let lead = leadingColumns(line)
        if lead.columns > 3 { return nil }
        let rest = String(line[lead.index...])
        var token = ""
        if let mark = rest.first, mark == "-" || mark == "+" || mark == "*" {
            token = String(mark)
        } else {
            var digits = ""
            var index = rest.startIndex
            while index < rest.endIndex, digits.count < 9, rest[index] >= "0", rest[index] <= "9" {
                digits.append(rest[index])
                index = rest.index(after: index)
            }
            guard !digits.isEmpty, index < rest.endIndex else { return nil }
            let delim = rest[index]
            guard delim == "." || delim == ")" else { return nil }
            token = digits + String(delim)
        }
        guard !token.isEmpty else { return nil }
        let after = line.index(lead.index, offsetBy: token.count)
        if after >= line.endIndex { return nil }
        let sep = line[after]
        if sep != " " && sep != "\t" { return nil }
        let padded = markerPadding(line, markerIndex: after, markerColumn: lead.columns + token.count)
        guard !padded.text.isEmpty, let fence = fenceAtMargin(padded.text) else { return nil }
        return (fence.marker, padded.contentColumn)
    }

    private static func isMarginThematicBreak(_ line: String) -> Bool {
        var index = line.startIndex
        var spaces = 0
        while index < line.endIndex, spaces < 3, line[index] == " " {
            spaces += 1
            index = line.index(after: index)
        }
        guard index < line.endIndex else { return false }
        let mark = line[index]
        guard mark == "-" || mark == "*" || mark == "_" else { return false }
        var count = 0
        var cursor = index
        while cursor < line.endIndex {
            let ch = line[cursor]
            if ch == mark {
                count += 1
            } else if ch != " " && ch != "\t" {
                return false
            }
            cursor = line.index(after: cursor)
        }
        return count >= 3
    }

    private struct ColCursor {
        var col: Int
        var index: String.Index
        var partial: Int
    }

    private static func leadingColumns(_ line: String) -> (columns: Int, index: String.Index) {
        var columns = 0
        var index = line.startIndex
        while index < line.endIndex {
            let ch = line[index]
            if ch == " " {
                columns += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                columns += 4 - (columns % 4)
                index = line.index(after: index)
                continue
            }
            break
        }
        return (columns, index)
    }

    private static func dedentColumns(_ line: String, columns: Int) -> String {
        var col = 0
        var index = line.startIndex
        while index < line.endIndex, col < columns {
            let ch = line[index]
            if ch == " " {
                col += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                let next = col + (4 - (col % 4))
                index = line.index(after: index)
                if next > columns {
                    return String(repeating: " ", count: next - columns) + line[index...]
                }
                col = next
                continue
            }
            break
        }
        return String(line[index...])
    }

    private static func markerPadding(
        _ line: String,
        markerIndex: String.Index,
        markerColumn: Int
    ) -> (contentColumn: Int, text: String) {
        let start = ColCursor(col: markerColumn, index: markerIndex, partial: 0)
        var cur = start
        var guardCount = 0
        repeat {
            let before = cur.col
            advanceColumn(line, &cur)
            if cur.col == before { break }
            guardCount += 1
        } while cur.col - start.col < 5 && isPadSpace(peekColumn(line, cur)) && guardCount < 32
        let spacesAfter = cur.col - start.col
        let blank = peekColumn(line, cur) == nil
        if spacesAfter >= 5 || spacesAfter < 1 || blank {
            var back = start
            if isPadSpace(peekColumn(line, back)) { advanceColumn(line, &back) }
            return (markerColumn + 1, blank ? "" : remainder(line, back))
        }
        return (markerColumn + spacesAfter, remainder(line, cur))
    }

    private static func advanceColumn(_ line: String, _ cur: inout ColCursor) {
        if cur.partial > 0 {
            cur.partial -= 1
            cur.col += 1
            if cur.partial == 0 { cur.index = line.index(after: cur.index) }
            return
        }
        if cur.index >= line.endIndex { return }
        let ch = line[cur.index]
        if ch == "\t" {
            let width = 4 - (cur.col % 4)
            cur.col += 1
            if width > 1 {
                cur.partial = width - 1
            } else {
                cur.index = line.index(after: cur.index)
            }
            return
        }
        cur.col += 1
        cur.index = line.index(after: cur.index)
    }

    private static func peekColumn(_ line: String, _ cur: ColCursor) -> Character? {
        if cur.partial > 0 { return "\t" }
        if cur.index >= line.endIndex { return nil }
        return line[cur.index]
    }

    private static func isPadSpace(_ ch: Character?) -> Bool {
        ch == " " || ch == "\t"
    }

    private static func remainder(_ line: String, _ cur: ColCursor) -> String {
        if cur.partial > 0 {
            let next = line.index(after: cur.index)
            return String(repeating: " ", count: cur.partial) + line[next...]
        }
        return String(line[cur.index...])
    }

    private static func codeSpans(_ chars: [Character], skipping fences: [Span]) -> [Span] {
        var ranges: [Span] = []
        var index = 0
        while index < chars.count {
            if contains(index, fences) {
                index += 1
                continue
            }
            if chars[index] != "`" {
                index += 1
                continue
            }
            var length = 1
            while index + length < chars.count, chars[index + length] == "`" { length += 1 }
            var cursor = index + length
            var matched = false
            while cursor < chars.count {
                if contains(cursor, fences) {
                    cursor += 1
                    continue
                }
                if chars[cursor] == "\n" {
                    var look = cursor + 1
                    while look < chars.count, chars[look] == " " || chars[look] == "\t" {
                        look += 1
                    }
                    if look < chars.count, chars[look] == "\n" { break }
                }
                if chars[cursor] != "`" {
                    cursor += 1
                    continue
                }
                var marks = 1
                while cursor + marks < chars.count, chars[cursor + marks] == "`" { marks += 1 }
                if marks == length {
                    ranges.append(Span(start: index, end: cursor + marks))
                    index = cursor + marks
                    matched = true
                    break
                }
                cursor += marks
            }
            if !matched { index += length }
        }
        return ranges
    }
}
