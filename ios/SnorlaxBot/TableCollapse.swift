// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.33: collapse a long assistant table.
/// A completed table with more than 8 body rows shows the header and
/// the first 8 body rows, plus a muted Show more. Tap expands that
/// table and the control becomes Show less. Each table collapses on
/// its own. The choice is not saved. Streaming stays plain text.
/// Copy, Cells, and Save still use the full table. An active find
/// match in that table stays fully visible. The control is not
/// focusable, so it does not move composer focus. No animation.
/// No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/tableCollapse.ts`.
enum TableCollapse {
    static let showMore = "Show more"
    static let showLess = "Show less"
    static let showMoreAria = "Show more table"
    static let showLessAria = "Show less table"
    static let bodyRows = 8

    static func overflows(_ rowCount: Int, limit: Int = bodyRows) -> Bool {
        rowCount > limit
    }

    /// Clamp only a finished table the reader has not opened.
    static func shouldCollapse(
        completed: Bool,
        rowCount: Int,
        expanded: Bool,
        activeFind: Bool
    ) -> Bool {
        completed && overflows(rowCount) && !expanded && !activeFind
    }

    /// Hide the control while streaming and while find is showing the match.
    static func showToggle(completed: Bool, rowCount: Int, activeFind: Bool) -> Bool {
        completed && overflows(rowCount) && !activeFind
    }

    static func label(expanded: Bool) -> String {
        expanded ? showLess : showMore
    }

    static func accessibilityLabel(expanded: Bool) -> String {
        expanded ? showLessAria : showMoreAria
    }

    /// Body rows to paint. The header is separate. An open table keeps every row.
    static func visibleRows(
        _ rows: [[String]],
        collapsed: Bool,
        limit: Int = bodyRows
    ) -> [[String]] {
        guard collapsed else { return rows }
        return Array(rows.prefix(limit))
    }

    /// Header and body cells, one cell per line. The delimiter row is not included.
    static func findText(header: [String], rows: [[String]]) -> String {
        var lines: [String] = []
        lines.append(contentsOf: header)
        for row in rows {
            lines.append(contentsOf: row)
        }
        return lines.joined(separator: "\n")
    }

    /// This bubble owns the active find hit, and the query occurs in the table.
    static func findKeepsOpen(
        activeRowId: String,
        wrapScope: String,
        header: [String],
        rows: [[String]],
        query: String
    ) -> Bool {
        guard !activeRowId.isEmpty, activeRowId == wrapScope else { return false }
        let text = findText(header: header, rows: rows)
        return !ChatFind.indexHits(in: text, query: query).isEmpty
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
