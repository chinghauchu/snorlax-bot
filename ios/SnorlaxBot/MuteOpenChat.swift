// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.09: hardware ⌘⇧M / ⌃⇧M mutes or unmutes the open chat.
/// The chord calls the same `toggleChatMute` path as the chat-list
/// Mute / Unmute action. A new mute is appended; unmute removes that
/// id. Muted chats skip the unread accent and the unread count. The
/// composer does not own the chord and does not insert the letter.
/// IME marked text keeps it, and so does any other text field (find,
/// rename, search, settings, a widget, approve, or connect card).
/// A key repeat does not flap Mute / Unmute. Nothing changes when no
/// chat is open. No HTTP.
/// Keep in lockstep with `desktop/src/muteOpenChat.ts`.
enum MuteOpenChat {
    static let keysLabel = "⌘⇧M"
    static let action = "Mute or unmute this chat"

    /// Exactly one of Command or Control, plus Shift, with M.
    /// Option stays put. A plain M, or ⌘M without Shift, is not this chord.
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
        if String(key).lowercased() == "m" { return true }
        return characters.lowercased() == "m"
    }

    /// The first press toggles. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧M.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
