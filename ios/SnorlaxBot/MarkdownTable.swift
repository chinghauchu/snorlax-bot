// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

/// v1.31: GFM pipe tables on completed assistant LEFT messages.
/// Copy puts the table's markdown source on the clipboard, then
/// shows Copied for 1.5s. A wide table scrolls horizontally.
/// Streaming stays plain text. No animation. No new HTTP.
/// v1.55: delimiter cells set column alignment (`:---` left,
/// `:---:` center, `---:` right). A `\|` inside an inline code span
/// becomes a literal pipe in that cell. The escape pass leaves code
/// spans unchanged, so the backslash has to come off here.
/// v1.64: a cell is inline markdown. A heading, list, quote, rule,
/// or fence at the start of the cell stays the characters. Bold,
/// italic, code, and links still parse. Intraword `_` stays literal.
/// v1.65: a body row is clipped to the header width. Extra cells
/// are dropped. A short row is padded with empty cells. Alignment
/// stays the delimiter row. The clipboard source stays the original
/// lines. A line with no pipe still ends the table.
/// Keep in lockstep with `desktop/src/markdownTable.ts`.
enum MarkdownTable {
    enum Align: Equatable {
        case left
        case center
        case right
    }

    struct Table: Equatable {
        var source: String
        var align: [Align]
        var header: [String]
        var rows: [[String]]
    }

    enum Piece: Equatable {
        case markdown(String)
        case table(Table)
    }

    /// `completed: false` returns the text unchanged.
    static func split(_ text: String, completed: Bool) -> [Piece] {
        if text.isEmpty { return [] }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        if !completed { return [.markdown(src)] }
        let lines = src.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var pieces: [Piece] = []
        var mdStart = 0
        var index = 0
        var fence: String?
        var inMath = false

        func pushMarkdown(_ end: Int) {
            guard end > mdStart else { return }
            let chunk = lines[mdStart..<end].joined(separator: "\n")
            if !chunk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                pieces.append(.markdown(chunk))
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
            guard let found = parseTable(lines, start: index) else {
                index += 1
                continue
            }
            pushMarkdown(index)
            pieces.append(.table(found.table))
            index = found.next
            mdStart = index
        }
        pushMarkdown(lines.count)
        if pieces.isEmpty { return [.markdown(src)] }
        return pieces
    }

    static func containsTable(_ text: String) -> Bool {
        split(text, completed: true).contains { piece in
            if case .table = piece { return true }
            return false
        }
    }

    private struct Parsed {
        var table: Table
        var next: Int
    }

