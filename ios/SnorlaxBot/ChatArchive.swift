// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.96: archive a chat from the chat list.
/// A swipe or a long-press offers Archive. The chat leaves the main
/// list immediately. An Archived list reachable from the chat list
/// offers Unarchive, which puts the chat back in pin order if it is
/// pinned, otherwise in roster order. Pin is hidden while archived;
/// the pin id stays so Unarchive restores it. Option+Up/Down and the
/// Unread filter skip archived chats. Name search still finds them.
/// A new reply does not unarchive; the unread set is separate. The
/// set persists in UserDefaults (`snorlax.chatArchives`). Deleting a
/// chat drops it. No HTTP.
/// Keep in lockstep with `desktop/src/chatArchive.ts`.
enum ChatArchive {
    static let storageKey = "snorlax.chatArchives"
    static let archiveLabel = "Archive"
    static let unarchiveLabel = "Unarchive"
    static let sectionLabel = "Archived"

    /// "Archived (3)". The count is archived chats still on the roster.
    static func sectionTitle(count: Int) -> String {
        let n = count > 0 ? count : 0
        return "\(sectionLabel) (\(n))"
    }

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

    /// Append. Already archived returns the same list.
    static func archive(_ ids: [String], id: String) -> [String] {
        guard !id.isEmpty else { return ids }
        if ids.contains(id) { return ids }
        return ids + [id]
    }

    /// Remove. A chat that was not archived returns the same list.
    static func unarchive(_ ids: [String], id: String) -> [String] {
        guard !id.isEmpty, ids.contains(id) else { return ids }
        return ids.filter { $0 != id }
    }

    static func contains(_ ids: [String], id: String) -> Bool {
        !id.isEmpty && ids.contains(id)
    }

    /// Drop ids that left the roster. Order of the ones that remain stays.
    static func retain(_ ids: [String], keep: Set<String>) -> [String] {
        ids.filter { !$0.isEmpty && keep.contains($0) }
    }

    /// After archiving `archivedId`, the chat that should be open.
    /// `visibleIds` is the Option+Up/Down order before the archive.
    /// Archiving the open chat opens the following row. The last row,
    /// or an open chat that is not in that order, becomes nil (empty).
    /// Archiving some other chat leaves the open chat alone.
    static func selectionAfterArchive(
        visibleIds: [String],
        openId: String?,
        archivedId: String
    ) -> String? {
        guard !archivedId.isEmpty else { return openId }
        guard openId == archivedId else { return openId }
        return ChatNav.adjacent(ids: visibleIds, currentId: openId, direction: 1)
    }
}
