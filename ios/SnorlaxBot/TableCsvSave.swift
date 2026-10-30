// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.26: Save on a completed assistant table.
/// Writes the painted grid as table.csv. Shows Saved for 1.5s, then
/// reverts. This side hands that file to the system share sheet and
/// does not ask for photo-library permission. The delimiter row is not
/// included. Copy still copies the markdown source. Cells still copies
/// tab-separated text. Hidden while streaming and on user bubbles.
/// No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/tableCsvSave.ts`.
enum TableCsvSave {
    static let saveLabel = "Save"
    static let savedLabel = "Saved"
    static let saveAria = "Save table"
    static let savedAria = "Saved"
    static let filename = "table.csv"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// Same gate as table Copy and Cells: a finished assistant table only.
    static func showsSave(completed: Bool) -> Bool {
        completed
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not remove the table or send.
    static func keepsTable() -> Bool { true }

    /// Header and body as CSV. Width is the header. A short row is
    /// padded. Cells past that width are dropped. A `\|` that did not
    /// split the row is `|`. Other backslashes and inline markers stay.
    /// A cell with a comma, quote, or line break is wrapped in quotes.
    /// A tab does not force quotes. The file ends with a line feed.
    /// An empty header writes nothing.
    static func csvText(header: [String], rows: [[String]]) -> String {
        let width = header.count
        if width == 0 { return "" }
        func fit(_ cells: [String]) -> [String] {
            var next = Array(cells.prefix(width))
            while next.count < width { next.append("") }
            return next
        }
        let lines = [fit(header)] + rows.map { fit($0) }
        let body = lines.map { row in
            row.map { csvCell(literalPipes($0)) }.joined(separator: ",")
        }.joined(separator: "\n")
        return body + "\n"
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Write UTF-8 CSV under the temporary directory. A failed write
    /// returns nil and the caller does not present the sheet or Saved.
    static func writeFile(csv: String, filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-table", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(csv.utf8).write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }

    private static func safeLeaf(_ filename: String) -> String {
        if filename.isEmpty
            || filename.contains("/")
            || filename.contains("\\")
            || filename == "."
            || filename == ".."
            || filename.hasPrefix(".") {
            return "table.csv"
        }
        return filename
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

    private static func csvCell(_ cell: String) -> String {
        if cell.contains(",") || cell.contains("\"") || cell.contains("\n") || cell.contains("\r") {
            let escaped = cell.replacingOccurrences(of: "\"", with: "\"\"")
            return "\"" + escaped + "\""
        }
        return cell
    }
}
