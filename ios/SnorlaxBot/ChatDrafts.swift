// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.64 per-chat composer drafts. In memory for the app session only.
/// Keyed by agentId + threadId (`nil` thread = top-level timeline).
/// No persistence and no HTTP.
struct ChatDrafts {
    struct Key: Hashable {
        var agentId: String
        var threadId: String?
    }

    private var slots: [Key: String] = [:]

    func text(agentId: String, threadId: String?) -> String {
        slots[Key(agentId: agentId, threadId: threadId)] ?? ""
    }

    mutating func set(agentId: String, threadId: String?, text: String) {
        let key = Key(agentId: agentId, threadId: threadId)
        if text.isEmpty {
            slots.removeValue(forKey: key)
        } else {
            slots[key] = text
        }
    }

    /// Successful Send drops that conversation's unsent text.
    mutating func clear(agentId: String, threadId: String?) {
        slots.removeValue(forKey: Key(agentId: agentId, threadId: threadId))
    }

    /// Save `text` under the conversation being left and return the draft
    /// for the conversation being opened (empty when none).
    /// The same conversation keeps the live text. A nil destination clears
    /// the composer after saving the chat being left.
    mutating func swap(
        fromAgentId: String?,
        fromThreadId: String?,
        text: String,
        toAgentId: String?,
        toThreadId: String?
    ) -> String {
        let same = fromAgentId == toAgentId && fromThreadId == toThreadId
        if let fromAgentId, !same {
            set(agentId: fromAgentId, threadId: fromThreadId, text: text)
        }
        guard let toAgentId else { return same ? text : "" }
        if same { return text }
        return self.text(agentId: toAgentId, threadId: toThreadId)
    }

    /// Failed Send writes `text` back onto the conversation it was typed in.
    mutating func restore(agentId: String, threadId: String?, text: String) {
        set(agentId: agentId, threadId: threadId, text: text)
    }
}
