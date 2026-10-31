// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.35: Copy on a completed assistant blockquote.
/// A muted 12pt Copy sits at the top-right of the quote. Tap copies
/// the lines this quote was split from, including `>` markers, then
/// the button reads Copied for 1.5s. The display text, with markers
/// removed, is not the clipboard. A nested quote has its own button.
/// Hidden while streaming. The quote body is a text view, so this is
/// a button rather than another long-press on that text. No animation.
/// No new shortcut.
/// Keep in lockstep with `desktop/src/quoteCopy.ts`.
enum QuoteCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy quote"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished quote with lines to copy. Streaming has no quote block.
    static func showsCopy(completed: Bool, source: String) -> Bool {
        completed && !source.isEmpty
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Lines the splitter kept. Markers stay. No trailing newline.
    static func clipboardText(_ source: String) -> String {
        source
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
