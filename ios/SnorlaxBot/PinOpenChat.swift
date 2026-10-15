// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.08: hardware ⌘⇧P / ⌃⇧P pins or unpins the open chat.
/// The chord calls the same `toggleChatPin` path as the chat-list
/// Pin / Unpin action. A new pin is appended; unpin removes that id.
/// The composer does not own the chord and does not insert the letter.
/// IME marked text keeps it, and so does any other text field (find,
/// rename, search, settings, a widget, approve, or connect card).
/// A key repeat does not flap Pin / Unpin. Nothing changes when no
/// chat is open. No HTTP.
/// Keep in lockstep with `desktop/src/pinOpenChat.ts`.
enum PinOpenChat {
    static let keysLabel = "⌘⇧P"
    static let action = "Pin or unpin this chat"

    /// Exactly one of Command or Control, plus Shift, with P.
    /// Option stays put. A plain P, or ⌘P without Shift, is not this chord.
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
        if String(key).lowercased() == "p" { return true }
        return characters.lowercased() == "p"
    }

    /// The first press toggles. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧P.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
