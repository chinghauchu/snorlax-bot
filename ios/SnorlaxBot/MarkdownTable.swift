// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

/// v1.31: GFM pipe tables on completed assistant LEFT messages.
/// Copy puts the table's markdown source on the clipboard, then
/// shows Copied for 1.5s. A wide table scrolls horizontally.
/// Streaming stays plain text. No animation. No new HTTP.
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
                current.append(ch)
                index += 1
                continue
            }
            if ch == "\\" {
                if index + 1 < chars.count {
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

    private static func rectangular(
        header: [String],
        rows: [[String]],
        align: [Align]
    ) -> (header: [String], rows: [[String]], align: [Align]) {
        var width = max(header.count, align.count)
        for row in rows { width = max(width, row.count) }
        func pad(_ cells: [String]) -> [String] {
            var next = Array(cells.prefix(width))
            while next.count < width { next.append("") }
            return next
        }
        var nextAlign = Array(align.prefix(width))
        while nextAlign.count < width { nextAlign.append(.left) }
        return (pad(header), rows.map { pad($0) }, nextAlign)
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
