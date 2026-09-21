// SPDX-License-Identifier: Apache-2.0

/// v0.49 optimistic user-RIGHT bubble on Send. Matches desktop `optimisticSend.ts`.
enum OptimisticSend {
    static let couldntSend = "Couldn't send."
    static let idPrefix = "local-"

    static func isOptimistic(_ id: String) -> Bool {
        id.hasPrefix(idPrefix)
    }

    static func insert(_ messages: [Message], _ row: Message) -> [Message] {
        messages + [row]
    }

    static func drop(_ messages: [Message], id: String) -> [Message] {
        messages.filter { $0.id != id }
    }

    /// Success: GET/turn list replaces the optimistic bubble. No local-* leftover.
    static func reconcile(listed: [Message]) -> [Message] {
        listed.filter { !isOptimistic($0.id) }
    }

    /// Server user turn (SSE `message.done` or GET) replaces the matching
    /// optimistic bubble in place — never a second RIGHT bubble.
    static func absorb(_ messages: [Message], incoming: Message) -> [Message] {
        guard incoming.isFromUser, !isOptimistic(incoming.id) else {
            if let idx = messages.firstIndex(where: { $0.id == incoming.id }) {
                var next = messages
                next[idx] = incoming
                return next
            }
            return messages + [incoming]
        }
        if let optIdx = messages.firstIndex(where: {
            isOptimistic($0.id) && $0.isFromUser && $0.content == incoming.content
        }) {
            var next = messages
            next[optIdx] = incoming
            return next
        }
        if let idx = messages.firstIndex(where: { $0.id == incoming.id }) {
            var next = messages
            next[idx] = incoming
            return next
        }
        return messages + [incoming]
    }

    static func fail(_ messages: [Message], id: String) -> (messages: [Message], hint: String) {
        (drop(messages, id: id), couldntSend)
    }

    static func composerHint(error: String?) -> String? {
        error == couldntSend ? couldntSend : nil
    }
}
