// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.19: hardware ⌘⇧S / ⌃⇧S moves focus into the sidebar chat list.
/// The open chat's row is preferred when that row is visible.
/// Otherwise the first visible row in the current All / Unread, pin,
/// and archive order. The composer does not own the chord and does
/// not insert the letter. A key repeat is swallowed and does not move
/// focus again. IME marked text keeps it, and so does any other text
/// field (find, rename, search, settings, a widget, approve, or
/// connect card). A list row that already has focus keeps the key.
/// Nothing changes when there is no chat list to focus.
/// No new HTTP. Keep in lockstep with `desktop/src/focusSidebarList.ts`.
enum FocusSidebarList {
    static let keysLabel = "⌘⇧S"
    static let action = "Focus the chat list"

    /// Exactly one of Command or Control, plus Shift, with S.
    /// Option stays put. A plain S, or ⌘S without Shift, is not this chord.
    /// Repeat is not part of the match: the caller swallows a held key
    /// without moving focus again.
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
        if String(key).lowercased() == "s" { return true }
        return characters.lowercased() == "s"
    }

    /// The first press moves focus. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧S.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// The open chat's row when it is in `ids`, otherwise the first id.
    /// An empty list is nil. Empty strings are not rows.
    static func target(ids: [String], openID: String?) -> String? {
        let visible = ids.filter { !$0.isEmpty }
        guard let first = visible.first else { return nil }
        if let openID, visible.contains(openID) { return openID }
        return first
    }
}
