// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.06: hardware ⌘⇧A / ⌃⇧A archives the open chat.
/// The chord calls the same `archiveChat` path as the chat-list
/// Archive action. That path leaves the main list and, when the
/// archived chat was open, opens the next Option+Down chat or the
/// empty state. The composer does not own the chord. IME marked text
/// keeps it, and so does any other text field (find, rename, search,
/// settings, a widget, approve, or connect card). Nothing is archived
/// when no chat is open. No HTTP.
/// Keep in lockstep with `desktop/src/archiveOpenChat.ts`.
enum ArchiveOpenChat {
    static let keysLabel = "⌘⇧A"
    static let action = "Archive this chat"

    /// Exactly one of Command or Control, plus Shift, with A.
    /// Option stays put. A plain A, or ⌘A without Shift, is not this chord.
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
        if String(key).lowercased() == "a" { return true }
        return characters.lowercased() == "a"
    }

    /// The composer is a text field and still does not own ⌘⇧A.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
