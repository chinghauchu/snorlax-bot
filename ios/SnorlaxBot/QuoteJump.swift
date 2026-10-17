// SPDX-License-Identifier: Apache-2.0
import Foundation
import SwiftUI

/// v1.27: a sent quote jumps back to the message it replies to.
/// Quoting a transcript selection remembers that message with the
/// draft. Send keeps the link on the user message, in UserDefaults,
/// for each quote block that is still in the text. The quote is a
/// thin control that scrolls to the source. ⌘' / ⌃' jumps to the
/// source of the quote nearest the reading line. iOS hardware
/// command-' and control-' jump the same way. The composer may
/// keep its text. The apostrophe is not inserted. A key repeat does
/// not jump again. IME and overlays keep the key. Stick-to-bottom,
/// the Jump chip, per-chat reading place, the sticky day header,
/// collapsed long messages, muted chats, and the New messages divider
/// stay. Reduce Motion adds no animation. No HTTP.
/// Keep in lockstep with `desktop/src/quoteJump.ts`.
enum QuoteJump {
    static let storageKey = "snorlax.quoteJumps"
    static let keysLabel = "⌘'"
    static let action = "Jump to the quoted message"

    struct Link: Codable, Equatable {
        var text: String
        var sourceId: String
    }

    enum Part: Equatable {
        case quote(text: String, sourceId: String)
        case text(String)
    }

    struct Blob: Codable {
        var pending: [String: [Link]]
        var sent: [String: [Link]]

        static let empty = Blob(pending: [:], sent: [:])
    }

    static func chatKey(agentId: String, threadId: String?) -> String {
        agentId + "\u{0}" + (threadId ?? "")
    }

    static func sentKey(agentId: String, threadId: String?, content: String) -> String {
        chatKey(agentId: agentId, threadId: threadId) + "\u{1}" + content
    }

    /// ⌘' / ⌃'. Shift and Option stay put.
    static func isChord(
        key: String,
        characters: String,
        command: Bool,
        control: Bool,
        option: Bool,
        shift: Bool
    ) -> Bool {
        if option || shift { return false }
        if command == control { return false }
        let token = characters.isEmpty ? key : characters
        return token == "'" || key == "'"
    }

    static func shouldIgnoreRepeat(_ isRepeat: Bool) -> Bool {
        isRepeat
    }

    /// The composer may take this chord. Any other text field does.
    static func overlayTextFieldOwnsChord(
        textFieldFocused: Bool,
        composerFocused: Bool
    ) -> Bool {
        textFieldFocused && !composerFocused
    }

    static func highlightAnimates(reduceMotion: Bool) -> Bool {
        UserMessageJump.highlightAnimates(reduceMotion: reduceMotion)
    }

    /// Contiguous `>` / `> text` lines. A blank line that is not `>` ends the block.
    static func blocks(_ content: String) -> [String] {
        let normalized = content
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        var blocks: [String] = []
        var current: [String] = []
        func flush() {
            let text = current.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                blocks.append(text)
            }
            current = []
        }
        for line in lines {
            if line == ">" || line.hasPrefix("> ") {
                current.append(line == ">" ? "" : String(line.dropFirst(2)))
                continue
            }
            flush()
        }
        flush()
        return blocks
    }

    static func adding(_ links: [Link], text: String, sourceId: String) -> [Link] {
        guard let body = QuoteSelection.quoteable(text), !sourceId.isEmpty else { return links }
        var next = links.filter { $0.text != body }
        next.append(Link(text: body, sourceId: sourceId))
        return next
    }

    static func stillInContent(_ content: String, links: [Link]) -> [Link] {
        let present = Set(blocks(content))
        return links.filter { present.contains($0.text) && !$0.sourceId.isEmpty }
    }

    static func targets(content: String, links: [Link], loaded: Set<String>) -> [Link] {
        var byText: [String: String] = [:]
        for link in links where loaded.contains(link.sourceId) {
            byText[link.text] = link.sourceId
        }
        var found: [Link] = []
        for block in blocks(content) {
            guard let sourceId = byText[block] else { continue }
            found.append(Link(text: block, sourceId: sourceId))
        }
        return found
    }

    static func primarySource(_ targets: [Link]) -> String? {
        targets.last?.sourceId
    }

    static func parts(content: String, targets: [Link]) -> [Part] {
        if targets.isEmpty { return [.text(content)] }
        var byText: [String: String] = [:]
        for target in targets {
            byText[target.text] = target.sourceId
        }
        let normalized = content
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        var parts: [Part] = []
        var textLines: [String] = []
        var quoteLines: [String]? = nil

        func flushText() {
            guard !textLines.isEmpty else { return }
            parts.append(.text(textLines.joined(separator: "\n")))
            textLines = []
        }
        func flushQuote() {
            guard let quoteLines else { return }
            let body = quoteLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if let sourceId = byText[body] {
                flushText()
                parts.append(.quote(text: body, sourceId: sourceId))
            } else {
                for line in quoteLines {
                    textLines.append(line.isEmpty ? ">" : "> \(line)")
                }
            }
        }

        for line in lines {
            if line == ">" || line.hasPrefix("> ") {
                if quoteLines == nil { quoteLines = [] }
                quoteLines?.append(line == ">" ? "" : String(line.dropFirst(2)))
                continue
            }
            flushQuote()
            quoteLines = nil
            textLines.append(line)
        }
        flushQuote()
        flushText()
        return parts.isEmpty ? [.text(content)] : parts
    }

    /// The quote row under the reading line, or the closest one above it.
    /// When every quote is below, the first one.
    static func pickMessageId(rows: [UserMessageJump.Row], line: UserMessageJump.ViewLine) -> String? {
        let list = rows.filter { !$0.id.isEmpty }
        if list.isEmpty { return nil }
        var lastSettled: String?
        for (index, row) in list.enumerated() {
            if row.top == nil {
                let later = list[(index + 1)...].first { $0.top != nil }
                guard let later else { return lastSettled ?? row.id }
                if settled(later, line: line) {
                    lastSettled = row.id
                    continue
                }
                return lastSettled ?? row.id
            }
            if settled(row, line: line) {
                lastSettled = row.id
                continue
            }
            return lastSettled ?? row.id
        }
        return lastSettled
    }

    private static func settled(_ row: UserMessageJump.Row, line: UserMessageJump.ViewLine) -> Bool {
        guard let top = row.top else { return false }
        if top <= line.viewAnchor + line.epsilon { return true }
        let commanded = UserMessageJump.scrollOffset(
            targetTop: top,
            stickyInset: line.stickyInset,
            maxOffset: line.maxOffset
        )
        return commanded >= line.maxOffset - line.epsilon && line.scrollTop + line.epsilon >= commanded
    }
}

