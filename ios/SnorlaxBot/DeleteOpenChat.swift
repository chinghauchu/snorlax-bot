// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.12: hardware ⌘⇧D / ⌃⇧D deletes the open chat.
/// The chord runs the same removal as confirming sidebar Delete
/// (the existing DELETE for that roster row, then the local pin,
/// mute, archive, name, and unread cleanup). It does not present
/// the confirm dialog, so a held key cannot delete the chat that
/// opens next. After the row is gone, the next chat in the
/// Option+Up/Down visible order opens, or the empty state. The
/// composer does not own the chord and does not insert the letter.
/// IME marked text keeps it, and so does any other text field (find,
/// rename, search, settings, a widget, approve, or connect card).
/// Nothing is deleted when no chat is open. No new HTTP.
/// Keep in lockstep with `desktop/src/deleteOpenChat.ts`.
enum DeleteOpenChat {
    static let keysLabel = "⌘⇧D"
    static let action = "Delete this chat"

    /// Exactly one of Command or Control, plus Shift, with D.
    /// Option stays put. A plain D, or ⌘D without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without deleting again.
    static func isChord(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Bool {
        if option || !shift { return false }
        if command == control { return false }
        if String(key).lowercased() == "d" { return true }
        return characters.lowercased() == "d"
    }

    /// The first press deletes. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧D.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// Following row in the visible order. The last row, or an open
    /// chat that is not in that order, is nil (the empty state).
    static func nextId(visibleIds: [String], openId: String?) -> String? {
        guard let openId, !openId.isEmpty else { return nil }
        return ChatArchive.selectionAfterArchive(
            visibleIds: visibleIds,
            openId: openId,
            archivedId: openId
        )
    }
}
