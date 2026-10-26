// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.51: CommonMark loose and tight lists on a completed assistant
/// LEFT `kind=message`.
///
/// A tight list renders with compact item spacing. A loose list — a
/// blank line between any of its items, or between two blocks of an
/// item — renders those items with paragraph spacing. Bullet, ordered,
/// and task lists follow that rule. A nested list keeps its own
/// looseness. Fences, `$$`, and indented code swallow the blank lines
/// inside them. v1.54 list padding decides which lines belong to the
/// item before looseness is classified. v1.63: that looseness also
/// sets the gap in front of a nested list. Tight is flush. Loose is
/// the paragraph gap. Streaming (`completed: false`)
/// is not loose. Copy
/// controls keep markdown source — this type does not write the
/// pasteboard. No animation. No new HTTP.
/// Keep in lockstep with `desktop/src/markdownLooseList.ts`.
enum MarkdownLooseList {
    /// Compact gap between items of a tight list.
    static let tightSpacing: CGFloat = 4
    /// Paragraph gap between items of a loose list. Matches desktop's 8px.
    static let looseSpacing: CGFloat = 8

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Item gap. Tight stays compact. Loose uses paragraph spacing.
    static func itemSpacing(loose: Bool) -> CGFloat {
        loose ? looseSpacing : tightSpacing
    }

    /// v1.63: gap before a nested block inside one list item.
    /// A tight list is flush. A loose list uses paragraph spacing,
    /// including when the blank is between sibling items. `nil` is
    /// outside a list, which keeps the 8pt block gap.
    static func blockSpacing(listLoose: Bool?) -> CGFloat {
        listLoose == false ? 0 : looseSpacing
    }

    /// Whether the list that starts this text is loose.
    /// `completed: false` is never loose. Only the first list is classified.
    static func isLoose(_ text: String, completed: Bool) -> Bool {
        if !completed || text.isEmpty { return false }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = src.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let firstLine = lines.first ?? ""
        if isThematicBreak(firstLine) { return false }
        guard let first = parseMarker(firstLine), first.column <= 3 else { return false }
        return readList(lines, first: first).loose
    }

    private struct Marker {
        var column: Int
        var ordered: Bool
        var delimiter: String
        var contentColumn: Int
        var text: String
    }

    private struct ReadList {
        var loose: Bool
        var next: Int
    }

    private struct ReadItem {
        var text: String
        var next: Int
    }

