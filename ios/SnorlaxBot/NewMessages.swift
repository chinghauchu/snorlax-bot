// SPDX-License-Identifier: Apache-2.0

import SwiftUI

/// v0.76: a thin muted "New messages" line above the first assistant
/// LEFT message that arrived since you last viewed that chat.
/// The same not-on-screen or inactive condition as the v0.70 unread
/// dot freezes the per-chat last-seen id (UserDefaults). Opening or
/// returning computes the line once; it stays put while you watch.
/// It clears when you come back with nothing new, or when you Send.
/// User bubbles and collapsed tool lines do not anchor it. No HTTP.
/// No animation (Reduce Motion has nothing to shorten).
/// Keep in lockstep with `desktop/src/newMessages.ts`.
enum NewMessages {
    static let label = "New messages"
    static let storageKey = "snorlax.chatLastSeen"

    struct Row {
        var id: String
        var anchor: Bool
    }

    struct Place {
        var key: String?
        var placed: Bool
        var anchorId: String?

        static let fresh = Place(key: nil, placed: false, anchorId: nil)
    }

    /// A painted LEFT assistant message. User bubbles, hidden rows,
    /// and collapsed tool lines do not anchor the line.
    static func anchors(
        fromUser: Bool,
        kindMessage: Bool,
        hasToken: Bool,
        collapsedTool: Bool,
        visible: Bool = true
    ) -> Bool {
        visible && !collapsedTool && !fromUser && kindMessage && hasToken
    }

    /// First anchoring row strictly after `lastSeenId`. No id, or the
    /// id is missing: nil, so a first open does not mark the history.
    static func anchorIndex(rows: [Row], lastSeenId: String?) -> Int? {
        guard let lastSeenId, !lastSeenId.isEmpty else { return nil }
        guard let at = rows.firstIndex(where: { $0.id == lastSeenId }) else {
            return nil
        }
        let next = at + 1
        guard next < rows.count else { return nil }
        return rows[next...].firstIndex(where: \.anchor)
    }

    /// Open or return computes the line. A later append keeps it.
    /// Nothing new on the chat you already placed keeps the line.
    static func place(
        place: Place,
        key: String,
        rows: [Row],
        lastSeenId: String?,
        returning: Bool
    ) -> Place {
        if !returning, place.placed, place.key == key {
            return place
        }
        guard let index = anchorIndex(rows: rows, lastSeenId: lastSeenId) else {
            if place.placed, place.key == key {
                return Place(key: place.key, placed: true, anchorId: place.anchorId)
            }
            return Place(key: key, placed: true, anchorId: nil)
        }
        return Place(key: key, placed: true, anchorId: rows[index].id)
    }

    /// Send drops the line. The chat stays placed so the reply you
    /// are watching does not draw a new one.
    static func clear(_ place: Place) -> Place {
        Place(key: place.key, placed: true, anchorId: nil)
    }
}

/// Per-chat last seen message id. UserDefaults key `snorlax.chatLastSeen`.
struct ChatLastSeen {
    static let storageKey = NewMessages.storageKey

    private var slots: [String: String]
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.slots = Self.load(from: defaults)
    }

    static func token(agentId: String, threadId: String?) -> String {
        agentId + "\u{0}" + (threadId ?? "")
    }

    func messageID(agentId: String, threadId: String?) -> String? {
        guard !agentId.isEmpty else { return nil }
        return slots[Self.token(agentId: agentId, threadId: threadId)]
    }

    @discardableResult
    mutating func see(agentId: String, threadId: String?, messageId: String) -> Bool {
        guard !agentId.isEmpty, !messageId.isEmpty else { return false }
        let key = Self.token(agentId: agentId, threadId: threadId)
        guard slots[key] != messageId else { return false }
        slots[key] = messageId
        persist()
        return true
    }

    /// Drop chats that left the roster.
    @discardableResult
    mutating func retain(_ keep: Set<String>) -> Bool {
        let next = slots.filter { token, _ in
            guard let agentId = Self.agentId(in: token) else { return false }
            return keep.contains(agentId)
        }
        guard next.count != slots.count else { return false }
        slots = next
        persist()
        return true
    }

    private static func agentId(in token: String) -> String? {
        guard let at = token.firstIndex(of: "\u{0}") else { return nil }
        let agentId = String(token[..<at])
        return agentId.isEmpty ? nil : agentId
    }

    private static func load(from defaults: UserDefaults) -> [String: String] {
        guard let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var slots: [String: String] = [:]
        for (token, value) in obj {
            guard let id = value as? String, !id.isEmpty else { continue }
            guard agentId(in: token) != nil else { continue }
            slots[token] = id
        }
        return slots
    }

    private mutating func persist() {
        guard let data = try? JSONSerialization.data(withJSONObject: slots),
              let raw = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(raw, forKey: Self.storageKey)
    }
}

/// Thin muted rule. Static: no animation, so Reduce Motion changes nothing.
struct NewMessagesDivider: View {
    var body: some View {
        HStack(spacing: 8) {
            line
            Text(NewMessages.label)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize()
            line
        }
        .padding(.top, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(NewMessages.label)
    }

    private var line: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.16))
            .frame(height: 1)
    }
}
