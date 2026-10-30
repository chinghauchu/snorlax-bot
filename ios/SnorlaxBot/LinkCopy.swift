// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v2.25: confirm Copy Link on a message bubble.
/// The long-press menu already copies the destination. This shows a
/// muted Copied for 1.5s and does not open the link. No animation.
/// Keep in lockstep with `desktop/src/linkCopy.ts`.
enum LinkCopy {
    static let copiedLabel = "Copied"
    static let copiedAria = "Copied"
    static let feedbackNanoseconds: UInt64 = 1_500_000_000
    static let copiedNotification = Notification.Name("snorlax.linkCopied")

    /// Destination the link would open. Not the visible label.
    static func clipboardText(_ destination: String) -> String {
        destination
    }

    /// The menu already wrote the pasteboard. Tell the transcript.
    static func noteCopied() {
        NotificationCenter.default.post(name: copiedNotification, object: nil)
    }

    /// Label swap only. Never animate, including when Reduce Motion is off.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }
}
