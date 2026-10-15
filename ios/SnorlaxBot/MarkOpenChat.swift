// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.10: hardware ⌘⇧U / ⌃⇧U marks the open chat unread.
/// The chord calls the same `toggleChatRead` path as the chat-list
/// Mark as unread / Mark as read action. A read chat is written into
/// the existing unread set. A chat that already shows the accent dot
/// is marked read. A muted chat follows that menu: the mark does not
/// paint a dot or change the unread count. Opening the chat still
/// clears the dot. The composer does not own the chord and does not
/// insert the letter. IME marked text keeps it, and so does any other
/// text field (find, rename, search, settings, a widget, approve, or
/// connect card). A key repeat does not flap the mark. Nothing
/// changes when no chat is open. No HTTP.
/// Keep in lockstep with `desktop/src/markOpenChat.ts`.
enum MarkOpenChat {
    static let keysLabel = "⌘⇧U"
    static let action = "Mark as unread or read"

    /// Exactly one of Command or Control, plus Shift, with U.
    /// Option stays put. A plain U, or ⌘U without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without applying the sidebar action again.
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
        if String(key).lowercased() == "u" { return true }
        return characters.lowercased() == "u"
    }

    /// The first press applies. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧U.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
