// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.18: hardware ⌘⇧Y / ⌃⇧Y regenerates the latest completed assistant
/// LEFT kind=message. The same path as the Regenerate control:
/// `POST { regenerate: true }` on the open 1:1 chat. A channel, a
/// reply that is still streaming, and a transcript with no completed
/// LEFT all skip. The composer does not own the chord and does not
/// insert the letter. A key repeat is swallowed and does not
/// regenerate again. IME marked text keeps it, and so does any other
/// text field (find, rename, search, settings, a widget, approve, or
/// connect card). Nothing is sent when no chat is open.
/// No new HTTP. Keep in lockstep with `desktop/src/regenerateLastReply.ts`.
enum RegenerateLastReply {
    static let keysLabel = "⌘⇧Y"
    static let action = "Regenerate the last reply"

    /// Exactly one of Command or Control, plus Shift, with Y.
    /// Option stays put. A plain Y, or ⌘Y without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without regenerating again.
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
        if String(key).lowercased() == "y" { return true }
        return characters.lowercased() == "y"
    }

    /// The first press regenerates. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧Y.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
