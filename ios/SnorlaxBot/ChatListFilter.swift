// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.88: Unread-only filter on the chat list.
/// All (the default) shows every chat. Unread keeps only rows that
/// currently paint the v0.70 accent dot: a reply that finished
/// off-screen, or a channel handoff unread that shares that same dot.
/// An empty Unread list shows a muted empty state. Opening a chat
/// still clears its unread, so that row leaves Unread. The choice
/// persists in UserDefaults. No new HTTP.
/// Keep in lockstep with `desktop/src/chatListFilter.ts`.
enum ChatListFilter {
    enum Mode: String {
        case all
        case unread
    }

    static let storageKey = "snorlax.chatListFilter"
    static let allLabel = "All"
    static let unreadLabel = "Unread"
    static let emptyLabel = "No unread chats"
    static let groupLabel = "Chat list"

    /// Missing or unknown values stay All.
    static func parse(_ raw: String?) -> Mode {
        raw == Mode.unread.rawValue ? .unread : .all
    }

    static func read(defaults: UserDefaults = .standard) -> Mode {
        parse(defaults.string(forKey: storageKey))
    }

    static func write(_ mode: Mode, defaults: UserDefaults = .standard) {
        let raw = mode == .unread ? Mode.unread.rawValue : Mode.all.rawValue
        defaults.set(raw, forKey: storageKey)
    }

    /// Unread hides a chat that is not painting the accent dot.
    static func includes(filter: Mode, hasUnreadDot: Bool) -> Bool {
        filter != .unread || hasUnreadDot
    }

    /// Muted empty state only while Unread is selected and nothing carries a dot.
    static func showEmpty(filter: Mode, unreadCount: Int) -> Bool {
        filter == .unread && unreadCount == 0
    }
}
