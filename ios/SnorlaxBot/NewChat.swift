// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.04: hardware ⌘N / ⌃N starts a new chat.
/// The chord calls the same `createAgent` path as the New agent item
/// in the chat-list Create menu. That path opens the chat and focuses
/// the composer. The composer does not own the chord. IME marked text
/// keeps it, and so does any other text field (find, rename, search,
/// settings). Nothing is sent. No HTTP.
/// Keep in lockstep with `desktop/src/newChatKey.ts`.
enum NewChat {
    static let keysLabel = "⌘N"
    static let action = "New chat"

    /// Exactly one of Command or Control, with N. Shift and Option stay put.
    /// A plain N is not this chord.
    static func isChord(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Bool {
        if option || shift { return false }
        if command == control { return false }
        if String(key).lowercased() == "n" { return true }
        return characters.lowercased() == "n"
    }

    /// The composer is a text field and still does not own ⌘N.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