private struct QuoteSourceIDKey: EnvironmentKey {
    static let defaultValue = ""
}

extension EnvironmentValues {
    /// Message id of the bubble whose text is being quoted.
    var quoteSourceId: String {
        get { self[QuoteSourceIDKey.self] }
        set { self[QuoteSourceIDKey.self] = newValue }
    }
}

struct QuoteJumps {
    private var pending: [String: [QuoteJump.Link]]
    private var sent: [String: [QuoteJump.Link]]
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let blob = Self.load(from: defaults)
        pending = blob.pending
        sent = blob.sent
    }

    mutating func note(agentId: String, threadId: String?, text: String, sourceId: String) {
        let key = QuoteJump.chatKey(agentId: agentId, threadId: threadId)
        let next = QuoteJump.adding(pending[key] ?? [], text: text, sourceId: sourceId)
        guard !next.isEmpty else { return }
        pending[key] = next
        persist()
    }

    mutating func clearPending(agentId: String, threadId: String?) {
        let key = QuoteJump.chatKey(agentId: agentId, threadId: threadId)
        guard pending[key] != nil else { return }
        pending.removeValue(forKey: key)
        persist()
    }

    mutating func commit(agentId: String, threadId: String?, content: String) {
        let key = QuoteJump.chatKey(agentId: agentId, threadId: threadId)
        let kept = QuoteJump.stillInContent(content, links: pending[key] ?? [])
        var changed = false
        if !kept.isEmpty {
            sent[QuoteJump.sentKey(agentId: agentId, threadId: threadId, content: content)] = kept
            changed = true
        }
        if pending[key] != nil {
            pending.removeValue(forKey: key)
            changed = true
        }
        if changed { persist() }
    }

    /// v1.28: a queued follow-up takes the draft's quote links so clearing
    /// the composer does not drop them.
    mutating func takePending(agentId: String, threadId: String?) -> [QuoteJump.Link] {
        let key = QuoteJump.chatKey(agentId: agentId, threadId: threadId)
        let links = pending[key] ?? []
        guard !links.isEmpty else { return [] }
        pending.removeValue(forKey: key)
        persist()
        return links
    }

    /// v1.28: keep quote links for a queued send. A newer draft's pending
    /// quotes stay pending.
    mutating func commitOwned(
        agentId: String,
        threadId: String?,
        content: String,
        links: [QuoteJump.Link]
    ) {
        let kept = QuoteJump.stillInContent(content, links: links)
        guard !kept.isEmpty else { return }
        sent[QuoteJump.sentKey(agentId: agentId, threadId: threadId, content: content)] = kept
        persist()
    }

    /// v1.28: a failed queued send puts its quote links back on that draft.
    mutating func restorePending(agentId: String, threadId: String?, links: [QuoteJump.Link]) {
        guard !links.isEmpty else { return }
        let key = QuoteJump.chatKey(agentId: agentId, threadId: threadId)
        var next = pending[key] ?? []
        var have = Set(next.map(\.text))
        var changed = false
        for link in links where !link.sourceId.isEmpty && !have.contains(link.text) {
            next.append(link)
            have.insert(link.text)
            changed = true
        }
        guard changed else { return }
        pending[key] = next
        persist()
    }

    func targets(
        agentId: String,
        threadId: String?,
        content: String,
        loaded: Set<String>
    ) -> [QuoteJump.Link] {
        let key = QuoteJump.sentKey(agentId: agentId, threadId: threadId, content: content)
        return QuoteJump.targets(content: content, links: sent[key] ?? [], loaded: loaded)
    }

    private mutating func persist() {
        let blob = QuoteJump.Blob(pending: pending, sent: sent)
        guard let data = try? JSONEncoder().encode(blob) else { return }
        defaults.set(data, forKey: QuoteJump.storageKey)
    }

    private static func load(from defaults: UserDefaults) -> QuoteJump.Blob {
        guard let data = defaults.data(forKey: QuoteJump.storageKey),
              let blob = try? JSONDecoder().decode(QuoteJump.Blob.self, from: data)
        else { return .empty }
        return blob
    }
}
