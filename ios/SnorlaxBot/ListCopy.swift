// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.37: Copy on a completed assistant list.
/// A muted 12pt Copy sits at the top-right of the list. Tap copies
/// the lines this list was split from, including bullet or number
/// markers, then the button reads Copied for 1.5s. The display text,
/// with markers removed, is not the clipboard. A nested list has its
/// own button. Hidden while streaming. A task list does not gain this
/// control. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/listCopy.ts`.
enum ListCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy list"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished list with lines to copy. Streaming has no list block.
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
