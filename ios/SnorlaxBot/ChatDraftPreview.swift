// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.91: draft hint on a chat-list row.
/// A chat other than the one open shows a muted-accent "Draft:" prefix
/// and the v0.64/v0.69 top-level composer draft (nil thread — the
/// conversation that row opens) instead of the v0.80 last-message line.
/// Whitespace-only drafts do not count. Clearing or sending the draft
/// restores the last-message preview. The open chat's row keeps that
/// preview. Truncation matches `LastMessagePreview.oneLine`. No new HTTP.
/// Keep in lockstep with `desktop/src/chatDraftPreview.ts`.
enum ChatDraftPreview {
    static let prefix = "Draft:"

    enum Kind: Equatable {
        case message
        case draft
    }

    struct Row: Equatable {
        var kind: Kind
        var text: String
        var prefix: String?
    }

    /// Non-whitespace draft collapsed to one truncated line.
    static func visibleDraftText(_ draft: String?) -> String? {
        let line = LastMessagePreview.oneLine(draft ?? "")
        return line.isEmpty ? nil : line
    }

    /// Chat-list line. The open chat always uses the last message.
    /// Any other chat with a visible top-level draft uses Draft: plus that text.
    static func row(
        chatId: String,
        openChatId: String?,
        draft: String?,
        lastMessage: String?
    ) -> Row? {
        if chatId.isEmpty {
            let last = (lastMessage ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if last.isEmpty { return nil }
            return Row(kind: .message, text: last, prefix: nil)
        }
        let open = chatId == openChatId
        if !open, let text = visibleDraftText(draft) {
            return Row(kind: .draft, text: text, prefix: prefix)
        }
        let last = (lastMessage ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if last.isEmpty { return nil }
        return Row(kind: .message, text: last, prefix: nil)
    }
}
