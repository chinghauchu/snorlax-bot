// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.16: hardware ⌘⇧H / ⌃⇧H opens or closes the Archived chats list.
/// The same flag as the sidebar Archived (n) control. Opening shows
/// that list when at least one chat is archived. Closing returns to
/// the main list. The chord works while a chat is open and while none
/// is open. The composer does not own the chord and does not insert
/// the letter. A key repeat is swallowed and does not flap. IME marked
/// text keeps it, and so does any other text field (find, rename,
/// search, settings, a widget, approve, or connect card). Nothing
/// opens when no chat is archived and the list is already closed.
/// No new HTTP. Keep in lockstep with `desktop/src/archiveListKey.ts`.
enum ArchiveListKey {
    static let keysLabel = "⌘⇧H"
    static let action = "Open or close Archived chats"

    /// Exactly one of Command or Control, plus Shift, with H.
    /// Option stays put. A plain H, or ⌘H without Shift, is not this chord.
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
        if String(key).lowercased() == "h" { return true }
        return characters.lowercased() == "h"
    }

    /// The first press toggles. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// Same result as the Archived (n) control. Hidden when nothing is
    /// archived, so a closed list stays closed. An open list closes.
    static func nextOpen(open: Bool, archivedCount: Int) -> Bool {
        if open { return false }
        return archivedCount > 0
    }

    /// The composer is a text field and still does not own ⌘⇧H.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
