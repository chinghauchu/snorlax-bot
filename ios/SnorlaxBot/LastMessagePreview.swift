// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.80: one muted truncated preview under each chat or agent name.
/// Latest user or assistant text already in memory. Prefer kind=message
/// (and handoff). Skip tool / widget / approve / connect chrome when it
/// has no useful text. Empty chats stay blank. No new HTTP.
/// Keep in lockstep with `desktop/src/lastMessagePreview.ts`.
enum LastMessagePreview {
    /// Roughly one sidebar line. The row also ellipsizes.
    static let limit = 120

    static func oneLine(_ text: String) -> String {
        let flat = text
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        if flat.isEmpty { return "" }
        if flat.count <= limit { return flat }
        let end = flat.index(flat.startIndex, offsetBy: limit - 1)
        let cut = String(flat[..<end]).trimmingCharacters(in: .whitespaces)
        return cut + "…"
    }

    /// kind=message, handoff, or a missing kind. Tool / widget / approve / connect are chrome.
    static func isPreferred(_ kind: Message.Kind?) -> Bool {
        kind == nil || kind == .message || kind == .handoff
    }

    /// Main transcript only. A thread must not replace the channel row.
    static func snapshotMainTranscript(_ threadId: String?) -> Bool {
        threadId == nil
    }

    /// Another chat's rows must not be written onto this sidebar id.
    static func owns(chatId: String, messages: [Message]) -> Bool {
        guard !chatId.isEmpty else { return false }
        return messages.allSatisfy { $0.agentId.isEmpty || $0.agentId == chatId }
    }

    /// Latest user-visible line: prefer kind=message. Chrome only when it has useful text.
    static func line(from messages: [Message]) -> String? {
        var chrome: String?
        for message in messages.reversed() {
            if let preferred = preferredText(message) {
                return preferred
            }
            if chrome == nil, let extra = chromeText(message) {
                chrome = extra
            }
        }
        return chrome
    }

    private static func preferredText(_ message: Message) -> String? {
        guard isPreferred(message.kind) else { return nil }
        if message.kind == .handoff {
            let ask = oneLine(message.userAsk ?? "")
            if !ask.isEmpty { return ask }
            let body = oneLine(message.content)
            if !body.isEmpty { return body }
            return attachmentLabel(message)
        }
        let body = oneLine(message.displayContent)
        if !body.isEmpty { return body }
        return attachmentLabel(message)
    }

    private static func chromeText(_ message: Message) -> String? {
        let raw: String
        switch message.kind {
        case .tool:
            raw = message.content
        case .widget:
            raw = message.widget?.prompt ?? message.content
        case .approve:
            raw = message.approve?.command ?? message.content
        case .connect:
            raw = message.connect?.prompt ?? message.content
        default:
            return nil
        }
        let text = oneLine(raw)
        return text.isEmpty ? nil : text
    }

    private static func attachmentLabel(_ message: Message) -> String? {
        for att in message.userRightAttachments {
            let name = att.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty { return oneLine(name) }
            switch att.kind {
            case .image: return "Image"
            case .video: return "Video"
            case .file: return "File"
            }
        }
        if !message.images.isEmpty { return "Image" }
        return nil
    }
}
