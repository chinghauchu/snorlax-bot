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
/// v1.58: a CommonMark HTML block of types 1–6 ends the quote
/// before the tag line. A type 7 tag such as `<br>` stays in the
/// quote and ends further lazy lines.
/// v1.49: a task item keeps the lines indented to its text.
/// The text column is the column after the bullet, so two spaces
/// under `- [ ]` stay in the item and a nested task renders
/// inside it. A margin line ends the item. Streaming stays the
/// markdown string. Copy controls keep markdown source — this
/// type only splits text for display and does not write the
/// pasteboard. No animation. No new HTTP.
/// v1.51: a task list is loose or tight by the CommonMark rule.
/// v1.59: an ordered list (`1.` / `1)`) is not a bullet task list.
/// Its lines, including a nested `- [ ]`, stay in the markdown so
/// the ordered item can show its own checkbox. Margin `- [ ]` /
/// `* [x]` still extract here.
/// v1.73: a blockquote keeps cmark-gfm tab stops. The optional
/// column after `>` can eat part of a tab. The leftover columns
/// decide indented code, so `>\t\tfoo` is code whose text is two
/// spaces then `foo`. A tab that crosses the code indent becomes
/// the leftover spaces, and a later tab stays a tab. A line that
/// continues an open paragraph is not code. A fence stays a fence.
/// v1.89: a tab partly consumed by `>` is one byte of fence indent.
/// The leftover columns stay spaces in the code. A space-only
/// fence is unchanged. Streaming stays plain text.
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
                var carry = QuoteCarry()
                while index < lines.count {
                    let current = lines[index]
                    if let rendered = renderQuoteLine(current, carry: carry, paragraphOpen: open) {
                        inner.append(rendered.text)
                        carry = rendered.carry
                        // v1.86: a table is not a paragraph. A later line
                        // with no `>` does not continue the quote.
                        if carry.fence != nil {
                            open = false
                        } else if MarkdownTable.quoteLineInTable(inner, index: inner.count - 1) {
                            open = false
                        } else {
                            open = paragraphOpenAfter(rendered.text, wasOpen: open)
                        }
                        index += 1
                        continue
                    }
                    // v1.47: a paragraph inside the quote may continue without `>`.
                    if !open || endsLazyQuote(current, paragraphOpen: open) { break }
                    if current.contains("|") {
                        inner.append(MarkdownList.lazyContinuationMark + current)
                    } else {
                        inner.append(current)
                    }
                    open = !MarkdownList.htmlLazyTag(current)
                    index += 1
                }
                pushMarkdown(start)
                blocks.append(.quote(inner.joined(separator: "\n")))
                mdStart = index
                continue
            }
            // v1.59: keep ordered lists intact, including a nested task.
            if let orderedEnd = MarkdownList.orderedListEnd(lines, start: index), orderedEnd > index {
                index = orderedEnd
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
    /// A tab keeps its stop: the optional column after `>` can consume
    /// part of it, and indented code is stored as four spaces plus the
    /// text cmark-gfm would keep.
    static func stripQuoteMarker(_ line: String) -> String? {
        if !line.contains("\t") { return stripQuoteMarkerSpaces(line) }
        guard let contentCol = quoteContentColumn(line) else { return nil }
        return canonicalBody(line, contentCol: contentCol)
    }

    /// Space-only quote marker. Tabs use `stripQuoteMarker`.
    private static func stripQuoteMarkerSpaces(_ line: String) -> String? {
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

    private struct QuoteFence {
        var marker: String
        var indent: Int
        /// v1.89: body lines are already the cmark-gfm code text.
        var literal: Bool = false
        var offset: Int = 0
    }

    private struct QuoteList {
        var absolute: Int
        var relative: Int
        /// The item already has text. An empty item ends on a blank line.
        var filled: Bool
    }

    /// Fence, math, list, and nested-quote state. Treated as immutable
    /// after `init`, so a nested link can be shared.
    private final class QuoteCarry {
        var fence: QuoteFence?
        var math: Bool
        var list: QuoteList?
        var nested: QuoteCarry?
        var paragraph: Bool

        init(
            fence: QuoteFence? = nil,
            math: Bool = false,
            list: QuoteList? = nil,
            nested: QuoteCarry? = nil,
            paragraph: Bool = false
        ) {
            self.fence = fence
            self.math = math
            self.list = list
            self.nested = nested
            self.paragraph = paragraph
        }

        func withParagraph(_ paragraph: Bool) -> QuoteCarry {
            QuoteCarry(fence: fence, math: math, list: list, nested: nested, paragraph: paragraph)
        }
    }

    private struct RenderedQuote {
        var text: String
        var carry: QuoteCarry
    }

    private struct QuoteMarker {
        var text: String
        var absolute: Int
        var relative: Int
        var interrupts: Bool
        var filled: Bool
    }

    /// Quote line ready for a column-0 reparse, or nil when `line`
    /// is not a quote. Fence, math, list, and nested-quote state cross
    /// lines so a tab inside them is not rewritten as a top-level
    /// indented code block.
    private static func renderQuoteLine(
        _ line: String,
        carry: QuoteCarry,
        paragraphOpen: Bool
    ) -> RenderedQuote? {
        guard let contentCol = quoteContentColumn(line) else { return nil }
        return renderAt(line, contentCol: contentCol, carry: carry, paragraphOpen: paragraphOpen)
    }

    private static func renderAt(
        _ line: String,
        contentCol: Int,
        carry: QuoteCarry,
        paragraphOpen: Bool
    ) -> RenderedQuote {
        let plain = quotePlain(line, contentCol: contentCol)
        if let fence = carry.fence {
            if fence.literal {
                let closed = MarkdownFenceIndent.tabFenceCloses(
                    line,
                    contentColumn: contentCol,
                    marker: fence.marker,
                    markers: true
                )
                let text = closed
                    ? fence.marker
                    : MarkdownFenceIndent.tabFenceCodeLine(
                        line,
                        contentColumn: contentCol,
                        fenceOffset: fence.offset,
                        markers: true
                    )
                return RenderedQuote(
                    text: text,
                    carry: QuoteCarry(fence: closed ? nil : fence)
                )
            }
            let text = fenceBody(line, contentCol: contentCol, indent: fence.indent)
            let closed = fenceCloses(line, contentCol: contentCol, marker: fence.marker)
            return RenderedQuote(
                text: text,
                carry: QuoteCarry(fence: closed ? nil : fence)
            )
        }
        if carry.math {
            let text = materialize(line, contentCol: contentCol)
            return RenderedQuote(
                text: text,
                carry: QuoteCarry(math: text.trimmingCharacters(in: .whitespaces) != "$$", list: carry.list)
            )
        }
        // A list item owns a later tabbed fence. Measured from the quote
        // column, the same tab is one byte too many and the code gains a
        // space. The list pass measures it from the item's content column.
        if carry.list == nil, line.contains("\t"),
           let tabbed = MarkdownFenceIndent.tabFenceOpen(line, contentColumn: contentCol, markers: true)
        {
            return RenderedQuote(
                text: tabbed.marker + tabbed.info,
                carry: QuoteCarry(
                    fence: QuoteFence(marker: tabbed.marker, indent: 0, literal: true, offset: tabbed.offset)
                )
            )
        }
        if let opened = openingQuoteFence(line, contentCol: contentCol) {
            let text = line.contains("\t")
                ? fenceBody(line, contentCol: contentCol, indent: opened.indent)
                : plain
            return RenderedQuote(text: text, carry: QuoteCarry(fence: opened))
        }
        if let at = firstContent(line, contentCol: contentCol),
           line[at.index] == ">",
           at.col - contentCol <= 3
        {
            let innerCol = nestedContentColumn(line, index: at.index, col: at.col)
            let nested = carry.nested ?? QuoteCarry()
            let inner = renderAt(
                line,
                contentCol: innerCol,
                carry: nested,
                paragraphOpen: nested.paragraph
            )
            let paragraph = inner.carry.fence == nil
                && paragraphOpenAfter(inner.text, wasOpen: nested.paragraph)
            let indent = at.col - contentCol
            let keepList = carry.list != nil && (paragraphOpen || indent >= (carry.list?.relative ?? 0))
            let next = QuoteCarry(
                list: keepList ? carry.list.map { QuoteList(absolute: $0.absolute, relative: $0.relative, filled: true) } : nil,
                nested: inner.carry.withParagraph(paragraph)
            )
            // A line with no tab keeps the old one-level strip (`>> foo`, not
            // `> > foo`). The nested state is still recorded for a later tab.
            if !line.contains("\t") {
                return RenderedQuote(text: plain, carry: next)
            }
            return RenderedQuote(text: spaces(indent) + "> " + inner.text, carry: next)
        }
        let marker = listMarkerInfo(line, contentCol: contentCol)
        let starts = marker != nil && (!paragraphOpen || marker?.interrupts == true)
        let openList = starts ? nil : carry.list
        let at = firstContent(line, contentCol: contentCol)
        var list: QuoteList?
        var text: String
        if starts, let marker {
            text = line.contains("\t") ? marker.text : plain
            list = QuoteList(absolute: marker.absolute, relative: marker.relative, filled: marker.filled)
        } else if let openList, at == nil {
            text = line.contains("\t") ? "" : plain
            list = openList.filled ? openList : nil
        } else if let openList,
                  paragraphOpen || (at != nil && (at!.col - contentCol) >= openList.relative)
        {
            let code = !paragraphOpen && line.contains("\t")
                ? MarkdownList.listItemIndentedCode(line, contentColumn: contentCol + openList.relative)
                : nil
            if !line.contains("\t") {
                text = plain
            } else if let code {
                text = spaces(openList.relative) + "    " + code
            } else {
                text = materialize(line, contentCol: contentCol)
            }
            list = QuoteList(absolute: openList.absolute, relative: openList.relative, filled: true)
        } else {
            text = line.contains("\t") ? canonicalBody(line, contentCol: contentCol) : plain
            list = nil
        }
        let math = text.trimmingCharacters(in: .whitespaces) == "$$"
        return RenderedQuote(text: text, carry: QuoteCarry(math: math, list: list))
    }

    /// Quote content when the line has no tab. `contentCol` is the index.
    private static func quotePlain(_ line: String, contentCol: Int) -> String {
        let index = line.index(line.startIndex, offsetBy: contentCol, limitedBy: line.endIndex) ?? line.endIndex
        return String(line[index...])
    }

    /// Column where quote content starts, or nil when `line` is not a quote.
    private static func quoteContentColumn(_ line: String) -> Int? {
        var col = 0
        var index = line.startIndex
        while index < line.endIndex, line[index] == " " {
            col += 1
            index = line.index(after: index)
            if col > 3 { return nil }
        }
        if index == line.endIndex || line[index] != ">" || col > 3 { return nil }
        index = line.index(after: index)
        col += 1
        if index == line.endIndex { return col }
        let ch = line[index]
        if ch == " " || ch == "\t" { return col + 1 }
        return col
    }

    /// Quote content, parsed from column 0 the way cmark-gfm parses it
    /// in place. Indented code is four spaces plus the kept text.
    private static func canonicalBody(_ line: String, contentCol: Int) -> String {
        if firstContent(line, contentCol: contentCol) == nil { return "" }
        if let code = MarkdownList.listItemIndentedCode(line, contentColumn: contentCol) {
            return "    " + code
        }
        if let at = firstContent(line, contentCol: contentCol),
           line[at.index] == ">",
           at.col - contentCol <= 3
        {
            let innerCol = nestedContentColumn(line, index: at.index, col: at.col)
            let inner = canonicalBody(line, contentCol: innerCol)
            return spaces(at.col - contentCol) + "> " + inner
        }
        if let list = listMarkerInfo(line, contentCol: contentCol) {
            return list.text
        }
        return materialize(line, contentCol: contentCol)
    }

    private static func nestedContentColumn(_ line: String, index: String.Index, col: Int) -> Int {
        let next = line.index(after: index)
        if next >= line.endIndex { return col + 1 }
        if line[next] == " " || line[next] == "\t" { return col + 2 }
        return col + 1
    }

    /// First non-space at or after `contentCol`, in original columns.
    private static func firstContent(
        _ line: String,
        contentCol: Int
    ) -> (col: Int, index: String.Index)? {
        var col = 0
        var index = line.startIndex
        while index < line.endIndex {
            let ch = line[index]
            if ch == " " {
                col += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                col += 4 - (col % 4)
                index = line.index(after: index)
                continue
            }
            if col < contentCol {
                col += 1
                index = line.index(after: index)
                continue
            }
            return (col, index)
        }
        return nil
    }

    private static func isThematicContent(_ line: String, index: String.Index) -> Bool {
        let mark = line[index]
        if mark != "-" && mark != "*" && mark != "_" { return false }
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

    /// A list marker in the quote's first three columns, rewritten so
    /// a column-0 parser keeps the same code text.
    private static func listMarkerInfo(_ line: String, contentCol: Int) -> QuoteMarker? {
        guard let at = firstContent(line, contentCol: contentCol) else { return nil }
        let indent = at.col - contentCol
        if indent > 3 { return nil }
        if isThematicContent(line, index: at.index) { return nil }
        var i = at.index
        var token = ""
        let bullet = line[i]
        if bullet == "-" || bullet == "*" || bullet == "+" {
            token = String(bullet)
            i = line.index(after: i)
        } else {
            var digits = ""
            var scan = i
            while scan < line.endIndex, isAsciiDigit(line[scan]), digits.count < 9 {
                digits.append(line[scan])
                scan = line.index(after: scan)
            }
            if digits.isEmpty || scan == line.endIndex { return nil }
            let delimiter = line[scan]
            if delimiter != "." && delimiter != ")" { return nil }
            scan = line.index(after: scan)
            token = digits + String(delimiter)
            i = scan
        }
        if i < line.endIndex, line[i] != " ", line[i] != "\t" { return nil }
        let markerEnd = at.col + token.count
        let padded = MarkdownList.listMarkerPadding(line, markerIndex: i, markerColumn: markerEnd)
        let code = MarkdownList.listItemIndentedCode(line, contentColumn: padded.contentColumn)
        let lead = spaces(indent)
        let text: String
        if let code {
            text = lead + token + "     " + code
        } else {
            text = lead + token + spaces(max(0, padded.contentColumn - markerEnd)) + padded.text
        }
        let ordered = orderedMarkerDigits(token)
        let filled = code != nil || !padded.text.isEmpty
        let interrupts = filled && (ordered == nil || ordered == "1")
        return QuoteMarker(
            text: text,
            absolute: padded.contentColumn,
            relative: padded.contentColumn - contentCol,
            interrupts: interrupts,
            filled: filled
        )
    }

    private static func orderedMarkerDigits(_ token: String) -> String? {
        guard let last = token.last, last == "." || last == ")" else { return nil }
        let digits = token.dropLast()
        if digits.isEmpty || digits.contains(where: { !isAsciiDigit($0) }) { return nil }
        return String(digits)
    }

    /// Leading tabs become spaces. A tab after the first glyph stays a tab.
    private static func materialize(_ line: String, contentCol: Int) -> String {
        var col = 0
        var index = line.startIndex
        while index < line.endIndex, col < contentCol {
            let ch = line[index]
            if ch == " " {
                col += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                let next = col + (4 - (col % 4))
                if next > contentCol {
                    let rest = String(line[line.index(after: index)...])
                    return spaces(next - contentCol) + expandLeading(rest, col: next)
                }
                col = next
                index = line.index(after: index)
                continue
            }
            col += 1
            index = line.index(after: index)
        }
        return expandLeading(String(line[index...]), col: col)
    }

    private static func expandLeading(_ text: String, col: Int) -> String {
        var i = text.startIndex
        var c = col
        var lead = ""
        while i < text.endIndex {
            let ch = text[i]
            if ch == " " {
                lead.append(" ")
                c += 1
                i = text.index(after: i)
                continue
            }
            if ch == "\t" {
                let next = c + (4 - (c % 4))
                lead += spaces(next - c)
                c = next
                i = text.index(after: i)
                continue
            }
            break
        }
        return lead + String(text[i...])
    }

    private static func openingQuoteFence(_ line: String, contentCol: Int) -> QuoteFence? {
        guard let at = firstContent(line, contentCol: contentCol) else { return nil }
        let indent = at.col - contentCol
        if indent > 3 { return nil }
        let ch = line[at.index]
        if ch != "`" && ch != "~" { return nil }
        var n = 0
        var i = at.index
        while i < line.endIndex, line[i] == ch {
            n += 1
            i = line.index(after: i)
        }
        if n < 3 { return nil }
        let info = String(line[i...])
        if ch == "`", info.contains("`") { return nil }
        return QuoteFence(marker: String(repeating: String(ch), count: n), indent: indent)
    }

    private static func fenceCloses(_ line: String, contentCol: Int, marker: String) -> Bool {
        guard let at = firstContent(line, contentCol: contentCol) else { return false }
        if at.col - contentCol > 3 { return false }
        guard let ch = marker.first, line[at.index] == ch else { return false }
        var n = 0
        var i = at.index
        while i < line.endIndex, line[i] == ch {
            n += 1
            i = line.index(after: i)
        }
        if n < marker.count { return false }
        return String(line[i...]).trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Drop `columns` of quote-content indent. A crossing tab leaves spaces.
    private static func dedentContent(_ line: String, contentCol: Int, columns: Int) -> String {
        let limit = contentCol + columns
        var col = 0
        var index = line.startIndex
        while index < line.endIndex, col < limit {
            let ch = line[index]
            if ch == " " {
                col += 1
                index = line.index(after: index)
                continue
            }
            if ch == "\t" {
                let next = col + (4 - (col % 4))
                if next > limit {
                    return spaces(next - limit) + String(line[line.index(after: index)...])
                }
                col = next
                index = line.index(after: index)
                continue
            }
            if col < contentCol {
                col += 1
                index = line.index(after: index)
                continue
            }
            return String(line[index...])
        }
        return String(line[index...])
    }

    private static func fenceBody(_ line: String, contentCol: Int, indent: Int) -> String {
        spaces(indent) + dedentContent(line, contentCol: contentCol, columns: indent)
    }

    private static func spaces(_ count: Int) -> String {
        if count <= 0 { return "" }
        return String(repeating: " ", count: count)
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

    /// This line closes the quote instead of joining it. Types 1–7
    /// of an HTML block do. v1.87: a type 7 tag such as `<br>` ends
    /// the quote. The tag line and the lines the block owns stay
    /// outside it.
    private static func endsLazyQuote(_ line: String, paragraphOpen: Bool) -> Bool {
        if isBlank(line) || isMathFence(line) { return true }
        if isThematicBreak(line) || isAtxHeading(line) || isFenceLine(line) || isMarginListMarker(line) {
            return true
        }
        if MarkdownList.htmlBlockStarts(line) { return true }
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
