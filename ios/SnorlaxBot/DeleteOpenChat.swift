// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.12: hardware ⌘⇧D / ⌃⇧D asks to delete the open chat.
/// The chord opens the same confirm sidebar Delete uses. It does
/// not delete on the chord. Enter or Delete confirms. Esc or Cancel
/// aborts, and focus returns to the composer. A key repeat never
/// confirms, so a held key cannot delete the chat that opens next.
/// Only the confirm runs the existing removal (the DELETE for that
/// roster row, then the local pin, mute, archive, name, and unread
/// cleanup). After the row is gone, the next chat in the
/// Option+Up/Down visible order opens, or the empty state. The
/// composer does not own the chord and does not insert the letter.
/// IME marked text keeps it, and so does any other text field (find,
/// rename, search, settings, a widget, approve, or connect card).
/// Nothing is deleted when no chat is open. No new HTTP.
/// Keep in lockstep with `desktop/src/deleteOpenChat.ts`.
enum DeleteOpenChat {
    static let keysLabel = "⌘⇧D"
    static let action = "Ask to delete this chat"

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

    /// The first press opens the confirm. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// Same copy as the sidebar Delete confirm.
    static func confirmTitle(name: String, isChannel: Bool) -> String {
        let kind = isChannel ? "channel" : "agent"
        return "Delete \(name)? This removes the \(kind) and its chat."
    }

    /// Enter or Delete confirms. Esc cancels. A repeat never confirms
    /// (`swallow`). Backspace counts as Delete (the Mac Delete key).
    /// Modified chords stay with their own keys. Returns nil when the
    /// key is not part of this confirm.
    static func confirmAction(
        key: String,
        command: Bool = false,
        control: Bool = false,
        option: Bool = false,
        shift: Bool = false,
        isRepeat: Bool = false
    ) -> String? {
        if command || control || option || shift { return nil }
        switch key.lowercased() {
        case "escape":
            return "cancel"
        case "enter", "return", "delete", "backspace":
            return isRepeat ? "swallow" : "confirm"
        default:
            return nil
        }
    }

    private static var blockedConfirmKeys = Set<String>()

    /// A confirm key stays swallowed until it is released.
    static func blockConfirmKey(_ kind: String) {
        blockedConfirmKeys.insert(kind)
    }

    static func releaseConfirmKey(_ kind: String) {
        blockedConfirmKeys.remove(kind)
    }

    static func confirmKeyBlocked(_ kind: String) -> Bool {
        blockedConfirmKeys.contains(kind)
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
