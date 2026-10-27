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
/// only when its start number is 1, so `9.`, `14.`, `0.`, and
/// `2)` stay paragraph text. An empty marker (`1.` or `*`
/// with no item text) stays text too. A bullet that has text
/// still interrupts. A blank line, an ATX heading, a fence, a
/// block quote, a thematic break, or the start of the chunk
/// lets any start number begin a list, including `0.` and
/// `003.`.
///
/// v1.88: cmark-gfm's start number is the integer value, so
/// `01.`, `001.`, and `000000001.` are 1 and do interrupt.
/// A line indented four or more columns that is short of the
/// item's content column is a lazy continuation, even when
/// the text would be a heading, rule, fence, quote, list
/// marker, or HTML block at the margin. The stored line
/// escapes that block start so a later parse keeps the text.
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
///
/// v1.89: a tab partly consumed by the list marker is one byte of
/// fence indent, not its full column width. The leftover columns
/// stay spaces in the code. Space-only fences are unchanged.
///
/// v1.95: a blank line inside an item's indented code keeps
/// columns past the code indent. The stored line is four spaces
/// plus that remainder, so the indented-code pass matches
/// cmark-gfm. A blank that only separates blocks stays empty.
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
        var inIndentedCode = false
        if !marker.text.isEmpty {
            if let code = openingCode {
                body.append(String(repeating: " ", count: 4) + code)
                inIndentedCode = true
            } else {
                body.append(marker.text)
                paragraph = true
            }
        }
        var index = start + 1
        var fence: String?
        var fenceOffset = 0
        var fenceLiteral = false
        var inMath = false
        var sawBlank = false
        var sawContent = !marker.text.isEmpty

        while index < lines.count {
            let line = lines[index]
            if let open = fence {
                if fenceLiteral {
                    if MarkdownFenceIndent.tabFenceCloses(
                        line,
                        contentColumn: marker.contentColumn,
                        marker: open
                    ) {
                        body.append(open)
                        fence = nil
                        fenceLiteral = false
                    } else if !line.trimmingCharacters(in: .whitespaces).isEmpty,
                              leadingColumns(line).columns < marker.contentColumn
                    {
                        // Not indented to the item, so the item and the open fence end.
                        // The line itself belongs to the parent.
                        fence = nil
                        fenceLiteral = false
                        break
                    } else {
                        body.append(
                            MarkdownFenceIndent.tabFenceCodeLine(
                                line,
                                contentColumn: marker.contentColumn,
                                fenceOffset: fenceOffset
                            )
                        )
                    }
                } else {
                    body.append(dedent(line, columns: marker.contentColumn))
                    if let opened = fenceOnLine(line),
                       opened.marker.first == open.first,
                       opened.marker.count >= open.count,
                       opened.info.trimmingCharacters(in: .whitespaces).isEmpty
                    {
                        fence = nil
                    }
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
                    if inIndentedCode,
                       listItemIndentedCode(upcoming, contentColumn: marker.contentColumn) != nil
                    {
                        if let extra = listItemIndentedCode(line, contentColumn: marker.contentColumn) {
                            body.append(String(repeating: " ", count: 4) + extra)
                        } else {
                            body.append("")
                        }
                    } else {
                        body.append("")
                        inIndentedCode = false
                    }
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
                inIndentedCode = true
                index += 1
                continue
            }
            if leadingColumns(line).columns >= marker.contentColumn,
               let tabbed = MarkdownFenceIndent.tabFenceOpen(line, contentColumn: marker.contentColumn)
            {
                fence = tabbed.marker
                fenceOffset = tabbed.offset
                fenceLiteral = true
                body.append(tabbed.marker + tabbed.info)
                sawContent = true
                paragraph = false
                inIndentedCode = false
                index += 1
                continue
            }
            if let opened = fenceOnLine(line) {
                let cols = leadingColumns(line).columns
                if cols >= marker.contentColumn {
                    fence = opened.marker
                    fenceLiteral = false
                    body.append(dedent(line, columns: marker.contentColumn))
                    sawContent = true
                    paragraph = false
                    inIndentedCode = false
                    index += 1
                    continue
                }
                // Four or more columns cannot open a fence. Fall through
                // so an open paragraph keeps the line as lazy text.
                if cols <= 3 { break }
            }
            if line.trimmingCharacters(in: .whitespaces) == "$$" {
                let cols = leadingColumns(line).columns
                if cols >= marker.contentColumn {
                    inMath = true
                    body.append(dedent(line, columns: marker.contentColumn))
                    sawContent = true
                    paragraph = false
                    inIndentedCode = false
                    index += 1
                    continue
                }
                if cols <= 3 { break }
            }
            if let nested = parseMarker(line) {
                if nested.column >= marker.contentColumn {
                    body.append(dedent(line, columns: marker.contentColumn))
                    sawContent = true
                    paragraph = true
                    inIndentedCode = false
                    index += 1
                    continue
                }
                if nested.column <= 3 && nested.column < marker.contentColumn { break }
            }
            if leadingColumns(line).columns >= marker.contentColumn {
                body.append(dedent(line, columns: marker.contentColumn))
                sawContent = true
                paragraph = true
                inIndentedCode = false
                index += 1
                continue
            }
            if sawContent && !sawBlank && !interruptsList(line) {
                // v1.86: a table is not a paragraph, so a lazy line
                // after one ends the item instead of joining it.
                // v1.88: a 4-column line that only looks like a block
                // stays in the paragraph, with the block start escaped.
                if let last = body.indices.last, MarkdownTable.quoteLineInTable(body, index: last) {
                    break
                }
                body.append(lazyItemLine(line))
                paragraph = true
                inIndentedCode = false
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

    /// v1.86: prefix on a lazy line that contains `|`. A later table
    /// parse refuses a lazy delimiter and a lazy body row. Lines
    /// without a pipe stay unmarked.
    static let lazyContinuationMark = "§§SBTL§§"

    /// v1.88: lazy text. A block start at column 0 is escaped so
    /// the next parse keeps it in the paragraph. A pipe still
    /// takes the table mark.
    static func lazyItemLine(_ line: String) -> String {
        var index = line.startIndex
        while index < line.endIndex, line[index] == " " || line[index] == "\t" {
            index = line.index(after: index)
        }
        let guarded = guardLazyBlock(String(line[index...]))
        if guarded.contains("|") { return lazyContinuationMark + guarded }
        return guarded
    }

    private static func guardLazyBlock(_ line: String) -> String {
        if !opensBlockAtMargin(line) { return line }
        if let marker = parseMarker(line), marker.ordered, marker.column == 0 {
            let token = marker.digits + marker.delimiter
            if line.hasPrefix(token) {
                return marker.digits + "\\" + marker.delimiter + String(line.dropFirst(token.count))
            }
        }
        return "\\" + line
    }

    /// A block cmark-gfm can open when this line's indent is 0–3.
    private static func opensBlockAtMargin(_ line: String) -> Bool {
        if leadingColumns(line).columns > 3 { return false }
        if isThematicBreak(line) || isAtxHeadingLine(line) || isBlockQuoteLine(line) { return true }
        if isSetextUnderline(line) { return true }
        if fenceOnLine(line) != nil { return true }
        if line.trimmingCharacters(in: .whitespaces) == "$$" { return true }
        if htmlBlockInterrupts(line) { return true }
        if let marker = parseMarker(line), marker.column <= 3 { return true }
        return false
    }

    private static func isSetextUnderline(_ line: String) -> Bool {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return false }
        let rest = String(line[lead.index...])
        return rest.range(of: #"^(?:=+|-{2,})[ \t]*$"#, options: .regularExpression) != nil
    }

    private static func interruptsList(_ line: String) -> Bool {
        if leadingColumns(line).columns > 3 { return false }
        if isThematicBreak(line) { return true }
        let lead = leadingColumns(line)
        let rest = String(line[lead.index...])
        if rest.range(of: #"^#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil { return true }
        if rest.hasPrefix(">") { return true }
        if fenceOnLine(line) != nil { return true }
        if rest.trimmingCharacters(in: .whitespaces) == "$$" { return true }
        // v1.87: types 1–7. A type 7 tag cannot interrupt a paragraph,
        // but at the list margin the item has already failed to
        // continue, so cmark-gfm opens the block outside the list.
        if htmlBlockStarts(line) { return true }
        return false
    }

    private enum HtmlKind {
        case until(needles: [String], fold: Bool)
        case blank
    }

    /// cmark-gfm 0.29.0.gfm.13 block tags. `source` is in that set.
    /// `search` was added in CommonMark 0.31 and is not.
    private static let htmlBlockTags: Set<String> = [
        "address", "article", "aside", "base", "basefont", "blockquote", "body",
        "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
        "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
        "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
        "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem",
        "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section",
        "source", "summary", "table", "tbody", "td", "tfoot", "th", "thead",
        "title", "tr", "track", "ul",
    ]

    private static let htmlRawNames = ["textarea", "script", "style", "pre"]
    private static let htmlRawEnd = ["</script>", "</pre>", "</style>", "</textarea>"]

    /// cmark-gfm 0.29.0.gfm.13 HTML block start.
    /// Types 1–6 interrupt a paragraph. Type 7 starts only when the
    /// paragraph is already closed. Type 1 ends on any of the four
    /// raw end tags. A block tag must be followed by a space character,
    /// `>`, or `/>`.
    private static func htmlBlockKind(_ line: String, paragraphOpen: Bool) -> HtmlKind? {
        guard let body = htmlBlockBody(line) else { return nil }
        if htmlRawName(body) != nil { return .until(needles: htmlRawEnd, fold: true) }
        if body.hasPrefix("<!--") { return .until(needles: ["-->"], fold: false) }
        if body.hasPrefix("<?") { return .until(needles: ["?>"], fold: false) }
        if body.hasPrefix("<![CDATA[") { return .until(needles: ["]]>"], fold: false) }
        if body.range(of: #"^<![A-Z]"#, options: .regularExpression) != nil {
            return .until(needles: [">"], fold: false)
        }
        if let tag = htmlBlockTagName(body), htmlBlockTags.contains(tag) { return .blank }
        if !paragraphOpen && htmlCompleteTag(body) { return .blank }
        return nil
    }

    private static func htmlBlockBody(_ line: String) -> String? {
        let lead = leadingColumns(line)
        if lead.columns > 3 { return nil }
        return String(line[lead.index...])
    }

    private static func htmlRawName(_ body: String) -> String? {
        guard body.first == "<" else { return nil }
        let rest = String(body.dropFirst())
        let lower = rest.lowercased()
        for name in htmlRawNames {
            guard lower.hasPrefix(name) else { continue }
            let after = rest.index(rest.startIndex, offsetBy: name.count, limitedBy: rest.endIndex) ?? rest.endIndex
            if after == rest.endIndex { return name }
            let ch = rest[after]
            if ch == ">" || isHtmlSpace(ch) { return name }
        }
        return nil
    }

    private static func htmlBlockTagName(_ body: String) -> String? {
        let chars = Array(body)
        guard chars.first == "<" else { return nil }
        var index = 1
        if chars.count > 1 && chars[1] == "/" { index = 2 }
        let start = index
        guard index < chars.count, isHtmlLetter(chars[index]) else { return nil }
        index += 1
        while index < chars.count && isHtmlNameChar(chars[index]) { index += 1 }
        let name = String(chars[start..<index]).lowercased()
        guard htmlBlockTags.contains(name) else { return nil }
        if index >= chars.count || chars[index] == ">" || isHtmlSpace(chars[index]) { return name }
        if chars[index] == "/", index + 1 < chars.count, chars[index + 1] == ">" { return name }
        return nil
    }

    private static func htmlCompleteTag(_ body: String) -> Bool {
        let chars = Array(body)
        guard let end = scanHtmlContentTag(chars) else { return false }
        for ch in chars[end...] {
            if ch != " " && ch != "\t" && ch != "\u{000C}" { return false }
        }
        return true
    }

    private static func scanHtmlContentTag(_ chars: [Character]) -> Int? {
        guard chars.first == "<" else { return nil }
        var index = 1
        if index < chars.count && chars[index] == "/" {
            index += 1
            guard let nameEnd = readHtmlTagName(chars, index) else { return nil }
            index = skipHtmlSpace(chars, nameEnd)
            guard index < chars.count, chars[index] == ">" else { return nil }
            return index + 1
        }
        guard let nameEnd = readHtmlTagName(chars, index) else { return nil }
        index = nameEnd
        while true {
            let ws = skipHtmlSpace(chars, index)
            if ws == index { break }
            guard let attr = readHtmlAttrName(chars, ws) else {
                index = ws
                break
            }
            index = attr
            let eq = skipHtmlSpace(chars, index)
            if eq >= chars.count || chars[eq] != "=" { continue }
            guard let valueEnd = readHtmlAttrValue(chars, skipHtmlSpace(chars, eq + 1)) else { return nil }
            index = valueEnd
        }
        index = skipHtmlSpace(chars, index)
        if index < chars.count && chars[index] == "/" { index += 1 }
        guard index < chars.count, chars[index] == ">" else { return nil }
        return index + 1
    }

    private static func readHtmlTagName(_ chars: [Character], _ index: Int) -> Int? {
        guard index < chars.count, isHtmlLetter(chars[index]) else { return nil }
        var cursor = index + 1
        while cursor < chars.count && isHtmlNameChar(chars[cursor]) { cursor += 1 }
        return cursor
    }

    private static func readHtmlAttrName(_ chars: [Character], _ index: Int) -> Int? {
        guard index < chars.count, isHtmlAttrStart(chars[index]) else { return nil }
        var cursor = index + 1
        while cursor < chars.count && isHtmlAttrChar(chars[cursor]) { cursor += 1 }
        return cursor
    }

    private static func readHtmlAttrValue(_ chars: [Character], _ index: Int) -> Int? {
        guard index < chars.count else { return nil }
        let ch = chars[index]
        if ch == "'" || ch == "\"" {
            var cursor = index + 1
            while cursor < chars.count && chars[cursor] != ch { cursor += 1 }
            guard cursor < chars.count else { return nil }
            return cursor + 1
        }
        if isHtmlUnquotedStop(ch) { return nil }
        var cursor = index + 1
        while cursor < chars.count && !isHtmlUnquotedStop(chars[cursor]) { cursor += 1 }
        return cursor
    }

    private static func skipHtmlSpace(_ chars: [Character], _ index: Int) -> Int {
        var cursor = index
        while cursor < chars.count && isHtmlSpace(chars[cursor]) { cursor += 1 }
        return cursor
    }

    private static func isHtmlSpace(_ ch: Character) -> Bool {
        ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "\u{000C}" || ch == "\u{000B}"
    }

    private static func isHtmlLetter(_ ch: Character) -> Bool {
        (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")
    }

    private static func isHtmlNameChar(_ ch: Character) -> Bool {
        isHtmlLetter(ch) || (ch >= "0" && ch <= "9") || ch == "-"
    }

    private static func isHtmlAttrStart(_ ch: Character) -> Bool {
        isHtmlLetter(ch) || ch == "_" || ch == ":"
    }

    private static func isHtmlAttrChar(_ ch: Character) -> Bool {
        isHtmlAttrStart(ch) || (ch >= "0" && ch <= "9") || ch == "." || ch == "-"
    }

    private static func isHtmlUnquotedStop(_ ch: Character) -> Bool {
        ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == "\u{000B}" || ch == "\u{000C}"
            || ch == "\"" || ch == "'" || ch == "=" || ch == "<" || ch == ">" || ch == "`" || ch == "\0"
    }

    private static func skipHtmlBlock(_ lines: [String], start: Int, kind: HtmlKind) -> Int {
        switch kind {
        case .until(let needles, let fold):
            var index = start
            while index < lines.count {
                let has = htmlLineHasNeedle(lines[index], needles: needles, fold: fold)
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

    private static func htmlLineHasNeedle(_ line: String, needles: [String], fold: Bool) -> Bool {
        let hay = fold ? line.lowercased() : line
        return needles.contains { needle in
            hay.contains(fold ? needle.lowercased() : needle)
        }
    }

    /// Index just after an HTML block that starts at `index`, or nil.
    private static func htmlBlockEnd(_ lines: [String], index: Int, paragraphOpen: Bool) -> Int? {
        guard index >= 0, index < lines.count else { return nil }
        guard let kind = htmlBlockKind(lines[index], paragraphOpen: paragraphOpen) else { return nil }
        return skipHtmlBlock(lines, start: index, kind: kind)
    }

    /// v1.80: setext scanning uses the same HTML block end.
    static func htmlBlockLineEnd(_ lines: [String], index: Int, paragraphOpen: Bool) -> Int? {
        htmlBlockEnd(lines, index: index, paragraphOpen: paragraphOpen)
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
    /// A margin list or quote line uses `htmlBlockStarts` and does
    /// not stay lazy.
    static func htmlLazyTag(_ line: String) -> Bool {
        if htmlBlockKind(line, paragraphOpen: true) != nil { return false }
        if case .some(.blank) = htmlBlockKind(line, paragraphOpen: false) { return true }
        return false
    }

    /// Types 1–7. A type 7 tag does not interrupt a paragraph, but it
    /// does end a list item or a lazy blockquote at the margin.
    static func htmlBlockStarts(_ line: String) -> Bool {
        htmlBlockKind(line, paragraphOpen: false) != nil
    }

    /// The line is one complete open or close tag, plus optional trailing space.
    static func htmlLineIsCompleteTag(_ line: String) -> Bool {
        guard let body = htmlBlockBody(line) else { return false }
        return htmlCompleteTag(body)
    }

    /// cmark-gfm type 6 `source`. Case-insensitive.
    static func htmlSourceBlockLine(_ line: String) -> Bool {
        guard let body = htmlBlockBody(line) else { return false }
        return htmlBlockTagName(body) == "source"
    }

    /// A `search` tag shaped like a CommonMark 0.31 block tag.
    /// cmark-gfm 0.29.0.gfm.13 does not treat `search` as type 6.
    static func htmlSearchBlockLine(_ line: String) -> Bool {
        guard let body = htmlBlockBody(line), body.first == "<" else { return false }
        let chars = Array(body)
        var index = 1
        if chars.count > 1 && chars[1] == "/" { index = 2 }
        let rest = String(chars.dropFirst(index))
        guard rest.range(of: #"^search(?![A-Za-z0-9-])"#, options: [.regularExpression, .caseInsensitive]) != nil else {
            return false
        }
        let after = rest.index(rest.startIndex, offsetBy: 6, limitedBy: rest.endIndex) ?? rest.endIndex
        if after == rest.endIndex { return true }
        let ch = rest[after]
        if ch == ">" || isHtmlSpace(ch) { return true }
        let next = rest.index(after: after)
        return ch == "/" && next < rest.endIndex && rest[next] == ">"
    }

    /// CommonMark only lets some markers interrupt a paragraph.
    /// An ordered marker interrupts only when its integer start is
    /// 1, so `01.` does and `9.`, `0.`, and `003.` stay text. A
    /// marker with no item text (`1.` / `*` alone) stays text too.
    private static func markerInterruptsParagraph(_ marker: Marker) -> Bool {
        if marker.text.isEmpty { return false }
        // v1.88: cmark-gfm compares the integer start, so `01.` is 1.
        if marker.ordered && marker.number != 1 { return false }
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