    private static func parseTable(_ lines: [String], start: Int) -> Parsed? {
        guard start + 1 < lines.count else { return nil }
        let headerLine = lines[start]
        let delimLine = lines[start + 1]
        guard isTableLine(headerLine), isTableLine(delimLine) else { return nil }
        guard let header = splitRow(headerLine), let delim = splitRow(delimLine) else { return nil }
        guard let align = delimiterAlign(delim), align.count == header.count else { return nil }
        var body: [[String]] = []
        var next = start + 2
        while next < lines.count {
            let line = lines[next]
            guard isTableLine(line), let row = splitRow(line) else { break }
            body.append(row)
            next += 1
        }
        let shaped = rectangular(header: header, rows: body, align: align)
        return Parsed(
            table: Table(
                source: lines[start..<next].joined(separator: "\n"),
                align: shaped.align,
                header: shaped.header,
                rows: shaped.rows
            ),
            next: next
        )
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

    private static func isTableLine(_ line: String) -> Bool {
        let indent = line.prefix { $0 == " " }.count
        if indent >= 4 { return false }
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty || trimmed.hasPrefix(">") { return false }
        if trimmed.range(of: #"^([-*+]|\d+[.)])\s"#, options: .regularExpression) != nil {
            return false
        }
        return true
    }

    /// Cells split on unescaped pipes outside inline code. Outer pipes drop.
    /// v1.55: `\|` inside a code span is stored as `|`. Outside a code
    /// span the backslash stays so the escape pass can paint the pipe.
    static func splitRow(_ line: String) -> [String]? {
        let indent = line.prefix { $0 == " " }.count
        if indent >= 4 { return nil }
        let body = String(line.dropFirst(indent))
        var cells: [String] = []
        var current = ""
        var pipes = 0
        var code = 0
        let chars = Array(body)
        var index = 0
        while index < chars.count {
            let ch = chars[index]
            if code > 0 {
                if ch == "`" {
                    var n = 0
                    while index + n < chars.count, chars[index + n] == "`" { n += 1 }
                    current += String(repeating: "`", count: n)
                    index += n
                    if n == code { code = 0 }
                    continue
                }
                // v1.55: `\|` inside a code span is a literal pipe. The
                // escape pass leaves code spans unchanged, so the
                // backslash has to come off here or the chip shows `\|`.
                if ch == "\\", index + 1 < chars.count, chars[index + 1] == "|" {
                    current.append("|")
                    index += 2
                    continue
                }
                current.append(ch)
                index += 1
                continue
            }
            if ch == "\\" {
                if index + 1 < chars.count {
                    // Keep the backslash. Only `\|` fails to split; the
                    // inline escape pass turns `\*` into a literal asterisk.
                    current.append(ch)
                    current.append(chars[index + 1])
                    index += 2
                    continue
                }
            }
            if ch == "`" {
                var n = 0
                while index + n < chars.count, chars[index + n] == "`" { n += 1 }
                current += String(repeating: "`", count: n)
                index += n
                code = n
                continue
            }
            if ch == "|" {
                pipes += 1
                cells.append(current.trimmingCharacters(in: .whitespaces))
                current = ""
                index += 1
                continue
            }
            current.append(ch)
            index += 1
        }
        cells.append(current.trimmingCharacters(in: .whitespaces))
        if pipes == 0 { return nil }
        var start = 0
        var end = cells.count
        let trimmed = body.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("|") { start = 1 }
        if endsWithUnescapedPipe(body) { end -= 1 }
        if end <= start { return nil }
        return Array(cells[start..<end])
    }

    private static func endsWithUnescapedPipe(_ line: String) -> Bool {
        let endTrimmed = String(line.reversed().drop { $0 == " " || $0 == "\t" }.reversed())
        guard endTrimmed.hasSuffix("|") else { return false }
        var slashes = 0
        let chars = Array(endTrimmed)
        var index = chars.count - 2
        while index >= 0, chars[index] == "\\" {
            slashes += 1
            index -= 1
        }
        return slashes % 2 == 0
    }

    private static func delimiterAlign(_ cells: [String]) -> [Align]? {
        if cells.isEmpty { return nil }
        var align: [Align] = []
        for cell in cells {
            guard cell.range(of: #"^:?-+:?$"#, options: .regularExpression) != nil else { return nil }
            let left = cell.hasPrefix(":")
            let right = cell.hasSuffix(":")
            if left && right { align.append(.center) }
            else if right { align.append(.right) }
            else { align.append(.left) }
        }
        return align
    }

    /// v1.64: GFM parses a table cell as inlines. A block start is
    /// escaped so the cell does not become a heading, list, quote,
    /// rule, or fence. The escape pass paints the marker.
    /// `completed: false` returns `text`.
    static func protectCellBlocks(_ text: String, completed: Bool = true) -> String {
        if !completed || text.isEmpty { return text }
        let src = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = src.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var changed = false
        let out = lines.map { line -> String in
            let next = protectCellLine(line)
            if next != line { changed = true }
            return next
        }
        if !changed { return text.contains("\r") ? src : text }
        return out.joined(separator: "\n")
    }

    /// Never animate, including when Reduce Motion is off.
    static func cellInlineAnimation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    private static func protectCellLine(_ line: String) -> String {
        let chars = Array(line)
        var indent = 0
        while indent < chars.count && indent < 3 && chars[indent] == " " { indent += 1 }
        if indent < chars.count && chars[indent] == " " { return line }
        let rest = String(chars.dropFirst(indent))
        if rest.isEmpty { return line }
        if let fence = fenceOpener(rest) {
            return escapeRun(chars, start: indent, count: fence)
        }
        if isThematicCell(rest) { return escapeMarks(chars, indent: indent) }
        if rest.range(of: #"^#{1,6}(?:[ \t]|$)"#, options: .regularExpression) != nil {
            return insertBackslash(chars, indent)
        }
        if rest.hasPrefix(">") { return insertBackslash(chars, indent) }
        if rest.range(of: #"^[-*+](?:[ \t]|$)"#, options: .regularExpression) != nil {
            return insertBackslash(chars, indent)
        }
        if let match = rest.range(of: #"^(\d{1,9})([.)])(?:[ \t]|$)"#, options: .regularExpression) {
            let head = String(rest[match])
            let digits = head.prefix { $0.isNumber }.count
            return insertBackslash(chars, indent + digits)
        }
        return line
    }

    /// Length of a real opening fence marker, or nil when the line is not one.
    private static func fenceOpener(_ rest: String) -> Int? {
        let chars = Array(rest)
        guard let mark = chars.first, mark == "`" || mark == "~" else { return nil }
        var count = 0
        while count < chars.count, chars[count] == mark { count += 1 }
        if count < 3 { return nil }
        let marker = String(repeating: String(mark), count: count)
        let info = String(chars.dropFirst(count))
        if !MarkdownCodeSpan.fenceInfoAllowsOpen(marker: marker, info: info) { return nil }
        return count
    }

    private static func isThematicCell(_ rest: String) -> Bool {
        let chars = Array(rest)
        guard let mark = chars.first, mark == "-" || mark == "*" || mark == "_" else { return false }
        var count = 0
        for ch in chars {
            if ch == mark { count += 1 }
            else if ch == " " || ch == "\t" { continue }
            else { return false }
        }
        return count >= 3
    }

    private static func insertBackslash(_ chars: [Character], _ index: Int) -> String {
        var out = ""
        out.append(contentsOf: chars[..<index])
        out.append("\\")
        out.append(contentsOf: chars[index...])
        return out
    }

    private static func escapeRun(_ chars: [Character], start: Int, count: Int) -> String {
        var out = ""
        out.append(contentsOf: chars[..<start])
        for offset in 0..<count {
            out.append("\\")
            out.append(chars[start + offset])
        }
        out.append(contentsOf: chars[(start + count)...])
        return out
    }

    private static func escapeMarks(_ chars: [Character], indent: Int) -> String {
        var out = ""
        out.append(contentsOf: chars[..<indent])
        for ch in chars[indent...] {
            if ch == "-" || ch == "*" || ch == "_" {
                out.append("\\")
            }
            out.append(ch)
        }
        return out
    }

    /// v1.65: column count is the header, which matches the delimiter.
    /// A short body row gains empty cells. Cells past that width are
    /// dropped, so a wider row does not grow a left-aligned column.
    /// Alignment stays the delimiter row. The clipboard source is still
    /// the original lines, extra cells included.
    private static func rectangular(
        header: [String],
        rows: [[String]],
        align: [Align]
    ) -> (header: [String], rows: [[String]], align: [Align]) {
        let width = header.count
        func fit(_ cells: [String]) -> [String] {
            var next = Array(cells.prefix(width))
            while next.count < width { next.append("") }
            return next
        }
        var nextAlign = Array(align.prefix(width))
        while nextAlign.count < width { nextAlign.append(.left) }
        return (fit(header), rows.map { fit($0) }, nextAlign)
    }
}

/// v1.31 Copy on a rendered table. Markdown source, 1.5s Copied, no animation.
enum MarkdownTableCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy table"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    static func showsCopy(completed: Bool) -> Bool {
        completed
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Header, delimiter, and rows as written. Not tab-separated.
    static func clipboardText(_ source: String) -> String {
        return source
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
