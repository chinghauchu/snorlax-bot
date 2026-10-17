// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.28: queue a follow-up while a reply is generating.
/// Matches desktop `queuedSend.ts`. Rows are not combined. The oldest
/// row is sent through the existing send path when the in-flight reply
/// settles, including Stop. Later rows wait, one per completed reply.
/// The queue is per chat for the session. A failed queued send drops
/// that chat's queue and restores the text to the composer.
enum QueuedSend {
    static let label = "Queued"
    static let removeLabel = "Remove queued message"
    static let listLabel = "Queued messages"
    static let editLabel = "Queued message"

    struct Quote: Equatable {
        var text: String
        var sourceId: String
    }

    struct Item: Identifiable, Equatable {
        var id: String
        var text: String
        var mentionIds: [String]
        var quotes: [Quote]
    }

    struct Dispatch: Equatable {
        var text: String
        var agentId: String
        var threadId: String?
        var isChannel: Bool
        var mentionIds: [String]
        var quotes: [Quote]
    }

    static func key(agentId: String, threadId: String?) -> String {
        agentId + "\u{0}" + (threadId ?? "")
    }

    static func items(_ map: [String: [Item]], key: String) -> [Item] {
        map[key] ?? []
    }

    static func canQueue(
        busy: Bool,
        text: String,
        chipCount: Int,
        attachError: Bool,
        takeoverOpen: Bool,
        hasChat: Bool
    ) -> Bool {
        guard busy, !takeoverOpen, !attachError, chipCount == 0, hasChat else { return false }
        return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func enqueue(
        _ map: [String: [Item]],
        key: String,
        text: String,
        id: String,
        mentionIds: [String] = [],
        quotes: [Quote] = []
    ) -> [String: [Item]] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !key.isEmpty, !id.isEmpty else { return map }
        var next = map
        var rows = next[key] ?? []
        rows.append(Item(id: id, text: trimmed, mentionIds: mentionIds, quotes: quotes))
        next[key] = rows
        return next
    }

    static func edit(
        _ map: [String: [Item]],
        key: String,
        id: String,
        text: String
    ) -> [String: [Item]] {
        guard var rows = map[key] else { return map }
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return map }
        rows[index].text = text
        var next = map
        next[key] = rows
        return next
    }

    static func remove(_ map: [String: [Item]], key: String, id: String) -> [String: [Item]] {
        guard let rows = map[key] else { return map }
        let kept = rows.filter { $0.id != id }
        var next = map
        if kept.isEmpty {
            next.removeValue(forKey: key)
        } else {
            next[key] = kept
        }
        return next
    }

    static func dequeue(
        _ map: [String: [Item]],
        key: String
    ) -> (queued: [String: [Item]], item: Item?) {
        var rows = map[key] ?? []
        var current = map
        while !rows.isEmpty {
            var item = rows.removeFirst()
            var next = current
            if rows.isEmpty {
                next.removeValue(forKey: key)
            } else {
                next[key] = rows
            }
            current = next
            let text = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                item.text = text
                return (current, item)
            }
        }
        var next = current
        next.removeValue(forKey: key)
        return (next, nil)
    }

    static func requeueFront(
        _ map: [String: [Item]],
        key: String,
        item: Item
    ) -> [String: [Item]] {
        let text = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !key.isEmpty else { return map }
        var next = map
        var rows = (next[key] ?? []).filter { $0.id != item.id }
        var copy = item
        copy.text = text
        rows.insert(copy, at: 0)
        next[key] = rows
        return next
    }

    static func drop(
        _ map: [String: [Item]],
        key: String
    ) -> (queued: [String: [Item]], remaining: [Item]) {
        let remaining = map[key] ?? []
        var next = map
        next.removeValue(forKey: key)
        return (next, remaining)
    }

    static func restoreText(failed: String, remaining: [Item], composer: String) -> String {
        var parts: [String] = []
        let failedText = failed.trimmingCharacters(in: .whitespacesAndNewlines)
        if !failedText.isEmpty { parts.append(failedText) }
        for row in remaining {
            let text = row.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { parts.append(text) }
        }
        if !composer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(composer)
        } else if !composer.isEmpty && parts.isEmpty {
            return composer
        }
        return parts.joined(separator: "\n\n")
    }

    static func shouldFlush(fromQueue: Bool, failed: Bool) -> Bool {
        if fromQueue && failed { return false }
        return true
    }
}
