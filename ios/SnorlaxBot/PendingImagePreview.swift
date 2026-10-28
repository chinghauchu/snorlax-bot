// SPDX-License-Identifier: Apache-2.0
import Foundation

/// v2.10: preview a pending image before sending.
/// Tapping the pending image chip opens that local preview in the
/// existing v0.79 lightbox. Close, a tap outside, Esc, or a swipe
/// down dismisses it the same way and leaves the chip. Nothing is
/// sent or removed. The corner remove control still only removes.
/// Videos stay the player. File chips stay chips. Reduce Motion
/// stays the lightbox fade. No new HTTP.
/// Keep in lockstep with `desktop/src/pendingImagePreview.ts`.
enum PendingImagePreview {
    static let action = "Preview"

    /// Only a pending image opens the lightbox.
    static func opens(kind: Attachment.Kind) -> Bool {
        kind == .image
    }

    /// Accessible name on the thumb. An empty name still says what
    /// the control does.
    static func accessibilityLabel(name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Preview image" }
        return "Preview \(trimmed)"
    }

    /// Local bytes for the existing lightbox. Nil for video, files,
    /// and an image that has no preview bytes. The caller passes
    /// these as `ImageLightbox.Target.local`. Closing the overlay
    /// does not remove the chip and does not send.
    static func previewData(kind: Attachment.Kind, data: Data?) -> Data? {
        guard opens(kind: kind), let data, !data.isEmpty else { return nil }
        return data
    }
}
