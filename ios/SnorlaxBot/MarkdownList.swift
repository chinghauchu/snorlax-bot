// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.36: ordered-list start numbers and nested lists on a
/// completed assistant LEFT `kind=message`.
///
/// Desktop react-markdown already keeps `<ol start>` and nested
/// lists. iOS draws the reply in a text view, which drops those
/// markers. This parser follows the same CommonMark rules: the
/// first marker's number is the start, later items in that list
/// count up, a paragraph or fence ends the list, and an indented
/// `-` or `1.` under an item is a nested list. Streaming
/// (`completed: false`) returns the text unchanged. Copy controls
/// keep markdown source — this type only splits text for display
/// and does not write the pasteboard. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownList.ts`.
enum MarkdownList {
    struct Group: Equatable {
        var ordered: Bool
        /// First marker's number. Bullets use 1 and ignore it.
        var start: Int
        /// `.` or `)` for an ordered list. Bullets use "".
        var delimiter: String
        var items: [String]
        /// CommonMark loose list. Tight lists stay compact.
        var loose: Bool
    }

    enum Block: Equatable {
        case markdown(String)
        case list(Group)
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Visible marker. Ordered lists count up from `start`.
    static func marker(ordered: Bool, start: Int, index: Int, depth: Int) -> String {
        if ordered { return "\(start + index)." }
        if depth <= 0 { return "•" }
        if depth == 1 { return "◦" }
        return "▪"
    }

    /// Accessible name for the marker. Ordered lists speak the number.
    static func markerLabel(ordered: Bool, start: Int, index: Int, depth: Int) -> String {
        if ordered { return marker(ordered: true, start: start, index: index, depth: depth) }
        return "Bullet"
    }

    /// Index just after a top-level list that starts at `start`.
    /// The span includes a loose continuation so a blank line inside
    /// the list stays with it. Nil when that line is not a margin marker.
    /// Does not classify looseness.
    static func listEnd(_ lines: [String], start: Int) -> Int? {
        guard start >= 0, start < lines.count else { return nil }
        let line = lines[start]
        if isThematicBreak(line) { return nil }
        guard let marker = parseMarker(line), marker.column <= 3 else { return nil }
        return readList(lines, start: start, first: marker, classify: false).next
    }

    /// `completed: false` returns the text unchanged.
    static func split(_ text: String, completed: Bool) -> [Block] {
        if text.isEmpty { return [] }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        if !completed { return [.markdown(src)] }

        let lines = src.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var blocks: [Block] = []
        var mdStart = 0
        var index = 0
        var fence: String?
        var inMath = false

        func pushMarkdown(_ end: Int) {
            guard end > mdStart else { return }
            let chunk = trimEdgeNewlines(lines[mdStart..<end].joined(separator: "\n"))
            if !chunk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                blocks.append(.markdown(chunk))
            }
        }

        while index < lines.count {
            let line = lines[index]
            let gate = blockGate(line, fence: fence, inMath: inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                index += 1
                continue
            }
            if let marker = parseMarker(line), marker.column <= 3 {
                let found = readList(lines, start: index, first: marker)
                pushMarkdown(index)
                blocks.append(.list(found.group))
                index = found.next
                mdStart = index
                continue
            }
            index += 1
        }
        pushMarkdown(lines.count)
        if blocks.isEmpty { return [.markdown(src)] }
        return blocks
    }

    private struct Marker {
        var column: Int
        var ordered: Bool
        var delimiter: String
        var number: Int
        var contentColumn: Int
        var text: String
    }

    private struct ReadList {
        var group: Group
        var next: Int
    }

    private struct ReadItem {
        var text: String
        var next: Int
    }

