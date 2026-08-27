// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Composer `/` skill picker on 1:1 only. List is GET `/skills` `{ id, name }`.
/// Empty list or no match → no popup. Insert is `/name` plain text, not a chip.
enum SkillPicker {
    static let popupWidth: CGFloat = 240
    static let rowHeight: CGFloat = 44
    static let nameSize: CGFloat = 14
    static let cornerRadius: CGFloat = 8

    static func triggerRange(in draft: String) -> Range<String.Index>? {
        guard let slash = draft.lastIndex(of: "/") else { return nil }
        let prefix = draft[..<slash]
        if let last = prefix.last, !last.isWhitespace { return nil }
        let after = draft[draft.index(after: slash)...]
        if after.contains(where: { $0.isWhitespace }) { return nil }
        return slash..<draft.endIndex
    }

    static func query(in draft: String) -> String? {
        guard let range = triggerRange(in: draft) else { return nil }
        let token = draft[range]
        guard token.first == "/" else { return nil }
        return String(token.dropFirst())
    }

    static func filter(_ skills: [Skill], query: String) -> [Skill] {
        let q = query.lowercased()
        return skills.filter { $0.name.lowercased().hasPrefix(q) }
    }

    static func popupOpen(
        skills: [Skill],
        query: String?,
        isChannel: Bool
    ) -> Bool {
        if isChannel { return false }
        guard let query else { return false }
        return !filter(skills, query: query).isEmpty
    }

    /// 1:1 agent composer only. Channel `/` is plain text — no GET.
    static func agentId(conversation: Agent?) -> String? {
        guard let conversation, !conversation.isChannel else { return nil }
        return conversation.id
    }
}
