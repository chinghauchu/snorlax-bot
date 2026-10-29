// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v2.19: collapse a long assistant code block.
/// A completed fence or indented code block longer than 14 lines shows
/// the first 14 lines and a muted Show more. Tap expands that block and
/// the control becomes Show less. Each block collapses on its own.
/// Streaming stays open. A rendered mermaid diagram is not a code block
/// here. Copy still copies the full source. An active find match in
/// that block stays fully visible. The control is not focusable, so it
/// does not move composer focus. No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/codeBlockCollapse.ts`.
enum CodeBlockCollapse {
    static let showMore = "Show more"
    static let showLess = "Show less"
    static let showMoreAria = "Show more code"
    static let showLessAria = "Show less code"
    static let lines = 14

    /// One trailing newline is the fence closer, not an extra line.
    static func body(_ source: String) -> String {
        guard source.hasSuffix("\n") else { return source }
        return String(source.dropLast())
    }

    static func lineCount(_ source: String) -> Int {
        let text = body(source)
        if text.isEmpty { return 0 }
        return text.split(separator: "\n", omittingEmptySubsequences: false).count
    }

    static func overflows(_ lineCount: Int, limit: Int = lines) -> Bool {
        lineCount > limit
    }

    /// Clamp only a finished block the reader has not opened.
    static func shouldCollapse(
        completed: Bool,
        lineCount: Int,
        expanded: Bool,
        activeFind: Bool
    ) -> Bool {
        completed && overflows(lineCount) && !expanded && !activeFind
    }

    /// Hide the control while streaming and while find is showing the match.
    static func showToggle(completed: Bool, lineCount: Int, activeFind: Bool) -> Bool {
        completed && overflows(lineCount) && !activeFind
    }

    static func label(expanded: Bool) -> String {
        expanded ? showLess : showMore
    }

    static func accessibilityLabel(expanded: Bool) -> String {
        expanded ? showLessAria : showMoreAria
    }

    /// First 14 lines when collapsed. An open block keeps its source.
    static func visibleText(_ source: String, collapsed: Bool) -> String {
        guard collapsed else { return source }
        let text = body(source)
        if text.isEmpty { return text }
        let parts = text.split(separator: "\n", omittingEmptySubsequences: false)
        return parts.prefix(lines).joined(separator: "\n")
    }

    /// Bubble row id stored in a fence wrap id. The first NUL ends it.
    static func findRowId(wrapId: String) -> String {
        guard let nul = wrapId.firstIndex(of: "\u{0}") else { return wrapId }
        return String(wrapId[..<nul])
    }

    /// The bubble that owns the active find hit, and the code itself
    /// contains that query. The block stays fully open.
    static func findKeepsOpen(
        activeRowId: String,
        wrapId: String,
        source: String,
        query: String
    ) -> Bool {
        guard !activeRowId.isEmpty, findRowId(wrapId: wrapId) == activeRowId else {
            return false
        }
        return !ChatFind.indexHits(in: body(source), query: query).isEmpty
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animates(reduceMotion: Bool) -> Bool {
        _ = reduceMotion
        return false
    }
}
