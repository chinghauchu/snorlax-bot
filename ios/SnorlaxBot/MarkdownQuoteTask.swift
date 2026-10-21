// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v1.32: GFM blockquotes and task lists on completed assistant
/// LEFT `kind=message`. A quote line (`>` / nested `>>`) renders
/// with a muted left rule and indent. `- [ ]` / `- [x]` render as
/// read-only checkbox glyphs; checked items are muted.
/// v1.47: CommonMark lazy continuation of a blockquote. A non-blank
/// line that continues an open quote paragraph, and does not
/// itself start a list, an ATX heading, a fence, a thematic
/// break, or a `$$` block, stays inside that quote. A blank line
/// ends it. Nested quotes keep the continuation. A margin list,
/// heading, fence, or rule ends the quote.
/// v1.49: a task item keeps the lines indented to its text.
/// The text column is the column after the bullet, so two spaces
/// under `- [ ]` stay in the item and a nested task renders
/// inside it. A margin line ends the item. Streaming stays the
/// markdown string. Copy controls keep markdown source — this
/// type only splits text for display and does not write the
/// pasteboard. No animation. No new HTTP.
/// v1.51: a task list is loose or tight by the CommonMark rule.
/// Keep in lockstep with `desktop/src/markdownQuoteTask.ts`.
enum MarkdownQuoteTask {
    /// Empty ballot box. Not a control.
    static let uncheckedGlyph = "☐"
    /// Ballot box with check. Not a control.
    static let checkedGlyph = "☑"
    static let uncheckedLabel = "Unchecked"
    static let checkedLabel = "Checked"

    struct TaskItem: Equatable {
        var checked: Bool
        /// Text after the marker. Markers themselves are not included.
        var text: String
    }

    enum Block: Equatable {
        case markdown(String)
        case quote(String)
        /// `loose` follows CommonMark: a blank between items, or between
        /// an item's own blocks, loosens the whole task list.
        case tasks([TaskItem], loose: Bool)
    }

    static func glyph(checked: Bool) -> String {
        checked ? checkedGlyph : uncheckedGlyph
    }

    static func glyphLabel(checked: Bool) -> String {
        checked ? checkedLabel : uncheckedLabel
    }

