// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.23: Copy on a completed assistant display-math block.
/// Copies the TeX interior only (no $$ delimiters). Shows Copied for
/// 1.5s, then reverts. Hidden while streaming, while the closing $$
/// has not arrived. Inline formulas use InlineMathCopy (v2.27).
/// No animation.
enum MathBlockCopy {
    static let copyLabel = "Copy"
    static let copiedLabel = "Copied"
    static let copyAria = "Copy math"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000

    static func showsCopy(completed: Bool, closed: Bool) -> Bool {
        completed && closed
    }

    static func label(copied: Bool) -> String {
        copied ? copiedLabel : copyLabel
    }

    static func accessibilityLabel(copied: Bool) -> String {
        copied ? copiedAria : copyAria
    }

    /// TeX interior only. No $$ delimiters. Interior whitespace stays.
    static func clipboardText(_ tex: String) -> String {
        tex
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
