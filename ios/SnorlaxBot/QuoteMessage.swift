// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v2.17: quote a whole message into the composer.
/// A settled user-RIGHT kind=message with text, and a completed
/// assistant LEFT kind=message with text, offer Quote on long-press.
/// Activating it quotes that message's content as markdown `>` lines.
/// A text selection still quotes only the selection. An in-flight
/// optimistic send and a streaming reply are not offered. Tool lines,
/// cards, handoff rows, and attachment-only bubbles are not.
/// Nothing is sent. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/quoteMessage.ts`.
enum QuoteMessage {
    static let label = "Quote"
    static let accessibilityLabel = "Quote message"

    /// Settled user text, or a completed assistant message with text.
    /// Whitespace-only content is not a quote. Pending and streaming are not.
    static func offers(
        fromUser: Bool,
        kindMessage: Bool,
        content: String,
        completed: Bool,
        pending: Bool
    ) -> Bool {
        if pending { return false }
        if !kindMessage { return false }
        if !fromUser && !completed { return false }
        return QuoteSelection.block(content) != nil
    }
}
