// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.14: hardware ⌘⇧G / ⌃⇧G collapses or expands every tool-trace
/// group in the open chat. A group is the v0.56 run of 2+ consecutive
/// kind=tool lines. A single tool line is not a group. If any group
/// is expanded, every group collapses. If every group is collapsed,
/// every group expands. The same chevron and `N tools` line stays.
/// The composer does not own the chord and does not insert the letter.
/// A key repeat is swallowed and does not flap. IME marked text keeps
/// it, and so does any other text field (find, rename, search,
/// settings, a widget, approve, or connect card). Nothing changes
/// when no chat is open or the loaded transcript has no group.
/// No new HTTP. Keep in lockstep with `desktop/src/toolTraceGroups.ts`.
enum ToolTraceGroups {
    static let keysLabel = "⌘⇧G"
    static let action = "Collapse or expand tool traces"

    /// Exactly one of Command or Control, plus Shift, with G.
    /// Option stays put. A plain G, or ⌘G without Shift, is not this chord.
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
        if String(key).lowercased() == "g" { return true }
        return characters.lowercased() == "g"
    }

    /// The first press toggles. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘⇧G.
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }
}
