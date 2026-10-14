// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.95: rename a chat from the chat list.
/// A long-press or a leading swipe offers Rename. The row name becomes
/// an inline field. Return or leaving the field keeps a trimmed
/// non-empty name. Escape restores the previous one. A blank name is
/// rejected. The display name is a local overlay on the server name
/// (`snorlax.chatNames`). Deleting a chat drops it. The identity sheet
/// still edits the server name; a save that changes that name drops
/// the overlay so the saved name shows. No HTTP.
/// Keep in lockstep with `desktop/src/chatNames.ts`.
enum ChatNames {
    static let storageKey = "snorlax.chatNames"
    static let renameLabel = "Rename"
    static let fieldLabel = "Chat name"
    static let maxLength = 80

    private static func cleaned(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= maxLength else { return nil }
        return trimmed
    }

    /// Missing, corrupt, or non-object blobs are an empty map. Blank values drop.
    static func parse(_ raw: String?) -> [String: String] {
        guard let raw,
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var names: [String: String] = [:]
        for (id, value) in obj {
            guard !id.isEmpty, let text = value as? String, let name = cleaned(text) else { continue }
            names[id] = name
        }
        return names
    }

    static func read(defaults: UserDefaults = .standard) -> [String: String] {
        parse(defaults.string(forKey: storageKey))
    }

    static func write(_ names: [String: String], defaults: UserDefaults = .standard) {
        var clean: [String: String] = [:]
        for (id, value) in names {
            guard !id.isEmpty, let name = cleaned(value) else { continue }
            clean[id] = name
        }
        guard let data = try? JSONSerialization.data(withJSONObject: clean),
              let raw = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(raw, forKey: storageKey)
    }

    /// Local overlay when one is stored. Otherwise the server name.
    static func displayName(_ names: [String: String], id: String, serverName: String) -> String {
        guard !id.isEmpty, let name = cleaned(names[id]) else { return serverName }
        return name
    }

    /// Trim, reject blank or over-long drafts, and return the same map
    /// when nothing changes. A name equal to the server name drops the overlay.
    static func commit(
        _ names: [String: String],
        id: String,
        draft: String,
        serverName: String
    ) -> [String: String] {
        guard !id.isEmpty, let next = cleaned(draft) else { return names }
        if next == serverName {
            guard names[id] != nil else { return names }
            var copy = names
            copy.removeValue(forKey: id)
            return copy
        }
        if names[id] == next { return names }
        var copy = names
        copy[id] = next
        return copy
    }

    /// Drop ids that left the roster.
    static func retain(_ names: [String: String], keep: Set<String>) -> [String: String] {
        var next: [String: String] = [:]
        var changed = false
        for (id, value) in names {
            guard !id.isEmpty, keep.contains(id), let name = cleaned(value) else {
                changed = true
                continue
            }
            next[id] = name
            if names[id] != name { changed = true }
        }
        if !changed, next.count == names.count { return names }
        return next
    }

    /// Drop one overlay. Same map when that id was not stored.
    static func clear(_ names: [String: String], id: String) -> [String: String] {
        guard names[id] != nil else { return names }
        var copy = names
        copy.removeValue(forKey: id)
        return copy
    }
}
