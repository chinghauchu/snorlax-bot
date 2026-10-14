// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.99: hardware ⌘L / ⌃L focuses the composer and inserts nothing.
/// Plain letters are not captured (the software keyboard stays down).
/// Find, the shortcuts sheet, and the lightbox keep their keys.
/// Nothing auto-sends. No HTTP.
/// Keep in lockstep with `desktop/src/focusComposerKey.ts`.
enum FocusComposer {
    static let keysLabel = "⌘L"
    static let action = "Focus the composer"

    /// Exactly one of Command or Control, with L. Shift and Option stay put.
    /// A plain L is not this chord.
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
        if String(key).lowercased() == "l" { return true }
        return characters.lowercased() == "l"
    }
}
