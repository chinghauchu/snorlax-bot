// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v2.15: edit an earlier message as a new draft.
/// Every settled user message with text can refill the composer.
/// Up-arrow still recalls only the latest, and only from an empty
/// field. Escape restores the composer text from immediately before
/// this action. Nothing is sent, queued, or removed. No new HTTP.
/// Keep in lockstep with `desktop/src/editEarlierMessage.ts`.
enum EditEarlierMessage {
    static let label = "Edit as new message"

    struct Draft {
        var text: String
        var caret: Int
        var restore: String
    }

    /// Settled user kind=message with text. An in-flight send is hidden.
    /// Attachment-only rows are not offered.
    static func offers(
        fromUser: Bool,
        kindMessage: Bool,
        content: String,
        pending: Bool
    ) -> Bool {
        !pending && fromUser && kindMessage && !content.isEmpty
    }

    /// Replace the composer with that message. Caret at the end.
    /// `restore` is the text that was already in the field.
    /// An empty message is not a draft. Does not send.
    static func draft(current: String, messageText: String) -> Draft? {
        guard !messageText.isEmpty else { return nil }
        return Draft(
            text: messageText,
            caret: (messageText as NSString).length,
            restore: current
        )
    }

    /// Escape puts the snapshot back and parks the caret at its end.
    static func restoredCaret(_ restore: String) -> Int {
        (restore as NSString).length
    }
}
