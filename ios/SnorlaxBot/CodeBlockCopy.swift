// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.66: fenced-code Copy on assistant LEFT messages.
/// Copies the fence body only. Shows Copied for 1.5s, then reverts.
/// Hidden while that message is still streaming. No animation.
enum CodeBlockCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy code"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    static func showsCopy(completed: Bool) -> Bool {
        completed
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// Fence body only. No fences, no language tag. Interior whitespace stays.
    static func clipboardText(_ source: String) -> String {
        source
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
