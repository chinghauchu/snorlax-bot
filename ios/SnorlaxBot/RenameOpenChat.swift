// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.11: hardware ⌘⇧R / ⌃⇧R starts rename on the open chat.
/// The chord uses the same list inline field as Rename: Return or
/// leaving the field keeps a trimmed non-empty name, Escape restores
/// the previous one, and a blank name is rejected. The composer does
/// not own the chord and does not insert the letter. IME marked text
/// keeps it, and so does any other text field (find, rename, search,
/// settings, a widget, approve, or connect card). A key repeat does
/// not start a second rename, and a rename already in progress does
/// not flap. Nothing changes when no chat is open. No HTTP.
/// Keep in lockstep with `desktop/src/renameOpenChat.ts`.
enum RenameOpenChat {
    static let keysLabel = "⌘⇧R"
    static let action = "Rename this chat"

    /// Exactly one of Command or Control, plus Shift, with R.
    /// Option stays put. A plain R, or ⌘R without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without starting another rename.
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
        if String(key).lowercased() == "r" { return true }
        return characters.lowercased() == "r"
    }

    /// The first press starts rename. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// A rename already in progress, or a key repeat, does not start another.
    static func shouldStart(isRepeat: Bool, renaming: Bool) -> Bool {
        !isRepeat && !renaming
    }

    /// The composer is a text field and still does not own ⌘⇧R.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
