// SPDX-License-Identifier: Apache-2.0
import UIKit

/// v2.18: copy the image the lightbox is already showing.
/// A muted Copy control sits with Save and Close. This side puts
/// the picture that painted the overlay on the pasteboard. It does
/// not ask for photo-library permission. The button reads Copied
/// for 1.2s, then Copy again. A picture that will not decode leaves
/// the label as Copy. The overlay stays open. Nothing is sent, and
/// a pending chip is not removed. Stepping to another image clears
/// Copied. No new animation. No new shortcut. No new HTTP.
/// Keep in lockstep with `desktop/src/lightboxCopy.ts`.
enum LightboxCopy {
    static let label = "Copy"
    static let copiedLabel = "Copied"
    static let accessibilityLabel = "Copy image"
    static let copiedAccessibility = "Copied"
    /// Same confirmation as message Copy.
    static let feedbackMs: UInt64 = 1200
    static var feedbackNanoseconds: UInt64 { feedbackMs * 1_000_000 }

    /// Copying does not dismiss the overlay and does not remove a chip.
    static func keepsOpen() -> Bool { true }

    /// The label swap does not fade, including when Reduce Motion is off.
    static func animates(reduceMotion: Bool) -> Bool {
        _ = reduceMotion
        return false
    }

    /// The picture already shown. Empty bytes and data UIImage cannot
    /// decode do not touch the pasteboard.
    static func writeToPasteboard(_ data: Data) -> Bool {
        guard !data.isEmpty, let image = UIImage(data: data) else { return false }
        UIPasteboard.general.image = image
        return true
    }
}
