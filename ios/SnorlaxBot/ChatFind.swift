// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v0.71: in-chat find over messages already loaded.
/// A toolbar search field filters user / assistant / handoff rows and
/// highlights matches. Enter / Shift-Enter and the up/down buttons move
/// between matches. Esc closes and clears highlights. No HTTP.
/// Keep in lockstep with `desktop/src/chatFind.ts`.
enum ChatFind {
    static let inputLabel = "Find in chat"
    static let placeholder = "Find"
    static let previousLabel = "Previous match"
    static let nextLabel = "Next match"
    static let closeLabel = "Close find"
    static let emptyLabel = "No matches"

    struct Row: Equatable {
        var id: String
        var text: String
    }

    struct Hit: Equatable {
        var rowId: String
        var start: Int
        var end: Int
    }

    static func queryActive(_ query: String) -> Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Case-insensitive, non-overlapping, left to right.
    /// Offsets are UTF-16, matching desktop `RegExp#exec` indexes.
    static func indexHits(in text: String, query: String) -> [(start: Int, end: Int)] {
        guard queryActive(query) else { return [] }
        let raw = text as NSString
        var hits: [(start: Int, end: Int)] = []
        var search = 0
        while search < raw.length {
            let range = raw.range(
                of: query,
                options: [.caseInsensitive],
                range: NSRange(location: search, length: raw.length - search)
            )
            if range.location == NSNotFound || range.length == 0 { break }
            hits.append((range.location, range.location + range.length))
            search = range.location + range.length
        }
        return hits
    }

    static func hits(rows: [Row], query: String) -> [Hit] {
        guard queryActive(query) else { return [] }
        var found: [Hit] = []
        for row in rows {
            for hit in indexHits(in: row.text, query: query) {
                found.append(Hit(rowId: row.id, start: hit.start, end: hit.end))
            }
        }
        return found
    }

    /// 1-based `n of m`. No matches reads `0 of 0`.
    static func countLabel(index: Int, total: Int) -> String {
        if total <= 0 || index < 0 || index >= total { return "0 of 0" }
        return "\(index + 1) of \(total)"
    }

    /// direction 1 = next (Enter / down), -1 = previous (Shift-Enter / up). Wraps.
    static func step(index: Int, total: Int, direction: Int) -> Int {
        if total <= 0 { return -1 }
        if index < 0 || index >= total { return direction > 0 ? 0 : total - 1 }
        let raw = index + direction
        return (raw % total + total) % total
    }

    /// Hide a user / assistant / handoff message that does not match.
    /// Tool lines and cards are not searchable, so they stay.
    static func omits(searchable: Bool, texts: [String], query: String) -> Bool {
        guard queryActive(query), searchable else { return false }
        return !texts.contains { !indexHits(in: $0, query: query).isEmpty }
    }

    /// Assistant bubbles use `id#index`. Scroll targets the message id.
    static func scrollID(_ rowId: String) -> String {
        guard let hash = rowId.lastIndex(of: "#") else { return rowId }
        let suffix = rowId[rowId.index(after: hash)...]
        if !suffix.isEmpty, suffix.allSatisfy(\.isNumber) {
            return String(rowId[..<hash])
        }
        return rowId
    }

    static func paint(
        _ source: AttributedString,
        query: String,
        activeStart: Int = -1,
        activeEnd: Int = -1
    ) -> AttributedString {
        guard queryActive(query) else { return source }
        let ns = NSMutableAttributedString(attributedString: NSAttributedString(source))
        let raw = ns.string as NSString
        var search = 0
        while search < raw.length {
            let range = raw.range(
                of: query,
                options: [.caseInsensitive],
                range: NSRange(location: search, length: raw.length - search)
            )
            if range.location == NSNotFound || range.length == 0 { break }
            let active = range.location == activeStart && range.location + range.length == activeEnd
            let color = UIColor.tintColor.withAlphaComponent(active ? 0.55 : 0.28)
            ns.addAttribute(.backgroundColor, value: color, range: range)
            search = range.location + range.length
        }
        return AttributedString(ns)
    }
}

struct ChatFindSession: Equatable {
    var query: String = ""
    var activeRowId: String = ""
    var activeStart: Int = -1
    var activeEnd: Int = -1
}

private struct ChatFindSessionKey: EnvironmentKey {
    static let defaultValue = ChatFindSession()
}

extension EnvironmentValues {
    var chatFind: ChatFindSession {
        get { self[ChatFindSessionKey.self] }
        set { self[ChatFindSessionKey.self] = newValue }
    }
}

/// Plain transcript text with match highlights. Markdown paints itself.
struct FindHighlighted: View {
    let text: String
    var rowId: String = ""
    var lineLimit: Int? = nil
    @Environment(\.chatFind) private var find

    var body: some View {
        let active = find.activeRowId == rowId
        Text(
            ChatFind.paint(
                AttributedString(text),
                query: find.query,
                activeStart: active ? find.activeStart : -1,
                activeEnd: active ? find.activeEnd : -1
            )
        )
        .lineLimit(lineLimit)
    }
}
