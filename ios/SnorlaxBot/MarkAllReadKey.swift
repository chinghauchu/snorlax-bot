// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.20: hardware ⌘⇧O / ⌃⇧O marks every chat read through the same
/// path as the Mark all as read control. Archived chats and channel
/// handoff dots are included. Nothing unread is a no-op. The composer
/// does not own the chord and does not insert the letter. A key
/// repeat is swallowed and does not clear again. IME marked text
/// keeps it, and so does any other text field (find, rename, search,
/// settings, a widget, approve, or connect card). A focused list row
/// does not. The empty chat still clears, because the control does.
/// No new HTTP. Keep in lockstep with `desktop/src/markAllReadKey.ts`.
enum MarkAllReadKey {
    static let keysLabel = "⌘⇧O"
    static let action = "Mark all as read"

    /// Exactly one of Command or Control, plus Shift, with O.
    /// Option stays put. A plain O, or ⌘O without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without clearing again.
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
        if String(key).lowercased() == "o" { return true }
        return characters.lowercased() == "o"
    }

    /// The first press clears. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧O.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
