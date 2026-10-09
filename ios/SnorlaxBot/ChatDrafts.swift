// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.64 / v0.69 per-chat composer drafts.
/// Keyed by agentId + threadId (`nil` thread = top-level timeline).
/// Persisted in UserDefaults (`snorlax.chatDrafts`) so a restart
/// restores each chat's unsent text. No HTTP.
/// Keep in lockstep with `desktop/src/chatDrafts.ts`.
struct ChatDrafts {
    static let storageKey = "snorlax.chatDrafts"

    struct Key: Hashable {
        var agentId: String
        var threadId: String?
    }

    private var slots: [Key: String]
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.slots = Self.load(from: defaults)
    }

    func text(agentId: String, threadId: String?) -> String {
        slots[Key(agentId: agentId, threadId: threadId)] ?? ""
    }

    mutating func set(agentId: String, threadId: String?, text: String) {
        let key = Key(agentId: agentId, threadId: threadId)
        if text.isEmpty {
            guard slots.removeValue(forKey: key) != nil else { return }
        } else if slots[key] == text {
            return
        } else {
            slots[key] = text
        }
        persist()
    }

    /// Successful Send drops that conversation's unsent text.
    mutating func clear(agentId: String, threadId: String?) {
        set(agentId: agentId, threadId: threadId, text: "")
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

    private static func token(agentId: String, threadId: String?) -> String {
        agentId + "\u{0}" + (threadId ?? "")
    }

    private static func parseToken(_ token: String) -> Key? {
        guard let at = token.firstIndex(of: "\u{0}") else { return nil }
        let agentId = String(token[..<at])
        guard !agentId.isEmpty else { return nil }
        let rest = String(token[token.index(after: at)...])
        return Key(agentId: agentId, threadId: rest.isEmpty ? nil : rest)
    }

    private static func load(from defaults: UserDefaults) -> [Key: String] {
        guard let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var slots: [Key: String] = [:]
        for (token, value) in obj {
            guard let text = value as? String, !text.isEmpty, let key = parseToken(token) else {
                continue
            }
            slots[key] = text
        }
        return slots
    }

    private mutating func persist() {
        var blob: [String: String] = [:]
        for (key, text) in slots where !text.isEmpty {
            blob[Self.token(agentId: key.agentId, threadId: key.threadId)] = text
        }
        guard let data = try? JSONSerialization.data(withJSONObject: blob),
              let raw = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(raw, forKey: Self.storageKey)
    }
}
