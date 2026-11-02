// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.39: Copy on a completed assistant task list.
/// A muted 12pt Copy sits at the top-right of the list. Tap copies
/// the lines this task list was split from, including `- [ ]`,
/// `* [x]`, and `+ [ ]` markers, then the button reads Copied for
/// 1.5s. The display text, with markers removed, is not the
/// clipboard. A nested task list has its own button. Hidden while
/// streaming. A bulleted or numbered list keeps list Copy. No
/// animation. No new shortcut.
/// Keep in lockstep with `desktop/src/taskCopy.ts`.
enum TaskCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy task list"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    /// A finished task list with lines to copy. Streaming has no task block.
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
