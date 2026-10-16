// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.17: hardware ⌘⇧J / ⌃⇧J opens the next unread chat.
/// The order is the chat list's current visible order, the same one
/// Option+Up / Option+Down and ⌘1–⌘9 use: the Pinned group first, then
/// the rest, after All / Unread. Section headers are not rows. Archived
/// chats are included only while that list is showing; on iOS that
/// screen replaces the main roster. The search wraps. Opening uses the
/// same path as tapping the row, so that chat's draft and reading place
/// come back and the composer is focused. If no chat in that order is
/// unread, nothing changes. The open chat is not selected again when it
/// is the only unread row. The composer does not own the chord and does
/// not insert the letter. A key repeat is swallowed and does not jump
/// again. IME marked text keeps it, and so does any other text field
/// (find, rename, search, settings, a widget, approve, or connect card).
/// No new HTTP. Keep in lockstep with `desktop/src/nextUnreadChat.ts`.
enum NextUnreadChat {
    static let keysLabel = "⌘⇧J"
    static let action = "Next unread chat"

    /// Exactly one of Command or Control, plus Shift, with J.
    /// Option stays put. A plain J, or ⌘J without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without jumping again.
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
        if String(key).lowercased() == "j" { return true }
        return characters.lowercased() == "j"
    }

    /// The first press opens the next unread chat. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧J.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// Next unread id after `currentId`, wrapping through `ids`.
    /// The current id is never returned. A missing current starts at
    /// the first unread. Empty ids, and no unread chat other than the
    /// current row, are nil.
    static func target(ids: [String], currentId: String?, unread: Set<String>) -> String? {
        let rows = ids.filter { !$0.isEmpty }
        guard !rows.isEmpty else { return nil }
        let start: Int
        if let currentId, let index = rows.firstIndex(of: currentId) {
            start = index
        } else {
            start = -1
        }
        for step in 1...rows.count {
            let index = start < 0 ? step - 1 : (start + step) % rows.count
            let id = rows[index]
            if let currentId, id == currentId { continue }
            if unread.contains(id) { return id }
        }
        return nil
    }
}
