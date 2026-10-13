// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.87: Delete removes the last pending attachment chip when the
/// composer text is empty. One chip per keypress (the rightmost / most
/// recently added). Text still edits as usual. No chips does nothing.
/// Hardware Delete and the on-screen keyboard both reach `deleteBackward`.
/// Nothing auto-sends. No new HTTP.
/// Keep in lockstep with `desktop/src/backspaceChip.ts`.
enum BackspaceChip {
    /// Empty field, IME idle, no Shift/Alt/Cmd/Ctrl chord.
    static func composerAllowsRemove(
        composerText: String,
        composing: Bool,
        chord: Bool
    ) -> Bool {
        !composing && !chord && composerText.isEmpty
    }

    /// Plain Delete removes the last chip only from an empty composer.
    static func removesLast(
        composerText: String,
        chipCount: Int,
        composing: Bool,
        chord: Bool
    ) -> Bool {
        composerAllowsRemove(
            composerText: composerText,
            composing: composing,
            chord: chord
        ) && chipCount > 0
    }

    /// Drop the last chip. An empty list stays empty.
    static func withoutLast<T>(_ chips: [T]) -> [T] {
        guard !chips.isEmpty else { return chips }
        return Array(chips.dropLast())
    }
}
