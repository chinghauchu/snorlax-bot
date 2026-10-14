// SPDX-License-Identifier: Apache-2.0

import SwiftUI

/// v0.93: chat-list generating indicator.
/// While an assistant reply the client started is in flight, that row
/// shows muted ··· in the relative-time slot and a muted "Typing…"
/// preview. A non-open chat with a visible top-level draft keeps the
/// v0.91 Draft: line; the dots still replace the time. Reduce Motion
/// paints static dots, the same rule as v0.58. The stored last-message
/// preview is not overwritten. When the reply settles, the indicator
/// clears and the v0.70 unread dot takes over on its own if that chat
/// is not open. No new HTTP. No new storage key.
/// Keep in lockstep with `desktop/src/chatGenerating.ts`.
enum ChatGenerating {
    static let hint = "Typing…"

    enum Kind: Equatable {
        case message
        case draft
        case typing
    }

    struct Row: Equatable {
        var kind: Kind
        var text: String
        var prefix: String?
    }

    /// Pulse only when Reduce Motion is off. Static muted ··· when on.
    static func shouldPulse(reduceMotion: Bool) -> Bool {
        WaitingChrome.shouldPulse(reduceMotion: reduceMotion)
    }

    /// ··· replace the relative time for the whole in-flight reply.
    static func showsDots(generating: Bool) -> Bool {
        generating
    }

    /// Preview precedence: Draft: wins, then Typing…, then the last message.
    static func line(
        chatId: String,
        openChatId: String?,
        draft: String?,
        lastMessage: String?,
        generating: Bool
    ) -> Row? {
        let base = ChatDraftPreview.row(
            chatId: chatId,
            openChatId: openChatId,
            draft: draft,
            lastMessage: lastMessage
        )
        if let base, base.kind == .draft {
            return Row(kind: .draft, text: base.text, prefix: base.prefix)
        }
        if generating, !chatId.isEmpty {
            return Row(kind: .typing, text: hint, prefix: nil)
        }
        if let base {
            return Row(kind: .message, text: base.text, prefix: nil)
        }
        return nil
    }
}

/// Same ··· as the v0.51 waiting line. Reduce Motion is static.
struct GeneratingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if ChatGenerating.shouldPulse(reduceMotion: reduceMotion) {
                WaitingLabel()
            } else {
                Text(WaitingChrome.label)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ChatGenerating.hint)
    }
}