    private static func readList(_ lines: [String], first: Marker) -> ReadList {
        var loose = false
        var index = 0
        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                let next = nextNonBlank(lines, start: index)
                if next < 0 { break }
                if let sibling = parseMarker(lines[next]),
                   sameList(sibling, first),
                   sibling.column <= 3
                {
                    loose = true
                    index = next
                    continue
                }
                break
            }
            guard let marker = parseMarker(line), sameList(marker, first), marker.column <= 3 else {
                break
            }
            let item = readItem(lines, start: index, marker: marker, listMarker: first)
            if itemDirectlyLoose(item.text) { loose = true }
            index = item.next
        }
        return ReadList(loose: loose, next: index)
    }

    private static func readItem(
        _ lines: [String],
        start: Int,
        marker: Marker,
        listMarker: Marker
    ) -> ReadItem {
        var body: [String] = marker.text.isEmpty ? [] : [marker.text]
        var index = start + 1
        var fence: String?
        var inMath = false
        var sawBlank = false
        var sawContent = !marker.text.isEmpty

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
                if !sawContent { break }
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
                sawContent = true
                index += 1
                continue
            }
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                if leadingColumns(line).columns < marker.contentColumn { break }
                inMath = true
                body.append(dedent(line, columns: marker.contentColumn))
                sawContent = true
                index += 1
                continue
            }
            if let nested = parseMarker(line) {
                if nested.column >= marker.contentColumn {
                    body.append(dedent(line, columns: marker.contentColumn))
                    sawContent = true
                    index += 1
                    continue
                }
                break
            }
            if leadingColumns(line).columns >= marker.contentColumn {
                body.append(dedent(line, columns: marker.contentColumn))
                sawContent = true
                index += 1
                continue
            }
            if sawContent && !sawBlank && !interruptsList(line) {
                body.append(lazyLine(line))
                index += 1
                continue
            }
            break
        }
        return ReadItem(text: trimEdgeNewlines(body.joined(separator: "\n")), next: index)
    }

    /// A blank line between two of this item's own blocks.
    /// A nested list, fence, `$$` block, or indented code block is one block.
    private static func itemDirectlyLoose(_ text: String) -> Bool {
        if text.isEmpty || !text.contains("\n") { return false }
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var sawBlock = false
        var pendingBlank = false
        var loose = false
        var fence: String?
        var inMath = false
        var index = 0

        while index < lines.count {
            let line = lines[index]
            let gate = blockGate(line, fence: fence, inMath: inMath)
            if gate.blocked {
                if pendingBlank && sawBlock && fence == nil && !inMath { loose = true }
                fence = gate.fence
                inMath = gate.inMath
                sawBlock = true
                pendingBlank = false
                index += 1
                continue
            }
            fence = gate.fence
            inMath = gate.inMath
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                if sawBlock { pendingBlank = true }
                index += 1
                continue
            }
            if let nestedEnd = MarkdownList.listEnd(lines, start: index), nestedEnd > index {
                if pendingBlank && sawBlock { loose = true }
                sawBlock = true
                pendingBlank = false
                index = nestedEnd
                continue
            }
            if pendingBlank && leadingColumns(line).columns >= 4 {
                if sawBlock { loose = true }
                sawBlock = true
                pendingBlank = false
                index = consumeIndentedCode(lines, start: index)
                continue
            }
            if pendingBlank && sawBlock { loose = true }
            sawBlock = true
            pendingBlank = false
            index += 1
        }
        return loose
    }

    private static func consumeIndentedCode(_ lines: [String], start: Int) -> Int {
        var index = start
        while index < lines.count {
            let line = lines[index]
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                let next = nextNonBlank(lines, start: index)
                if next < 0 { break }
                if leadingColumns(lines[next]).columns >= 4 {
                    index = next
                    continue
                }
                break
            }
            if leadingColumns(line).columns >= 4 {
                index += 1
                continue
            }
            break
        }
        return index
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
        }
        var contentIndex = lead.index
        for _ in 0..<token.count {
            guard contentIndex < line.endIndex else { break }
            contentIndex = line.index(after: contentIndex)
        }
        if contentIndex < line.endIndex {
            let sep = line[contentIndex]
            if sep != " " && sep != "\t" { return nil }
        }
        let padded = MarkdownList.listMarkerPadding(
            line,
            markerIndex: contentIndex,
            markerColumn: lead.columns + token.count
        )
        return Marker(
            column: lead.columns,
            ordered: ordered,
            delimiter: delimiter,
            contentColumn: padded.contentColumn,
            text: padded.text
        )
    }

    private static func lazyLine(_ line: String) -> String {
        var index = line.startIndex
        while index < line.endIndex, line[index] == " " || line[index] == "\t" {
            index = line.index(after: index)
        }
        return String(line[index...])
    }

    private static func interruptsList(_ line: String) -> Bool {
        if isThematicBreak(line) { return true }
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        if rest.range(of: #"^#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil { return true }
        if rest.hasPrefix(">") { return true }
        if fenceOnLine(line) != nil { return true }
        if rest.trimmingCharacters(in: .whitespaces) == "$$" { return true }
        if MarkdownList.htmlBlockStarts(line) { return true }
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
        let info = String(rest[index...])
        if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) { return nil }
        return (marker, info)
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
            if fence == nil {
                if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) {
                    return (nil, inMath, false)
                }
                return (marker, inMath, true)
            }
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

private struct MarkdownListLooseKey: EnvironmentKey {
    /// nil: not inside a list item. false: tight. true: loose.
    static let defaultValue: Bool? = nil
}

extension EnvironmentValues {
    /// Looseness of the list item being drawn. Drives the gap
    /// before a nested list. A quote resets this so the quote's
    /// own blocks keep the normal 8pt gap.
    var markdownListLoose: Bool? {
        get { self[MarkdownListLooseKey.self] }
        set { self[MarkdownListLooseKey.self] = newValue }
    }
}
