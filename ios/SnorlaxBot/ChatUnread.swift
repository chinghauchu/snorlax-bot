// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.70 unread dot on a sidebar chat row.
/// A non-empty assistant kind=message that finishes while that chat is
/// not on screen, or while the app is not active, marks the row.
/// Opening the chat clears it. Becoming active while that chat is
/// already on screen clears it too. The set persists in UserDefaults
/// (`snorlax.chatUnread`). No HTTP.
/// Channel handoff unread stays a separate in-memory set.
/// v0.90: the chat list can mark a read chat into this same set, or
/// clear a dotted chat. Mark as read also drops a channel handoff
/// dot so the accent dot leaves the row. Opening the chat still
/// clears this set. No new storage key.
/// Keep in lockstep with `desktop/src/chatUnread.ts`.
struct ChatUnread {
    static let storageKey = "snorlax.chatUnread"
    static let markUnreadLabel = "Mark as unread"
    static let markReadLabel = "Mark as read"

    /// A dotted row offers Mark as read. A read row offers Mark as unread.
    static func actionLabel(showsDot: Bool) -> String {
        showsDot ? markReadLabel : markUnreadLabel
    }

    /// The v0.70 accent dot. Reply unread is the persisted set. A
    /// channel handoff unread shares that same dot. Handoff only
    /// paints on a channel row.
    static func showsDot(
        chatId: String,
        replyUnread: Set<String>,
        handoffUnread: Set<String>,
        channel: Bool
    ) -> Bool {
        guard !chatId.isEmpty else { return false }
        if channel, handoffUnread.contains(chatId) { return true }
        return replyUnread.contains(chatId)
    }

    struct ReplySnapshot {
        var fromUser: Bool
        var kindMessage: Bool
        var hasToken: Bool
    }

    private var ids: Set<String>
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.ids = Self.load(from: defaults)
    }

    var snapshot: Set<String> { ids }

    func contains(_ chatId: String) -> Bool {
        ids.contains(chatId)
    }

    /// Returns true when the set changed.
    @discardableResult
    mutating func mark(_ chatId: String) -> Bool {
        guard !chatId.isEmpty, !ids.contains(chatId) else { return false }
        ids.insert(chatId)
        persist()
        return true
    }

    /// Opening a chat clears its dot. Returns true when the set changed.
    @discardableResult
    mutating func clear(_ chatId: String) -> Bool {
        guard ids.remove(chatId) != nil else { return false }
        persist()
        return true
    }

    /// Drop ids that left the roster. Returns true when the set changed.
    @discardableResult
    mutating func retain(_ keep: Set<String>) -> Bool {
        let next = ids.intersection(keep)
        guard next != ids else { return false }
        ids = next
        persist()
        return true
    }

    /// Completed assistant LEFT kind=message. User, tool, widget,
    /// approve, connect, and empty replies do not count.
    static func isFinishedAssistantReply(_ reply: ReplySnapshot) -> Bool {
        !reply.fromUser && reply.kindMessage && reply.hasToken
    }

    /// Mark when that chat is not on screen, or the app is not active.
    static func replyMarksUnread(
        chatId: String,
        openChatId: String?,
        focused: Bool
    ) -> Bool {
        guard !chatId.isEmpty else { return false }
        if !focused { return true }
        return chatId != openChatId
    }

    /// iPad detail is the selection. iPhone is the pushed chat.
    /// An empty navigation path is the list, so no chat is open.
    static func onScreenChatID(
        pad: Bool,
        selectedID: String?,
        navigationLast: String?
    ) -> String? {
        pad ? selectedID : navigationLast
    }

    private static func load(from defaults: UserDefaults) -> Set<String> {
        guard let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else { return [] }
        var ids = Set<String>()
        for item in obj {
            guard let id = item as? String, !id.isEmpty else { continue }
            ids.insert(id)
        }
        return ids
    }

    private mutating func persist() {
        let sorted = ids.filter { !$0.isEmpty }.sorted()
        guard let data = try? JSONSerialization.data(withJSONObject: sorted),
              let raw = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(raw, forKey: Self.storageKey)
    }
}
