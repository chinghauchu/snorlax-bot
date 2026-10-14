// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v1.02: mute a chat from the chat list.
/// A long-press or a swipe offers Mute / Unmute. A muted chat still
/// receives messages and still opens. It does not paint the unread
/// accent dot, and a finished assistant reply does not add it to the
/// unread count outside the list. The Unread filter skips it. The row
/// shows a muted glyph. The set persists in UserDefaults
/// (`snorlax.chatMutes`). Deleting a chat drops it. No HTTP.
/// Keep in lockstep with `desktop/src/chatMute.ts`.
enum ChatMute {
    static let storageKey = "snorlax.chatMutes"
    static let muteLabel = "Mute"
    static let unmuteLabel = "Unmute"
    static let glyphLabel = "Muted"

    /// Missing, corrupt, or non-array blobs are an empty list. Later duplicates drop.
    static func parse(_ raw: String?) -> [String] {
        guard let raw,
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else { return [] }
        var ids: [String] = []
        var seen = Set<String>()
        for item in obj {
            guard let id = item as? String, !id.isEmpty, !seen.contains(id) else { continue }
            seen.insert(id)
            ids.append(id)
        }
        return ids
    }

    static func read(defaults: UserDefaults = .standard) -> [String] {
        parse(defaults.string(forKey: storageKey))
    }

    static func write(_ ids: [String], defaults: UserDefaults = .standard) {
        var unique: [String] = []
        var seen = Set<String>()
        for id in ids where !id.isEmpty {
            if seen.insert(id).inserted {
                unique.append(id)
            }
        }
        guard let data = try? JSONSerialization.data(withJSONObject: unique),
              let raw = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(raw, forKey: storageKey)
    }

    static func label(muted: Bool) -> String {
        muted ? unmuteLabel : muteLabel
    }

    /// Mute appends. Unmute removes. Order of the ones that stay is kept.
    static func toggle(_ ids: [String], id: String) -> [String] {
        guard !id.isEmpty else { return ids }
        if ids.contains(id) { return ids.filter { $0 != id } }
        return ids.filter { $0 != id } + [id]
    }

    /// Drop ids that left the roster. Order of the ones that remain stays.
    static func retain(_ ids: [String], keep: Set<String>) -> [String] {
        ids.filter { !$0.isEmpty && keep.contains($0) }
    }

    /// A muted chat does not paint the v0.70 accent dot.
    static func paintsUnreadAccent(muted: Bool, wouldPaint: Bool) -> Bool {
        muted ? false : wouldPaint
    }

    /// A finished assistant reply does not mark a muted chat unread.
    static func replyMayMarkUnread(muted: Bool) -> Bool {
        !muted
    }

    /// Ids that still count as unread. Muted chats are left out.
    static func audible(_ ids: Set<String>, muted: [String]) -> Set<String> {
        let hidden = Set(muted)
        return Set(ids.filter { !$0.isEmpty && !hidden.contains($0) })
    }
}
