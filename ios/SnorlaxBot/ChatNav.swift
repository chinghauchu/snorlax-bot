// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.92: previous / next chat from a hardware keyboard.
/// Option+Up / Option+Down opens the neighbor in the chat list's
/// visible order: the v0.89 Pinned group first, then the rest, after
/// the v0.88 All / Unread filter. No wrap — the ends stay put. An
/// open chat hidden by Unread does not jump. IME composition does not
/// navigate. Plain Up stays recall (v0.68). In-chat find keeps its own
/// previous / next. Opening uses the same path as tapping the row.
/// No HTTP.
/// Keep in lockstep with `desktop/src/chatNav.ts`.
enum ChatNav {
    static let keysLabel = "Option ↑ / Option ↓"
    static let action = "Previous or next chat"

    enum Key {
        case up
        case down
        case other
    }

    /// -1 previous, +1 next, or nil when this key must not switch chats.
    /// Plain arrows are not this chord. Other modifiers stay with the field.
    static func direction(
        key: Key,
        option: Bool,
        command: Bool,
        control: Bool,
        shift: Bool,
        composing: Bool,
        findOpen: Bool
    ) -> Int? {
        if composing || findOpen { return nil }
        if !option || command || control || shift { return nil }
        switch key {
        case .up: return -1
        case .down: return 1
        case .other: return nil
        }
    }

    /// Neighbor in visible order. No wrap. A current id missing from
    /// the list stays put.
    static func adjacent(ids: [String], currentId: String?, direction: Int) -> String? {
        guard direction == -1 || direction == 1 else { return nil }
        guard let currentId, !currentId.isEmpty else { return nil }
        guard let index = ids.firstIndex(of: currentId) else { return nil }
        let next = index + direction
        guard ids.indices.contains(next) else { return nil }
        let id = ids[next]
        if id.isEmpty || id == currentId { return nil }
        return id
    }
}
