// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v2.41: Copy on a completed assistant Footnotes list.
/// A muted 12pt Copy sits at the top-right of the list. Tap copies
/// the same notes.md text Save writes, one `[^label]:` definition per
/// rendered note, then the button reads Copied for 1.5s. The Footnotes
/// title and the painted numbers are not the clipboard. Hidden while
/// streaming. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/footnoteCopy.ts`.
enum FootnoteCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy footnotes"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished list with a note to copy. Streaming draws no list.
    static func showsCopy(completed: Bool, notes: [MarkdownFootnote.Note]) -> Bool {
        completed && !clipboardText(notes).isEmpty
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Same text as the file. Definitions stay. No trailing newline.
    static func clipboardText(_ notes: [MarkdownFootnote.Note]) -> String {
        FootnoteSave.markdown(notes)
    }

    /// An empty string does not touch the pasteboard.
    static func writeClipboard(_ text: String) {
        guard !text.isEmpty else { return }
        UIPasteboard.general.string = text
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
