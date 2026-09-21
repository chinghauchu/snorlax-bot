// SPDX-License-Identifier: Apache-2.0

import Foundation

/// v0.55 Send muted while generating. Matches desktop `sendMuted.ts`.
/// Send is muted and disabled from Send until complete / Stop / error /
/// empty. Composer text stays editable. Enter does not send. Stop / Esc
/// unchanged.
enum SendMuted {
    static let disabledOpacity: CGFloat = 0.35

    static func whileGenerating(busy: Bool) -> Bool {
        busy
    }

    /// Composer text stays editable while generating (draft the next message).
    static func composerEditable(
        credsReady: Bool,
        hasAgent: Bool,
        takeoverOpen: Bool
    ) -> Bool {
        credsReady && hasAgent && !takeoverOpen
    }

    /// Hardware Return does not send while generating.
    static func enterSends(busy: Bool) -> Bool {
        !whileGenerating(busy: busy)
    }

    /// Send re-enables as soon as the in-flight turn is gone.
    static func reenabled(busy: Bool) -> Bool {
        !whileGenerating(busy: busy)
    }
}
