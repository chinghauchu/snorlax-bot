// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.24: Cells on a completed assistant table.
/// Copies the painted grid as tab-separated text. Shows Copied for
/// 1.5s, then reverts. The delimiter row is not included. Copy still
/// copies the markdown source. Hidden while streaming. No animation.
/// Keep in lockstep with `desktop/src/tableCellsCopy.ts`.
enum TableCellsCopy {
    static let cellsLabel = "Cells"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy cells"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    static func showsCells(completed: Bool) -> Bool {
        completed
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : cellsLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Header and body, one row per line, cells separated by a tab.
    /// Width is the header. A short row is padded. Cells past that
    /// width are dropped. A `\|` that did not split the row is `|`.
    /// Other backslashes and inline markers stay. A cell with a tab,
    /// newline, or quote is wrapped in quotes. No trailing newline.
    static func clipboardText(header: [String], rows: [[String]]) -> String {
        let width = header.count
        if width == 0 { return "" }
        func fit(_ cells: [String]) -> [String] {
            var next = Array(cells.prefix(width))
            while next.count < width { next.append("") }
            return next
        }
        let lines = [fit(header)] + rows.map { fit($0) }
        return lines.map { row in
            row.map { tsvCell(literalPipes($0)) }.joined(separator: "\t")
        }.joined(separator: "\n")
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    private static func literalPipes(_ cell: String) -> String {
        var out = ""
        var index = cell.startIndex
        while index < cell.endIndex {
            let next = cell.index(after: index)
            if cell[index] == "\\", next < cell.endIndex, cell[next] == "|" {
                out.append("|")
                index = cell.index(after: next)
                continue
            }
            out.append(cell[index])
            index = next
        }
        return out
    }

    private static func tsvCell(_ cell: String) -> String {
        if cell.contains("\t") || cell.contains("\n") || cell.contains("\r") || cell.contains("\"") {
            let escaped = cell.replacingOccurrences(of: "\"", with: "\"\"")
            return "\"" + escaped + "\""
        }
        return cell
    }
}