    /// Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
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
            let chunk = lines[mdStart..<end].joined(separator: "\n")
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
            if stripQuoteMarker(line) != nil {
                let start = index
                var inner: [String] = []
                var open = false
                while index < lines.count {
                    let current = lines[index]
                    if let stripped = stripQuoteMarker(current) {
                        inner.append(stripped)
                        open = paragraphOpenAfter(stripped, wasOpen: open)
                        index += 1
                        continue
                    }
                    // v1.47: a paragraph inside the quote may continue without `>`.
                    if !open || endsLazyQuote(current, paragraphOpen: open) { break }
                    inner.append(current)
                    open = true
                    index += 1
                }
                pushMarkdown(start)
                blocks.append(.quote(inner.joined(separator: "\n")))
                mdStart = index
                continue
            }
            if let task = parseTaskMarker(line), task.column <= 3 {
                let start = index
                var items: [TaskItem] = []
                while index < lines.count {
                    let current = lines[index]
                    if isBlank(current) {
                        let next = nextNonBlank(lines, start: index + 1)
                        let sibling = next >= 0 ? parseTaskMarker(lines[next]) : nil
                        if let sibling, sibling.column <= 3 {
                            index = next
                            continue
                        }
                        break
                    }
                    guard let next = parseTaskMarker(current), next.column <= 3 else { break }
                    let item = readTaskItem(lines, start: index, marker: next)
                    items.append(item.task)
                    index = item.next
                }
                pushMarkdown(start)
                let slice = lines[start..<index].joined(separator: "\n")
                blocks.append(.tasks(items, loose: MarkdownLooseList.isLoose(slice, completed: true)))
                mdStart = index
                continue
            }
            index += 1
        }
        pushMarkdown(lines.count)
        if blocks.isEmpty { return [.markdown(src)] }
        return blocks
    }

    /// One CommonMark quote marker, or nil when the line is not a quote.
    static func stripQuoteMarker(_ line: String) -> String? {
        var i = line.startIndex
        var spaces = 0
        while i < line.endIndex, spaces < 3, line[i] == " " {
            i = line.index(after: i)
            spaces += 1
        }
        guard i < line.endIndex, line[i] == ">" else { return nil }
        i = line.index(after: i)
        if i < line.endIndex, line[i] == " " {
            i = line.index(after: i)
        }
        return String(line[i...])
    }

    /// A GFM task item. `- [x]done` (no space after the marker) is nil.
    static func parseTaskLine(_ line: String) -> TaskItem? {
        var i = line.startIndex
        var spaces = 0
        while i < line.endIndex, spaces < 3, line[i] == " " {
            i = line.index(after: i)
            spaces += 1
        }
        guard i < line.endIndex else { return nil }
        let marker = line[i]
        guard marker == "-" || marker == "*" || marker == "+" else { return nil }
        i = line.index(after: i)
        guard i < line.endIndex, line[i] == " " || line[i] == "\t" else { return nil }
        while i < line.endIndex, line[i] == " " || line[i] == "\t" {
            i = line.index(after: i)
        }
        guard i < line.endIndex, line[i] == "[" else { return nil }
        i = line.index(after: i)
        guard i < line.endIndex else { return nil }
        let mark = line[i]
        guard mark == " " || mark == "x" || mark == "X" else { return nil }
        i = line.index(after: i)
        guard i < line.endIndex, line[i] == "]" else { return nil }
        i = line.index(after: i)
        if i >= line.endIndex {
            return TaskItem(checked: mark != " ", text: "")
        }
        guard line[i] == " " || line[i] == "\t" else { return nil }
        while i < line.endIndex, line[i] == " " || line[i] == "\t" {
            i = line.index(after: i)
        }
        return TaskItem(checked: mark != " ", text: String(line[i...]))
    }

    private struct TaskMarker {
        var checked: Bool
        var text: String
        /// Columns before the bullet. A margin task is 0–3.
        var column: Int
        /// Column where the item text begins, immediately after `- `.
        var contentColumn: Int
    }

    /// The content column is the CommonMark list column after the
    /// bullet, not the column after the checkbox, so `  more`
    /// continues `- [ ] item`.
    private static func parseTaskMarker(_ line: String) -> TaskMarker? {
        guard let task = parseTaskLine(line) else { return nil }
        let lead = leadingColumns(line)
        if lead.columns > 3 { return nil }
        let contentColumn = bulletContentColumn(line, lead: lead)
        if contentColumn <= lead.columns { return nil }
        return TaskMarker(
            checked: task.checked,
            text: task.text,
            column: lead.columns,
            contentColumn: contentColumn
        )
    }

    private static func bulletContentColumn(
        _ line: String,
        lead: (columns: Int, index: String.Index)
    ) -> Int {
        let afterMarker = lead.columns + 1
        let sepIndex = line.index(after: lead.index)
        if sepIndex >= line.endIndex { return afterMarker + 1 }
        let sep = line[sepIndex]
        if sep == " " { return afterMarker + 1 }
        if sep == "\t" { return afterMarker + (4 - (afterMarker % 4)) }
        return afterMarker + 1
    }

    /// One task item plus every following line that belongs to it.
    /// Indented lines, including a nested task, stay in `text` and
    /// are dedented so the item body parses again.
    private static func readTaskItem(
        _ lines: [String],
        start: Int,
        marker: TaskMarker
    ) -> (task: TaskItem, next: Int) {
        var body: [String] = [marker.text]
        var index = start + 1
        var fence: String?
        var inMath = false

        while index < lines.count {
            let line = lines[index]
            if let open = fence {
                body.append(dedentLine(line, columns: marker.contentColumn))
                if let opened = fenceMark(line),
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
                body.append(dedentLine(line, columns: marker.contentColumn))
                if line.trimmingCharacters(in: .whitespaces) == "$$" { inMath = false }
                index += 1
                continue
            }
            if isBlank(line) {
                let next = nextNonBlank(lines, start: index + 1)
                if next < 0 { break }
                let upcoming = lines[next]
                if leadingColumns(upcoming).columns >= marker.contentColumn {
                    body.append("")
                    index += 1
                    continue
                }
                break
            }
            if leadingColumns(line).columns < marker.contentColumn { break }
            if let opened = fenceMark(line) {
                fence = opened.marker
                body.append(dedentLine(line, columns: marker.contentColumn))
                index += 1
                continue
            }
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                inMath = true
                body.append(dedentLine(line, columns: marker.contentColumn))
                index += 1
                continue
            }
            body.append(dedentLine(line, columns: marker.contentColumn))
            index += 1
        }
        return (
            TaskItem(checked: marker.checked, text: trimEdgeNewlines(body.joined(separator: "\n"))),
            index
        )
    }

    private static func fenceMark(_ line: String) -> (marker: String, info: String)? {
        let lead = leadingColumns(line)
        var index = lead.index
        guard index < line.endIndex else { return nil }
        let mark = line[index]
        guard mark == "`" || mark == "~" else { return nil }
        var count = 0
        while index < line.endIndex, line[index] == mark {
            count += 1
            index = line.index(after: index)
        }
        if count < 3 { return nil }
        return (String(repeating: String(mark), count: count), String(line[index...]))
    }

    private static func dedentLine(_ line: String, columns: Int) -> String {
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
        var result = text
        while result.first == "\n" { result.removeFirst() }
        while result.last == "\n" { result.removeLast() }
        return result
    }

    private static func nextNonBlank(_ lines: [String], start: Int) -> Int {
        var index = start
        while index < lines.count {
            if !isBlank(lines[index]) { return index }
            index += 1
        }
        return -1
    }

    /// A quote paragraph stays open after this stripped quote line.
    private static func paragraphOpenAfter(_ stripped: String, wasOpen: Bool) -> Bool {
        let content = innermostQuote(stripped)
        if isBlank(content) || isMathFence(content) { return false }
        if isThematicBreak(content) || isAtxHeading(content) || isFenceLine(content) {
            return false
        }
        if isMarginListMarker(content) { return listItemOpensParagraph(content) }
        if !wasOpen && isIndentedCodeLine(content) { return false }
        return true
    }

    /// Peel one quote marker at a time until the line is not a quote.
    private static func innermostQuote(_ line: String) -> String {
        var current = line
        while let next = stripQuoteMarker(current) {
            current = next
        }
        return current
    }

    /// This line closes the quote instead of joining it.
    private static func endsLazyQuote(_ line: String, paragraphOpen: Bool) -> Bool {
        if isBlank(line) || isMathFence(line) { return true }
        if isThematicBreak(line) || isAtxHeading(line) || isFenceLine(line) || isMarginListMarker(line) {
            return true
        }
        if !paragraphOpen && isIndentedCodeLine(line) { return true }
        return false
    }

    private static func isBlank(_ line: String) -> Bool {
        for ch in line {
            if ch != " " && ch != "\t" { return false }
        }
        return true
    }

    private static func isMathFence(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces) == "$$"
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

    private static func isThematicBreak(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        guard lead.index < line.endIndex else { return false }
        let mark = line[lead.index]
        guard mark == "-" || mark == "*" || mark == "_" else { return false }
        var count = 0
        var index = lead.index
        while index < line.endIndex {
            let ch = line[index]
            if ch == mark {
                count += 1
            } else if ch != " " && ch != "\t" {
                return false
            }
            index = line.index(after: index)
        }
        return count >= 3
    }

    private static func isAtxHeading(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        var index = lead.index
        var hashes = 0
        while index < line.endIndex, line[index] == "#", hashes < 7 {
            hashes += 1
            index = line.index(after: index)
        }
        if hashes < 1 || hashes > 6 { return false }
        if index == line.endIndex { return true }
        let next = line[index]
        return next == " " || next == "\t"
    }

    private static func isFenceLine(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        guard lead.index < line.endIndex else { return false }
        let mark = line[lead.index]
        guard mark == "`" || mark == "~" else { return false }
        var count = 0
        var index = lead.index
        while index < line.endIndex, line[index] == mark {
            count += 1
            index = line.index(after: index)
        }
        return count >= 3
    }

    private static func isIndentedCodeLine(_ line: String) -> Bool {
        if isBlank(line) { return false }
        return leadingColumns(line).columns >= 4
    }

    private static func isMarginListMarker(_ line: String) -> Bool {
        listMarkerLength(line) > 0
    }

    private static func listItemOpensParagraph(_ line: String) -> Bool {
        let marker = listMarkerLength(line)
        if marker <= 0 { return false }
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        let after = rest.dropFirst(marker)
        let trimmed = after.drop(while: { $0 == " " || $0 == "\t" })
        return !trimmed.isEmpty
    }

    private static func isAsciiDigit(_ ch: Character) -> Bool {
        ch >= "0" && ch <= "9"
    }

    private static func listMarkerLength(_ line: String) -> Int {
        let lead = leadingColumns(line)
        if lead.columns >= 4 { return 0 }
        let rest = String(line[lead.index...])
        guard let first = rest.first else { return 0 }
        if first == "-" || first == "*" || first == "+" {
            if rest.count == 1 { return 1 }
            let next = rest[rest.index(after: rest.startIndex)]
            return next == " " || next == "\t" ? 1 : 0
        }
        var index = rest.startIndex
        var digits = 0
        while index < rest.endIndex, isAsciiDigit(rest[index]), digits < 9 {
            digits += 1
            index = rest.index(after: index)
        }
        if digits == 0 || index == rest.endIndex { return 0 }
        let delimiter = rest[index]
        guard delimiter == "." || delimiter == ")" else { return 0 }
        let markerEnd = rest.index(after: index)
        let length = digits + 1
        if markerEnd == rest.endIndex { return length }
        let next = rest[markerEnd]
        return next == " " || next == "\t" ? length : 0
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
