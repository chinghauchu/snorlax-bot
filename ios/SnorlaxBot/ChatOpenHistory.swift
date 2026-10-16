// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.23: hardware ⌘[ / ⌃[ steps back through recently opened chats.
/// ⌘] / ⌃] steps forward. The history is in memory for this window.
/// Opening a chat from the list, ⌘1–⌘9, next or previous unread,
/// Option+Up / Option+Down, New agent, or the other open paths pushes.
/// Going back and then opening a different chat truncates the forward
/// entries. Deleted chats are skipped. Archived chats stay valid
/// targets because they are still on the roster. Either end is a no-op.
/// The composer does not own the chord and does not insert the bracket.
/// A key repeat is swallowed and does not step again. IME marked text
/// keeps it, and so does any other text field (find, rename, search,
/// settings, a widget, approve, or connect card). Shift and Option
/// stay put. No HTTP. Keep in lockstep with
/// `desktop/src/chatOpenHistory.ts`.
enum ChatOpenHistory {
    struct State: Equatable {
        var ids: [String]
        var index: Int

        static let empty = State(ids: [], index: -1)
    }

    enum Direction: String {
        case back
        case forward
    }

    static let keysLabel = "⌘[ / ⌘]"
    static let action = "Back or forward chat"
    static let backTitle = "Back to the previous chat"
    static let forwardTitle = "Forward to the next chat"

    /// Exactly one of Command or Control, with [ or ]. Option and
    /// Shift stay put. Repeat is not part of the match: the caller
    /// swallows a held key without stepping again.
    static func direction(
        key: Character,
        characters: String = "",
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Direction? {
        if option || shift { return nil }
        if command == control { return nil }
        let token = String(key)
        if token == "[" || characters == "[" { return .back }
        if token == "]" || characters == "]" { return .forward }
        return nil
    }

    /// The first press steps. A repeat of the held chord does not.
    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer is a text field and still does not own ⌘[ / ⌘].
    /// Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    /// A fresh roster replaces the window history with one chat, or none.
    static func replace(_ id: String?) -> State {
        guard let id else { return .empty }
        let next = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.isEmpty else { return .empty }
        return State(ids: [next], index: 0)
    }

    /// A user-initiated open. The chat already at the cursor is a no-op.
    /// Any other id truncates forward history and pushes.
    static func record(_ state: State, id: String) -> State {
        let next = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.isEmpty else { return state }
        if state.index >= 0 && state.index < state.ids.count && state.ids[state.index] == next {
            return state
        }
        // Empty state parked just past this chat. Opening it again
        // returns to that entry instead of stacking a duplicate.
        if state.index == state.ids.count && state.index > 0 && state.ids[state.index - 1] == next {
            return State(ids: state.ids, index: state.index - 1)
        }
        let keep = state.index < 0 ? 0 : min(state.index + 1, state.ids.count)
        var kept = Array(state.ids.prefix(keep))
        kept.append(next)
        return State(ids: kept, index: kept.count - 1)
    }

    /// The open chat left for the empty state. Back can return to it.
    /// A second close does not walk further.
    static func noteClosed(_ state: State) -> State {
        guard !state.ids.isEmpty, state.index >= 0, state.index < state.ids.count else {
            return state
        }
        return State(ids: state.ids, index: state.index + 1)
    }

    /// Step back or forward. Ids `alive` rejects are skipped. The index
    /// stays put when every candidate in that direction is gone.
    static func step(
        _ state: State,
        direction: Direction,
        alive: (String) -> Bool
    ) -> (state: State, id: String?) {
        guard !state.ids.isEmpty, state.index >= 0 else {
            return (state, nil)
        }
        let delta = direction == .back ? -1 : 1
        var index = state.index + delta
        while index >= 0 && index < state.ids.count {
            let id = state.ids[index]
            if alive(id) {
                return (State(ids: state.ids, index: index), id)
            }
            index += delta
        }
        return (state, nil)
    }
}
