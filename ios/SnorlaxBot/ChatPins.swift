// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.89: pin a chat to the top of the chat list.
/// A leading swipe or a long-press offers Pin / Unpin. Pinned rows
/// sit in a Pinned group, in the order they were pinned. Unpinned
/// rows keep the roster order below. The set persists in UserDefaults
/// (`snorlax.chatPins`). Deleting a chat drops its pin. No HTTP.
/// Keep in lockstep with `desktop/src/chatPins.ts`.
enum ChatPins {
    static let storageKey = "snorlax.chatPins"
    static let pinLabel = "Pin"
    static let unpinLabel = "Unpin"
    static let groupLabel = "Pinned"
    static let glyphLabel = "Pinned"

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

    static func label(pinned: Bool) -> String {
        pinned ? unpinLabel : pinLabel
    }

    /// Pin appends. Unpin removes. A new pin goes after the ones already pinned.
    static func toggle(_ ids: [String], id: String) -> [String] {
        guard !id.isEmpty else { return ids }
        if ids.contains(id) { return ids.filter { $0 != id } }
        return ids.filter { $0 != id } + [id]
    }

    /// Drop ids that left the roster. Pin order of the ones that remain stays.
    static func retain(_ ids: [String], keep: Set<String>) -> [String] {
        ids.filter { !$0.isEmpty && keep.contains($0) }
    }

    /// Pinned rows first, in pin order, then the rest in roster order.
    /// An id that is not in `rows` is skipped.
    static func grouped<T>(
        _ rows: [T],
        pinned ids: [String],
        id: (T) -> String
    ) -> (pinned: [T], rest: [T]) {
        var byID: [String: T] = [:]
        for row in rows {
            byID[id(row)] = row
        }
        var pinnedRows: [T] = []
        var taken = Set<String>()
        for pin in ids {
            guard !pin.isEmpty, !taken.contains(pin), let row = byID[pin] else { continue }
            pinnedRows.append(row)
            taken.insert(pin)
        }
        let rest = rows.filter { !taken.contains(id($0)) }
        return (pinnedRows, rest)
    }
}
