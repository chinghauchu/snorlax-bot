// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.38: Copy on a completed assistant heading section.
/// A muted 12pt Copy sits at the top-right of the section. Tap copies
/// the heading line plus the lines under it until the next heading of
/// the same or higher level, then the button reads Copied for 1.5s.
/// Hidden while streaming. No animation. No new shortcut.
/// Keep in lockstep with `desktop/src/sectionCopy.ts`.
enum SectionCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy section"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished section with lines to copy. Streaming has no section.
    static func showsCopy(completed: Bool, source: String) -> Bool {
        completed && !source.isEmpty
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Heading line plus the lines under it. No trailing newline.
    static func clipboardText(_ source: String) -> String {
        source
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
