// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.21: hardware ⌘⇧K / ⌃⇧K opens the previous unread chat.
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
/// ⌘K without Shift is not this chord. No new HTTP. Keep in lockstep
/// with `desktop/src/previousUnreadChat.ts`.
enum PreviousUnreadChat {
    static let keysLabel = "⌘⇧K"
    static let action = "Previous unread chat"

    /// Exactly one of Command or Control, plus Shift, with K.
    /// Option stays put. A plain K, or ⌘K without Shift, is not this chord.
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
        if String(key).lowercased() == "k" { return true }
        return characters.lowercased() == "k"
    }

    /// The first press opens the previous unread chat. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧K.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// Previous unread id before `currentId`, wrapping through `ids`.
    /// The current id is never returned. A missing current starts at
    /// the last unread. Empty ids, and no unread chat other than the
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
            let index = start < 0 ? rows.count - step : (start - step + rows.count) % rows.count
            let id = rows[index]
            if let currentId, id == currentId { continue }
            if unread.contains(id) { return id }
        }
        return nil
    }
}
