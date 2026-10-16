// SPDX-License-Identifier: Apache-2.0

import SwiftUI

/// v1.26: hardware ⌘L / ⌃L quotes a transcript selection into the
/// composer, the same insert as the Quote menu. With no quotable
/// selection, ⌘L still only focuses the composer. A selection in the
/// composer is not quoted. A key repeat does not quote again. IME,
/// find, the shortcuts sheet, rename, the lightbox, and a card text
/// field keep the key. Nothing is sent. No HTTP.
/// Keep in lockstep with `desktop/src/quoteSelectionKey.ts`.
enum QuoteSelectionKey {
    static let keysLabel = "⌘L"
    static let action = "Quote the selection"

    /// Same chord as focus-the-composer. Shift and Option stay put.
    static func isChord(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Bool {
        FocusComposer.isChord(
            key: key,
            characters: characters,
            command: command,
            control: control,
            option: option,
            shift: shift
        )
    }

    /// Trimmed selection to quote, or nil when the chord should only focus.
    /// A text field keeps the chord. Empty and whitespace quote nothing.
    static func selectionToQuote(inTextField: Bool, selection: String?) -> String? {
        if inTextField { return nil }
        guard let selection else { return nil }
        return QuoteSelection.quoteable(selection)
    }

    /// The text view and the chat screen can both see one press.
    /// The first caller quotes. The second does not.
    private static var turnClaimed = false

    static func claimTurn() -> Bool {
        if turnClaimed { return false }
        turnClaimed = true
        DispatchQueue.main.async {
            turnClaimed = false
        }
        return true
    }
}

private struct QuoteChordBlockedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// True while find, shortcuts, rename, the lightbox, or another
    /// overlay owns the keyboard, so a message text view does not take ⌘L.
    var quoteChordBlocked: Bool {
        get { self[QuoteChordBlockedKey.self] }
        set { self[QuoteChordBlockedKey.self] = newValue }
    }
}
