// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v2.20: rate a completed assistant reply.
/// Good and Bad sit on the same action row as Copy. Choosing one
/// marks that reply. Choosing the mark that is already on clears it.
/// The two marks are exclusive. The mark stays on this client
/// (`snorlax.replyRating`) and is not sent. A streaming reply, a
/// user message, and tool or card rows are not offered. Nothing is
/// sent. No new shortcut. No animation.
/// Keep in lockstep with `desktop/src/replyRating.ts`.
enum ReplyRating {
    static let storageKey = "snorlax.replyRating"
    static let good = "good"
    static let bad = "bad"
    static let goodLabel = "Good"
    static let badLabel = "Bad"
    /// Accessible name. Visible text stays Good / Bad.
    static let goodAria = "Good response"
    static let badAria = "Bad response"

    /// Completed assistant LEFT kind=message only.
    static func offers(fromUser: Bool, kindMessage: Bool, completed: Bool) -> Bool {
        !fromUser && kindMessage && completed
    }

    static func label(_ pick: String) -> String {
        pick == bad ? badLabel : goodLabel
    }

    static func accessibilityLabel(_ pick: String) -> String {
        pick == bad ? badAria : goodAria
    }

    static func pressed(current: String?, pick: String) -> Bool {
        current == pick
    }

    /// The mark swaps in place. Reduce Motion adds nothing to animate.
    static func animates(reduceMotion: Bool) -> Bool {
        _ = reduceMotion
        return false
    }

    static func isRating(_ value: String) -> Bool {
        value == good || value == bad
    }

    /// Missing, corrupt, or non-object blobs are an empty map. Other values drop.
    static func parse(_ raw: String?) -> [String: String] {
        guard let raw,
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var ratings: [String: String] = [:]
        for (id, value) in obj {
            guard !id.isEmpty, let pick = value as? String, isRating(pick) else { continue }
            ratings[id] = pick
        }
        return ratings
    }

    static func read(defaults: UserDefaults = .standard) -> [String: String] {
        parse(defaults.string(forKey: storageKey))
    }

    static func write(_ ratings: [String: String], defaults: UserDefaults = .standard) {
        var clean: [String: String] = [:]
        for (id, pick) in ratings {
            guard !id.isEmpty, isRating(pick) else { continue }
            clean[id] = pick
        }
        guard let data = try? JSONSerialization.data(withJSONObject: clean),
              let text = String(data: data, encoding: .utf8)
        else { return }
        defaults.set(text, forKey: storageKey)
    }

    /// Set `pick`, or clear it when that mark is already on.
    /// The other mark is replaced. A blank id leaves the map alone.
    static func toggled(_ ratings: [String: String], id: String, pick: String) -> [String: String] {
        guard !id.isEmpty, isRating(pick) else { return ratings }
        var next = ratings
        if next[id] == pick {
            next.removeValue(forKey: id)
        } else {
            next[id] = pick
        }
        return next
    }
}
