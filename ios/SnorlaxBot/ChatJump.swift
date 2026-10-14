// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.05: hardware ⌘1–⌘8 / ⌃1–⌃8 opens that chat in the chat list's
/// current visible order. ⌘9 / ⌃9 opens the last chat, the Slack and
/// browser convention. A number past the visible count does nothing.
/// The order matches Option+Up / Option+Down: the Pinned group first,
/// then the rest, after All / Unread. Section headers are not rows.
/// Archived chats are skipped unless the Archived list is what is
/// showing; that screen replaces the main roster. The name-search
/// field does not change this order. The composer does not own the
/// chord. Opening uses the same path as tapping the row, so per-chat
/// drafts stay. IME marked text keeps the key, and so does any other
/// text field (find, rename, search, a widget field, settings).
/// Nothing is sent. No HTTP.
/// Keep in lockstep with `desktop/src/chatJump.ts`.
enum ChatJump {
    static let keysLabel = "⌘1-⌘9"
    static let action = "Open a chat (9 is last)"

    /// 1...9 for exactly one of Command or Control with that digit.
    /// Shift and Option stay put. A plain digit is not this chord.
    static func slot(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Int? {
        if option || shift { return nil }
        if command == control { return nil }
        if let value = digit(String(key)) { return value }
        return digit(characters)
    }

    /// 1...8 are indexes. 9 is the last id, including when the list
    /// is shorter or longer than nine. Past the end, and an empty
    /// list, are nil.
    static func target(ids: [String], slot: Int) -> String? {
        guard (1...9).contains(slot) else { return nil }
        let rows = ids.filter { !$0.isEmpty }
        guard !rows.isEmpty else { return nil }
        if slot == 9 {
            return rows[rows.count - 1]
        }
        guard slot <= rows.count else { return nil }
        return rows[slot - 1]
    }

    /// Main ids are pinned, then the rest, with All / Unread applied.
    /// Headers are not passed in. Archived ids join only while that
    /// list is showing. `archiveReplacesMain` is the iOS Archived
    /// screen: those rows are the whole order. Desktop appends.
    static func order(
        mainIds: [String],
        archivedIds: [String],
        archiveListShowing: Bool,
        archiveReplacesMain: Bool
    ) -> [String] {
        let main = mainIds.filter { !$0.isEmpty }
        let archived = archivedIds.filter { !$0.isEmpty }
        if archiveListShowing && archiveReplacesMain { return archived }
        if !archiveListShowing { return main }
        var seen = Set(main)
        return main + archived.filter { seen.insert($0).inserted }
    }

    /// The composer is a text field and still does not own the chord.
    /// Any other text field does, including find, rename, search, and
    /// a widget, approve, or connect field.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    private static func digit(_ raw: String) -> Int? {
        guard raw.count == 1, let value = Int(raw), (1...9).contains(value) else {
            return nil
        }
        return value
    }
}
