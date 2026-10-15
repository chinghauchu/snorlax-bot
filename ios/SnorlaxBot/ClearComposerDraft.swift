// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.07: hardware ⌘⇧⌫ / ⌃⇧⌫ clears the open chat's composer draft.
/// The unsent text and the pending attachment chips go away. Nothing
/// is sent. An already empty composer (no text and no chips) is a
/// no-op. The composer does not own the chord. IME marked text keeps
/// it, and so does any other text field (find, rename, search,
/// settings, a widget, approve, or connect card). Nothing is cleared
/// when no chat is open. Plain Delete still removes the last chip
/// when the field is empty. No HTTP.
/// Keep in lockstep with `desktop/src/clearComposerDraft.ts`.
enum ClearComposerDraft {
    static let keysLabel = "⌘⇧⌫"
    static let action = "Clear the draft"

    /// Exactly one of Command or Control, plus Shift, on Backspace.
    /// Option stays put. Plain Delete, or ⌘⌫ without Shift, is not this chord.
    static func isChord(
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool,
        delete: Bool
    ) -> Bool {
        if option || !shift { return false }
        if command == control { return false }
        if delete { return true }
        return characters == "\u{8}"
    }

    /// The composer is a text field and still does not own ⌘⇧⌫.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// No characters and no pending chips. Whitespace is still a draft.
    static func alreadyEmpty(text: String, chipCount: Int) -> Bool {
        text.isEmpty && chipCount == 0
    }
}
