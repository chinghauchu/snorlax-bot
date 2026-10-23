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
/// `-` or `1.` under an item is a nested list.
///
/// v1.54: the column where item text starts follows CommonMark.
/// One to four spaces after the marker are padding, so `-   item`
/// continues at that wider column. Five or more spaces keep one
/// as the separator and the rest as content. A marker line with
/// no text, such as `1.` then `   text`, uses a padding of one.
/// A second blank line before any text ends the item.
///
/// v1.56: a list marker does not interrupt an open paragraph
/// unless CommonMark allows it. An ordered marker interrupts
/// only when its digits are exactly `1` (`1.` or `1)`), so
/// `9.`, `14.`, `0.`, `01.`, and `2)` stay paragraph text.
/// An empty marker (`1.` or `*` with no item text) stays text
/// too. A bullet that has text still interrupts. A blank line,
/// an ATX heading, a fence, a block quote, a thematic break,
/// or the start of the chunk lets any start number begin a
/// list, including `0.` and `01.`.
///
/// v1.57: `-`, `*`, and `+` are different lists, matching desktop
/// react-markdown. A later margin item stays in the list only when
/// it uses that same bullet. A nested marker of another character
/// stays inside the item. Ordered `.` and `)` were already different
/// lists.
///
/// v1.58: a CommonMark HTML block ends the list the way desktop
/// react-markdown does. Types 1–6 (`<div>`, `<script>`, a comment,
/// and the other block tags) interrupt the item, so the tag line
/// and everything the block owns stay outside it. A type 7 tag
/// such as `<br>` cannot interrupt a paragraph, but on a lazy
/// continuation it stays in the item and stops further lazy lines.
/// A marker inside the block, including `9.`, is not a list. Four
/// or more leading columns stay indented code. Tags stay literal
/// text. Streaming (`completed: false`) returns the text unchanged.
/// Copy controls keep markdown source — this type only splits text
/// for display and does not write the pasteboard. No animation.
/// No new HTTP.
///
/// v1.72: indented code inside a list item keeps cmark-gfm tab
/// stops. A tab is measured from its column on the original
/// line, not from column 0 after the marker is stripped.
/// A tab that crosses the code indent becomes the leftover
/// spaces, and a later tab stays a tab. A line that continues
/// an open paragraph is not code. A fence whose indent is
/// under four columns is unchanged. Streaming stays plain text.
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
        let state = paragraphState(before: start, in: lines)
        if state.insideHtml { return nil }
        if state.open, !markerInterruptsParagraph(marker) { return nil }
        return readList(lines, start: start, first: marker, classify: false).next
    }

    /// v1.59: end of an ordered list at `start`, or nil when that
    /// line is not one. Bullet lists stay nil so `- [ ]` extraction
    /// still owns them. A nested task indented into this list stays
    /// in the item.
    static func orderedListEnd(_ lines: [String], start: Int) -> Int? {
        guard let end = listEnd(lines, start: start), end > start else { return nil }
        guard let marker = parseMarker(lines[start]), marker.ordered else { return nil }
        return end
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
        var paragraph = false

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
                paragraph = false
                index += 1
                continue
            }
            if let htmlEnd = htmlBlockEnd(lines, index: index, paragraphOpen: paragraph) {
                paragraph = false
                index = htmlEnd
                continue
            }
            if let marker = parseMarker(line), marker.column <= 3,
               !paragraph || markerInterruptsParagraph(marker) {
                let found = readList(lines, start: index, first: marker)
                pushMarkdown(index)
                blocks.append(.list(found.group))
                index = found.next
                mdStart = index
                paragraph = false
                continue
            }
            paragraph = nextParagraphOpen(line, open: paragraph)
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
        /// Digit characters of an ordered marker. Empty for a bullet.
        var digits: String
        var contentColumn: Int
        var text: String
        /// `-`, `*`, or `+`. Ordered markers use "".
        var bullet: String
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
        // A marker with no text is already the item's one allowed
        // blank line. Content has to be indented to the content
        // column; a second blank line ends the item.
        // v1.72: a code line is stored as four spaces plus the text
        // cmark-gfm would keep, so the indented-code pass (which
        // starts at column 0) does not remeasure a shifted tab.
        let openingCode = listItemIndentedCode(lines[start], contentColumn: marker.contentColumn)
        var body: [String] = []
        var paragraph = false
        if !marker.text.isEmpty {
            if let code = openingCode {
                body.append(String(repeating: " ", count: 4) + code)
            } else {
                body.append(marker.text)
                paragraph = true
            }
        }
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
                    paragraph = false
                    index += 1
                    continue
                }
                break
            }
            if !paragraph, let code = listItemIndentedCode(line, contentColumn: marker.contentColumn) {
                body.append(String(repeating: " ", count: 4) + code)
                sawContent = true
                paragraph = false
                index += 1
                continue
            }
            if let opened = fenceOnLine(line) {
                if leadingColumns(line).columns < marker.contentColumn { break }
                fence = opened.marker
                body.append(dedent(line, columns: marker.contentColumn))
                sawContent = true
                paragraph = false
                index += 1
                continue
            }
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                if leadingColumns(line).columns < marker.contentColumn { break }
                inMath = true
                body.append(dedent(line, columns: marker.contentColumn))
                sawContent = true
                paragraph = false
                index += 1
                continue
            }
            if let nested = parseMarker(line) {
                if nested.column >= marker.contentColumn {
                    body.append(dedent(line, columns: marker.contentColumn))
                    sawContent = true
                    paragraph = true
                    index += 1
                    continue
                }
                if nested.column < marker.contentColumn { break }
            }
            if leadingColumns(line).columns >= marker.contentColumn {
                body.append(dedent(line, columns: marker.contentColumn))
                sawContent = true
                paragraph = true
                index += 1
                continue
            }
            if sawContent && !sawBlank && !interruptsList(line) {
                body.append(lazyLine(line))
                paragraph = true
                if htmlLazyTag(line) { sawBlank = true }
                index += 1
                continue
            }
            break
        }
        return ReadItem(text: trimEdgeNewlines(body.joined(separator: "\n")), next: index)
    }

    private static func sameList(_ marker: Marker, _ first: Marker) -> Bool {
        marker.ordered == first.ordered
            && marker.delimiter == first.delimiter
            && marker.bullet == first.bullet
    }

    private static func parseMarker(_ line: String) -> Marker? {
        if isThematicBreak(line) { return nil }
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        var ordered = false
        var delimiter = ""
        var number = 1
        var digits = ""
        var token = ""
        var bullet = ""
        if let mark = rest.first, mark == "-" || mark == "+" || mark == "*" {
            token = String(mark)
            bullet = token
        } else {
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
        if contentIndex < line.endIndex {
            let sep = line[contentIndex]
            if sep != " " && sep != "\t" { return nil }
        }
        let padded = listMarkerPadding(
            line,
            markerIndex: contentIndex,
            markerColumn: lead.columns + token.count
        )
        return Marker(
            column: lead.columns,
            ordered: ordered,
            delimiter: delimiter,
            number: number,
            digits: digits,
            contentColumn: padded.contentColumn,
            text: padded.text,
            bullet: bullet
        )
    }

    /// CommonMark list padding. `markerColumn` is the column just
    /// after the marker. One to four columns of spaces or a tab are
    /// padding. Five or more keep a single column as the separator
    /// and leave the rest in `text`. A blank marker line uses one
    /// column of padding and empty text.
    static func listMarkerPadding(
        _ line: String,
        markerIndex: String.Index,
        markerColumn: Int
    ) -> (contentColumn: Int, text: String) {
        let start = MarkerCursor(col: markerColumn, index: markerIndex, partial: 0)
        var cur = start
        var guardCount = 0
        repeat {
            let before = cur.col
            advanceMarkerColumn(line, &cur)
            if cur.col == before { break }
            guardCount += 1
        } while cur.col - start.col < 5 && isMarkerSpace(peekMarker(line, cur)) && guardCount < 32
        let spacesAfter = cur.col - start.col
        let blank = peekMarker(line, cur) == nil
        if spacesAfter >= 5 || spacesAfter < 1 || blank {
            var back = start
            if isMarkerSpace(peekMarker(line, back)) {
                advanceMarkerColumn(line, &back)
            }
            return (markerColumn + 1, blank ? "" : markerRemainder(line, back))
        }
        return (markerColumn + spacesAfter, markerRemainder(line, cur))
    }

    private struct MarkerCursor {
        var col: Int
        var index: String.Index
        var partial: Int
    }

    private static func advanceMarkerColumn(_ line: String, _ cur: inout MarkerCursor) {
        if cur.partial > 0 {
            cur.partial -= 1
            cur.col += 1
            if cur.partial == 0, cur.index < line.endIndex {
                cur.index = line.index(after: cur.index)
            }
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

    private static func peekMarker(_ line: String, _ cur: MarkerCursor) -> Character? {
        if cur.partial > 0 { return "\t" }
        if cur.index >= line.endIndex { return nil }
        return line[cur.index]
    }

    private static func isMarkerSpace(_ ch: Character?) -> Bool {
        ch == " " || ch == "\t"
    }

    private static func markerRemainder(_ line: String, _ cur: MarkerCursor) -> String {
        if cur.partial > 0 {
            let next = line.index(after: cur.index)
            return String(repeating: " ", count: cur.partial) + String(line[next...])
        }
        return String(line[cur.index...])
    }

    /// Drop the partial indent on a lazy continuation line.
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
        if htmlBlockInterrupts(line) { return true }
        return false
    }

    private enum HtmlKind {
        case until(String)
        case blank
    }

    private static let htmlBlockTags: Set<String> = [
        "address", "article", "aside", "base", "basefont", "blockquote", "body",
        "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
        "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
        "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
        "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem",
        "nav", "noframes", "ol", "optgroup", "option", "p", "param", "search",
        "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead",
        "title", "tr", "track", "ul",
    ]

    /// CommonMark HTML block start. Types 1–6 interrupt a paragraph.
    /// Type 7 starts only when the paragraph is already closed.
    private static func htmlBlockKind(_ line: String, paragraphOpen: Bool) -> HtmlKind? {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return nil }
        let body = String(line[lead.index...])
        if let name = htmlRawTextName(body) {
            return .until("</\(name)>")
        }
        if body.hasPrefix("<!--") { return .until("-->") }
        if body.hasPrefix("<?") { return .until("?>") }
        if body.hasPrefix("<![CDATA[") { return .until("]]>") }
        if body.range(of: #"^<![A-Z]"#, options: .regularExpression) != nil { return .until(">") }
        if let tag = htmlBlockTagName(body), htmlBlockTags.contains(tag) { return .blank }
        if !paragraphOpen && htmlCompleteTag(body) { return .blank }
        return nil
    }

    private static func htmlRawTextName(_ body: String) -> String? {
        guard let match = body.range(
            of: #"^<(pre|script|style|textarea)(\s|>|$)"#,
            options: [.regularExpression, .caseInsensitive]
        ) else { return nil }
        let raw = String(body[match])
        let name = raw.dropFirst().prefix { $0.isLetter }
        guard !name.isEmpty else { return nil }
        return String(name).lowercased()
    }

    private static func htmlBlockTagName(_ body: String) -> String? {
        guard let match = body.range(of: #"^</?[A-Za-z][A-Za-z0-9-]*"#, options: .regularExpression) else {
            return nil
        }
        let raw = String(body[match])
        let name = raw.hasPrefix("</") ? String(raw.dropFirst(2)) : String(raw.dropFirst())
        let rest = String(body[match.upperBound...])
        if !rest.isEmpty && rest.range(of: #"^[\s/>]"#, options: .regularExpression) == nil { return nil }
        return name.lowercased()
    }

    private static func htmlCompleteTag(_ body: String) -> Bool {
        let pattern = "^</?[A-Za-z][A-Za-z0-9-]*(\\s[^>]*)?" + "/?>\\s*$"
        return body.range(of: pattern, options: .regularExpression) != nil
    }

    private static func skipHtmlBlock(_ lines: [String], start: Int, kind: HtmlKind) -> Int {
        switch kind {
        case .until(let needle):
            var index = start
            let folded = needle.lowercased()
            while index < lines.count {
                let has = lines[index].lowercased().contains(folded)
                index += 1
                if has { break }
            }
            return index
        case .blank:
            var index = start + 1
            while index < lines.count && !isBlank(lines[index]) { index += 1 }
            return index
        }
    }

    /// Index just after an HTML block that starts at `index`, or nil.
    private static func htmlBlockEnd(_ lines: [String], index: Int, paragraphOpen: Bool) -> Int? {
        guard let kind = htmlBlockKind(lines[index], paragraphOpen: paragraphOpen) else { return nil }
        return skipHtmlBlock(lines, start: index, kind: kind)
    }

    /// End index of a type 1–5 HTML block. Those blocks keep their
    /// blank lines. Nil when this line is not one of those blocks.
    static func htmlUntilBlockEnd(_ lines: [String], index: Int, paragraphOpen: Bool) -> Int? {
        guard index >= 0, index < lines.count else { return nil }
        guard let kind = htmlBlockKind(lines[index], paragraphOpen: paragraphOpen),
              case .until = kind
        else { return nil }
        return skipHtmlBlock(lines, start: index, kind: kind)
    }

    /// Types 1–6. They end a list item or a lazy quote before this line.
    static func htmlBlockInterrupts(_ line: String) -> Bool {
        htmlBlockKind(line, paragraphOpen: true) != nil
    }

    /// Type 7: a complete tag such as `<br>` on a lazy line.
    static func htmlLazyTag(_ line: String) -> Bool {
        if htmlBlockKind(line, paragraphOpen: true) != nil { return false }
        if case .some(.blank) = htmlBlockKind(line, paragraphOpen: false) { return true }
        return false
    }

    /// CommonMark only lets some markers interrupt a paragraph.
    /// An ordered marker interrupts only when its digits are `1`,
    /// so `01.` and `9.` stay text. A marker with no item text
    /// (`1.` / `*` alone) stays text too.
    private static func markerInterruptsParagraph(_ marker: Marker) -> Bool {
        if marker.text.isEmpty { return false }
        if marker.ordered && marker.digits != "1" { return false }
        return true
    }

    /// Paragraph state at `index`, and whether that line sits inside
    /// an HTML block that started earlier.
    private static func paragraphState(before index: Int, in lines: [String]) -> (open: Bool, insideHtml: Bool) {
        var paragraph = false
        var fence: String?
        var inMath = false
        var cursor = 0
        while cursor < index, cursor < lines.count {
            let line = lines[cursor]
            let gate = blockGate(line, fence: fence, inMath: inMath)
            fence = gate.fence
            inMath = gate.inMath
            if gate.blocked {
                paragraph = false
                cursor += 1
                continue
            }
            if let htmlEnd = htmlBlockEnd(lines, index: cursor, paragraphOpen: paragraph) {
                if htmlEnd > index { return (false, true) }
                paragraph = false
                cursor = htmlEnd
                continue
            }
            if let marker = parseMarker(line), marker.column <= 3,
               !paragraph || markerInterruptsParagraph(marker) {
                paragraph = false
            } else {
                paragraph = nextParagraphOpen(line, open: paragraph)
            }
            cursor += 1
        }
        return (paragraph, false)
    }

    /// Paragraph state after a line that is not taken as a new list.
    /// A blank line, heading, quote, or rule closes it. Indented
    /// code closes it only when no paragraph is already open.
    private static func nextParagraphOpen(_ line: String, open: Bool) -> Bool {
        if isBlank(line) { return false }
        if isThematicBreak(line) || isAtxHeadingLine(line) || isBlockQuoteLine(line) { return false }
        if !open && isIndentedCodeLine(line) { return false }
        return true
    }

    private static func isBlank(_ line: String) -> Bool {
        for ch in line where ch != " " && ch != "\t" {
            return false
        }
        return true
    }

    private static func isAtxHeadingLine(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        var hashes = 0
        var index = lead.index
        while index < line.endIndex, line[index] == "#", hashes < 7 {
            hashes += 1
            index = line.index(after: index)
        }
        if hashes < 1 || hashes > 6 { return false }
        if index >= line.endIndex { return true }
        return line[index] == " " || line[index] == "\t"
    }

    private static func isBlockQuoteLine(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 || lead.index >= line.endIndex { return false }
        return line[lead.index] == ">"
    }

    private static func isIndentedCodeLine(_ line: String) -> Bool {
        if isBlank(line) { return false }
        return leadingColumns(line).columns >= 4
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

    /// Indented-code body of a list line, or nil when the line is
    /// not indented four columns past `contentColumn`.
    ///
    /// Columns are the original line, so a tab keeps its stop. The
    /// marker's own characters sit before `contentColumn` and are
    /// skipped. A tab that starts before the code indent and ends
    /// after it contributes the leftover spaces. A tab that starts
    /// at or after that indent stays in the returned text.
    static func listItemIndentedCode(_ line: String, contentColumn: Int) -> String? {
        let limit = contentColumn + 4
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
                if next <= limit {
                    col = next
                    index = line.index(after: index)
                    continue
                }
                let leftover = String(repeating: " ", count: next - limit)
                let rest = String(line[line.index(after: index)...])
                return leftover + rest
            }
            if col < contentColumn {
                col += 1
                index = line.index(after: index)
                continue
            }
            return nil
        }
        if col < limit { return nil }
        return String(line[index...])
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