    private static func readList(
        _ lines: [String],
        start: Int,
        first: Marker,
        classify: Bool = true
    ) -> ReadList {
        var items: [String] = []
        var index = start
        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                let next = nextNonBlank(lines, start: index)
                if next < 0 { break }
                if let sibling = parseMarker(lines[next]),
                   sameList(sibling, first),
                   sibling.column <= 3
                {
                    index = next
                    continue
                }
                break
            }
            guard let marker = parseMarker(line), sameList(marker, first), marker.column <= 3 else {
                break
            }
            let item = readItem(lines, start: index, marker: marker, listMarker: first)
            items.append(item.text)
            index = item.next
        }
        let slice = lines[start..<index].joined(separator: "\n")
        let loose = classify && MarkdownLooseList.isLoose(slice, completed: true)
        return ReadList(
            group: Group(
                ordered: first.ordered,
                start: first.number,
                delimiter: first.delimiter,
                items: items,
                loose: loose
            ),
            next: index
        )
    }

    private static func readItem(
        _ lines: [String],
        start: Int,
        marker: Marker,
        listMarker: Marker
    ) -> ReadItem {
        var body: [String] = [marker.text]
        var index = start + 1
        var fence: String?
        var inMath = false
        var sawBlank = false

        while index < lines.count {
            let line = lines[index]
            if let open = fence {
                body.append(dedent(line, columns: marker.contentColumn))
                if let opened = fenceOnLine(line),
                   opened.marker.first == open.first,
                   opened.marker.count >= open.count,
                   opened.info.trimmingCharacters(in: .whitespaces).isEmpty
                {
                    fence = nil
                }
                index += 1
                continue
            }
            if inMath {
                body.append(dedent(line, columns: marker.contentColumn))
                if line.trimmingCharacters(in: .whitespaces) == "$$" { inMath = false }
                index += 1
                continue
            }
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                let next = nextNonBlank(lines, start: index)
                if next < 0 { break }
                let upcoming = lines[next]
                if let sibling = parseMarker(upcoming),
                   sameList(sibling, listMarker),
                   sibling.column <= 3,
                   sibling.column < marker.contentColumn
                {
                    break
                }
                if leadingColumns(upcoming).columns >= marker.contentColumn {
                    body.append("")
                    sawBlank = true
                    index += 1
                    continue
                }
                break
            }
            if let opened = fenceOnLine(line) {
                if leadingColumns(line).columns < marker.contentColumn { break }
                fence = opened.marker
                body.append(dedent(line, columns: marker.contentColumn))
                index += 1
                continue
            }
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                if leadingColumns(line).columns < marker.contentColumn { break }
                inMath = true
                body.append(dedent(line, columns: marker.contentColumn))
                index += 1
                continue
            }
            if let nested = parseMarker(line) {
                if nested.column >= marker.contentColumn {
                    body.append(dedent(line, columns: marker.contentColumn))
                    index += 1
                    continue
                }
                if nested.column < marker.contentColumn { break }
            }
            if leadingColumns(line).columns >= marker.contentColumn {
                body.append(dedent(line, columns: marker.contentColumn))
                index += 1
                continue
            }
            if !sawBlank && !interruptsList(line) {
                body.append(line)
                index += 1
                continue
            }
            break
        }
        return ReadItem(text: trimEdgeNewlines(body.joined(separator: "\n")), next: index)
    }

    private static func sameList(_ marker: Marker, _ first: Marker) -> Bool {
        marker.ordered == first.ordered && marker.delimiter == first.delimiter
    }

    private static func parseMarker(_ line: String) -> Marker? {
        if isThematicBreak(line) { return nil }
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        var ordered = false
        var delimiter = ""
        var number = 1
        var token = ""
        if let bullet = rest.first, bullet == "-" || bullet == "+" || bullet == "*" {
            token = String(bullet)
        } else {
            var digits = ""
            var idx = rest.startIndex
            while idx < rest.endIndex, digits.count < 9, isDigit(rest[idx]) {
                digits.append(rest[idx])
                idx = rest.index(after: idx)
            }
            guard !digits.isEmpty, idx < rest.endIndex else { return nil }
            let delim = rest[idx]
            guard delim == "." || delim == ")" else { return nil }
            token = digits + String(delim)
            ordered = true
            delimiter = String(delim)
            number = Int(digits) ?? 1
        }
        var contentIndex = lead.index
        for _ in 0..<token.count {
            guard contentIndex < line.endIndex else { break }
            contentIndex = line.index(after: contentIndex)
        }
        var contentColumn = lead.columns + token.count
        if contentIndex < line.endIndex {
            let sep = line[contentIndex]
            if sep != " " && sep != "\t" { return nil }
            if sep == " " {
                contentColumn += 1
                contentIndex = line.index(after: contentIndex)
            } else {
                contentColumn += 4 - (contentColumn % 4)
                contentIndex = line.index(after: contentIndex)
            }
        } else {
            contentColumn += 1
        }
        return Marker(
            column: lead.columns,
            ordered: ordered,
            delimiter: delimiter,
            number: number,
            contentColumn: contentColumn,
            text: String(line[contentIndex...])
        )
    }

    private static func interruptsList(_ line: String) -> Bool {
        if isThematicBreak(line) { return true }
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        if rest.range(of: #"^#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil { return true }
        if rest.hasPrefix(">") { return true }
        if fenceOnLine(line) != nil { return true }
        if rest.trimmingCharacters(in: .whitespaces) == "$$" { return true }
        return false
    }

    private static func isThematicBreak(_ line: String) -> Bool {
        var index = line.startIndex
        var spaces = 0
        while index < line.endIndex, spaces < 3, line[index] == " " {
            index = line.index(after: index)
            spaces += 1
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

    private static func fenceOnLine(_ line: String) -> (marker: String, info: String)? {
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        guard let first = rest.first, first == "`" || first == "~" else { return nil }
        var count = 0
        var index = rest.startIndex
        while index < rest.endIndex, rest[index] == first {
            count += 1
            index = rest.index(after: index)
        }
        guard count >= 3 else { return nil }
        let marker = String(repeating: String(first), count: count)
        return (marker, String(rest[index...]))
    }

    private static func isDigit(_ ch: Character) -> Bool {
        ch >= "0" && ch <= "9"
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

    private static func dedent(_ line: String, columns: Int) -> String {
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
                    return String(repeating: " ", count: next - columns) + String(line[index...])
                }
                col = next
                continue
            }
            break
        }
        return String(line[index...])
    }

    private static func trimEdgeNewlines(_ text: String) -> String {
        var chunk = text
        while chunk.hasPrefix("\n") { chunk.removeFirst() }
        while chunk.hasSuffix("\n") { chunk.removeLast() }
        return chunk
    }

    private static func nextNonBlank(_ lines: [String], start: Int) -> Int {
        var index = start
        while index < lines.count {
            if !lines[index].trimmingCharacters(in: .whitespaces).isEmpty { return index }
            index += 1
        }
        return -1
    }

    private static func blockGate(
        _ line: String,
        fence: String?,
        inMath: Bool
    ) -> (fence: String?, inMath: Bool, blocked: Bool) {
        if !inMath, let match = line.range(of: #"^( {0,3})(`{3,}|~{3,})(.*)$"#, options: .regularExpression) {
            let body = String(line[match])
            guard let markerRange = body.range(of: #"[`~]{3,}"#, options: .regularExpression) else {
                return (fence, inMath, true)
            }
            let marker = String(body[markerRange])
            let info = String(body[markerRange.upperBound...])
            if fence == nil { return (marker, inMath, true) }
            if let open = fence,
               marker.first == open.first,
               marker.count >= open.count,
               info.trimmingCharacters(in: .whitespaces).isEmpty
            {
                return (nil, inMath, true)
            }
            return (fence, inMath, true)
        }
        if fence != nil { return (fence, inMath, true) }
        if line.trimmingCharacters(in: .whitespaces) == "$$" {
            return (fence, !inMath, true)
        }
        if inMath { return (fence, inMath, true) }
        return (fence, inMath, false)
    }
}

private struct MarkdownListDepthKey: EnvironmentKey {
    static let defaultValue = 0
}

extension EnvironmentValues {
    /// Nesting depth of the list being drawn. 0 is the outermost list.
    var markdownListDepth: Int {
        get { self[MarkdownListDepthKey.self] }
        set { self[MarkdownListDepthKey.self] = newValue }
    }
}
