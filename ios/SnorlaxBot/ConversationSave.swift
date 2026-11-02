// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.42: Save the open chat's loaded conversation as markdown.
/// Writes user and assistant kind=message turns, in order, with the
/// server speaker name and the same local clock as the bubble, as
/// conversation.md. Shows Saved for 1.5s, then reverts. This side hands
/// that file to the system share sheet from the chat header and does
/// not ask for photo-library permission. Transcript Save stays
/// transcript.txt and still has no speaker labels. Reply Save stays
/// reply.md. A tool, widget, approve, connect, or handoff row is
/// skipped. No animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/conversationSave.ts`.
struct ConversationTurn: Equatable {
    var kind: Message.Kind?
    var role: Message.Role
    var senderId: String
    var senderName: String
    var content: String
    var createdAt: Date?
}

enum ConversationSave {
    static let saveLabel = "Save as conversation.md"
    static let savedLabel = "Saved"
    static let saveAria = "Save as conversation.md"
    static let savedAria = "Saved"
    static let filename = "conversation.md"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// An open chat whose loaded turns would write at least one line.
    static func showsSave(chatOpen: Bool, text: String?) -> Bool {
        guard chatOpen, let text, !text.isEmpty else { return false }
        return true
    }

    static func label(saved: Bool) -> String {
        saved ? savedLabel : saveLabel
    }

    static func accessibilityLabel(saved: Bool) -> String {
        saved ? savedAria : saveAria
    }

    /// Saving does not send or switch chats.
    static func keepsChat() -> Bool { true }

    /// Missing kind counts as a message. Chrome rows do not.
    static func isMessage(_ kind: Message.Kind?) -> Bool {
        kind == nil || kind == .message
    }

    /// Server sender name, with interior whitespace collapsed. A blank
    /// name is You for a user turn and Assistant otherwise.
    static func speakerName(_ turn: ConversationTurn) -> String {
        let name = turn.senderName
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
        if !name.isEmpty { return name }
        let fromUser = turn.senderId == "user" || (turn.senderId.isEmpty && turn.role == .user)
        return fromUser ? "You" : "Assistant"
    }

    /// Keep a `*` or `\` in a name from breaking the bold markers.
    static func escapeSpeaker(_ name: String) -> String {
        var out = ""
        for ch in name {
            if ch == "\\" || ch == "*" { out.append("\\") }
            out.append(ch)
        }
        return out
    }

    /// `**Name** · h:mm AM`, or `**Name**` when the clock is missing.
    static func heading(_ turn: ConversationTurn, now: Date) -> String {
        let speaker = escapeSpeaker(speakerName(turn))
        if let createdAt = turn.createdAt {
            let time = BubbleTime.format(createdAt, now: now)
            return "**\(speaker)** · \(time)"
        }
        return "**\(speaker)**"
    }

    /// Loaded turns, in order. Speaker line, a blank line, then the
    /// trimmed body. No document title. No extra trailing newline.
    static func markdown(turns: [ConversationTurn], now: Date = Date()) -> String? {
        var parts: [String] = []
        for turn in turns {
            guard isMessage(turn.kind) else { continue }
            let body = turn.content.trimmingCharacters(in: .whitespacesAndNewlines)
            if body.isEmpty { continue }
            parts.append(heading(turn, now: now) + "\n\n" + body)
        }
        if parts.isEmpty { return nil }
        return parts.joined(separator: "\n\n")
    }

    /// The markdown already has no extra trailing newline.
    static func bodyText(_ markdown: String) -> String {
        markdown
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Write UTF-8 markdown under the temporary directory. A failed write
    /// returns nil and the caller does not present the sheet or Saved.
    static func writeFile(text: String, filename: String) -> URL? {
        let safe = safeLeaf(filename)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("snorlax-conversation", isDirectory: true)
        let file = dir.appendingPathComponent(safe, isDirectory: false)
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true
            )
            try Data(bodyText(text).utf8).write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }

    private static func safeLeaf(_ filename: String) -> String {
        if filename.isEmpty
            || filename.contains("/")
            || filename.contains("\\")
            || filename == "."
            || filename == ".."
            || filename.hasPrefix(".") {
            return "conversation.md"
        }
        return filename
    }
}
