// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.15: hardware ⌘⇧F / ⌃⇧F toggles the chat list's All / Unread
/// control. All shows every chat. Unread keeps rows that paint the
/// accent dot. The empty Unread state, the Pinned group, archived
/// chats, and UserDefaults stay on that control. The composer does
/// not own the chord and does not insert the letter. A key repeat is
/// swallowed and does not flap. IME marked text keeps it, and so does
/// any other text field (find, rename, search, settings, a widget,
/// approve, or connect card). The empty chat still toggles, because
/// the control does. ⌘F still finds. No new HTTP.
/// Keep in lockstep with `desktop/src/chatListFilterKey.ts`.
enum ChatListFilterKey {
    static let keysLabel = "⌘⇧F"
    static let action = "Toggle All / Unread"

    /// Exactly one of Command or Control, plus Shift, with F.
    /// Option stays put. A plain F, or ⌘F without Shift, is find.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without toggling again.
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
        if String(key).lowercased() == "f" { return true }
        return characters.lowercased() == "f"
    }

    /// The first press toggles. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧F.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
