// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v0.72: quick chat switcher over the roster already loaded.
/// A pull-down search field on the chat list narrows agents and
/// channels by name. Desktop Cmd/Ctrl-K opens the same filter in a
/// small overlay (arrows + Enter switch, Esc closes). No HTTP.
/// Keep in lockstep with `desktop/src/chatSwitcher.ts`.
enum ChatSwitcher {
    static let inputLabel = "Switch chat"
    static let placeholder = "Search chats"
    static let emptyLabel = "No chats"

    struct Chat: Equatable {
        var id: String
        var name: String
    }

    /// A non-blank query filters. Whitespace-only shows every chat.
    static func queryActive(_ query: String) -> Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func isBoundary(_ hay: NSString, _ index: Int) -> Bool {
        let prev = hay.substring(with: NSRange(location: index, length: 1))
        return prev == " " || prev == "-" || prev == "_"
    }

    /// Case-insensitive subsequence. Offsets are UTF-16, matching
    /// desktop `String#indexOf` / `charAt`.
    static func fuzzyScore(name: String, needle: String) -> Int? {
        let hay = name.lowercased() as NSString
        let query = needle.lowercased() as NSString
        if query.length == 0 { return 0 }
        var score = 0
        var hi = 0
        var prev = -2
        var first = -1
        for i in 0..<query.length {
            let unit = query.substring(with: NSRange(location: i, length: 1))
            let rest = NSRange(location: hi, length: hay.length - hi)
            let range = hay.range(of: unit, range: rest)
            if range.location == NSNotFound { return nil }
            let at = range.location
            if first < 0 { first = at }
            score += 1
            if at == prev + 1 { score += 4 }
            if at == 0 || isBoundary(hay, at - 1) { score += 2 }
            prev = at
            hi = at + 1
        }
        score += max(0, 8 - first)
        return score
    }

    /// Empty / whitespace query keeps roster order. Otherwise higher
    /// score first, then the original order.
    static func filter(_ chats: [Chat], query: String) -> [Chat] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if needle.isEmpty { return chats }
        var ranked: [(chat: Chat, score: Int, index: Int)] = []
        for (index, chat) in chats.enumerated() {
            guard let score = fuzzyScore(name: chat.name, needle: needle) else { continue }
            ranked.append((chat, score, index))
        }
        ranked.sort { lhs, rhs in
            if lhs.score != rhs.score { return lhs.score > rhs.score }
            return lhs.index < rhs.index
        }
        return ranked.map(\.chat)
    }
}
