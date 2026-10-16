// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.22: hardware ⌘⇧B / ⌃⇧B unarchives the open chat.
/// The chord calls the same `unarchiveChat` path as the chat-list
/// Unarchive action when that chat is archived. The id leaves the
/// UserDefaults archive set, so the row leaves the Archived list and
/// returns to the main list in pin order if it is pinned, otherwise
/// in roster order. The open chat stays open. ⌘⇧A still only archives.
/// The composer does not own the chord and does not insert the letter.
/// A key repeat is swallowed and does not unarchive again. IME marked
/// text keeps it, and so does any other text field (find, rename,
/// search, settings, a widget, approve, or connect card). Nothing
/// changes when no chat is open or the open chat is not archived.
/// No HTTP. Keep in lockstep with `desktop/src/unarchiveOpenChat.ts`.
enum UnarchiveOpenChat {
    static let keysLabel = "⌘⇧B"
    static let action = "Unarchive this chat"

    /// Exactly one of Command or Control, plus Shift, with B.
    /// Option stays put. A plain B, or ⌘B without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without unarchiving again.
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
        if String(key).lowercased() == "b" { return true }
        return characters.lowercased() == "b"
    }

    /// The first press unarchives. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧B.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
