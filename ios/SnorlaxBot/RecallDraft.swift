// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.68: recall the user's most recent sent message into the composer.
/// Empty composer + Up-arrow fills an editable draft, caret at the end.
/// Escape, or clearing the field, restores empty. No recall while the
/// composer has text or IME is composing. The long-press label is
/// `Edit as new message`, added beside the v0.65 timestamp row.
/// No new HTTP. Keep in lockstep with `desktop/src/recallDraft.ts`.
enum RecallDraft {
    static let editAsNewMessage = "Edit as new message"

    struct Row {
        var fromUser: Bool
        var kindMessage: Bool
        var content: String
    }

    /// User `kind=message` with text. Attachment-only rows are skipped.
    static func isRecallable(_ row: Row) -> Bool {
        row.fromUser && row.kindMessage && !row.content.isEmpty
    }

    /// Latest recallable user message in this transcript, or nil.
    static func latestText(in rows: [Row]) -> String? {
        for row in rows.reversed() where isRecallable(row) {
            return row.content
        }
        return nil
    }

    /// Index of that message, for the long-press item on that bubble only.
    static func latestIndex(in rows: [Row]) -> Int? {
        for index in rows.indices.reversed() where isRecallable(rows[index]) {
            return index
        }
        return nil
    }

    /// Up-arrow recalls only from an empty composer with IME idle.
    static func arrowUpRecalls(composerText: String, composing: Bool) -> Bool {
        !composing && composerText.isEmpty
    }

    /// Escape restores an armed recall to empty.
    /// Stop wins while generating. IME and a pending widget / approve /
    /// connect card keep Escape.
    static func escapeClears(
        armed: Bool,
        composing: Bool,
        busy: Bool,
        pendingWidget: Bool,
        pendingApprove: Bool,
        pendingConnect: Bool
    ) -> Bool {
        armed
            && !composing
            && !busy
            && !pendingWidget
            && !pendingApprove
            && !pendingConnect
    }

    /// Clearing the field ends the recall. Edits that leave text stay armed.
    static func armedAfterEdit(text: String, wasArmed: Bool) -> Bool {
        wasArmed && !text.isEmpty
    }
}
