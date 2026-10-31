// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.34: collapse a long assistant list.
/// A completed bulleted, numbered, or task list with more than 8 items
/// shows the first 8 items and a muted Show more. Tap expands that
/// list and the control becomes Show less. Each list collapses on its
/// own, including a nested list. The choice is not saved. Streaming
/// stays plain text. The footnote list stays open. Copy still uses the
/// whole message. An active find match in that list stays fully
/// visible. The control is not focusable, so it does not move composer
/// focus. No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/listCollapse.ts`.
enum ListCollapse {
    static let showMore = "Show more"
    static let showLess = "Show less"
    static let showMoreAria = "Show more list"
    static let showLessAria = "Show less list"
    static let itemCount = 8

    static func overflows(_ count: Int, limit: Int = itemCount) -> Bool {
        count > limit
    }

    /// Clamp only a finished list the reader has not opened.
    static func shouldCollapse(
        completed: Bool,
        itemCount: Int,
        expanded: Bool,
        activeFind: Bool
    ) -> Bool {
        completed && overflows(itemCount) && !expanded && !activeFind
    }

    /// Hide the control while streaming and while find is showing the match.
    static func showsControl(completed: Bool, itemCount: Int, activeFind: Bool) -> Bool {
        completed && overflows(itemCount) && !activeFind
    }

    static func label(expanded: Bool) -> String {
        expanded ? showLess : showMore
    }

    static func accessibilityLabel(expanded: Bool) -> String {
        expanded ? showLessAria : showMoreAria
    }

    /// Items to paint. An open list keeps every item. Copy does not use this slice.
    static func visibleItems<T>(
        _ items: [T],
        collapsed: Bool,
        limit: Int = itemCount
    ) -> [T] {
        guard collapsed else { return items }
        return Array(items.prefix(limit))
    }

    /// Item text, one item per line. Markers are not added.
    static func findText(_ parts: [String]) -> String {
        parts.joined(separator: "\n")
    }

    /// This bubble owns the active find hit, and the query occurs in the list.
    static func findKeepsOpen(
        activeRowId: String,
        wrapScope: String,
        text: String,
        query: String
    ) -> Bool {
        guard !activeRowId.isEmpty, activeRowId == wrapScope else { return false }
        return !ChatFind.indexHits(in: text, query: query).isEmpty
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
