// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v0.84: the composer grows with typed or pasted text, then scrolls
/// inside the field. Deleting text shrinks it back. An empty composer
/// stays one line. Height changes are instant, including when Reduce
/// Motion is on (no spring). Enter still sends; Shift-Return still
/// inserts a newline. No new HTTP.
///
/// Keep `maxHeight` in lockstep with `desktop/src/composerGrow.ts`
/// `COMPOSER_MAX_PX` and `.composer-bar textarea` max-height.
enum ComposerGrow {
    /// About 8 lines of the 14pt field, inside 160–200.
    static let maxHeight: CGFloat = 160
    /// Floor for the resting line. The row is still the 44pt buttons
    /// until the text is taller than those buttons.
    static let minHeight: CGFloat = 22

    struct Frame: Equatable {
        var height: CGFloat
        var scroll: Bool
    }

    /// One line of the composer font, including the text container inset.
    static func restingHeight(font: UIFont, inset: UIEdgeInsets) -> CGFloat {
        ceil(font.lineHeight + inset.top + inset.bottom)
    }

    /// Empty or a single line stays at the resting height. Taller text
    /// grows until `maxHeight`, then `scroll` is true.
    static func frame(
        contentHeight: CGFloat,
        empty: Bool,
        restingHeight: CGFloat,
        maxHeight: CGFloat = ComposerGrow.maxHeight
    ) -> Frame {
        let resting = max(minHeight, restingHeight)
        if empty || contentHeight <= resting + 1 {
            return Frame(height: resting, scroll: false)
        }
        let capped = min(ceil(contentHeight), maxHeight)
        return Frame(height: max(capped, resting), scroll: contentHeight > maxHeight)
    }

    /// Instant either way. Do not spring the composer height.
    static func animation(reduceMotion: Bool) -> Animation? {
        _ = reduceMotion
        return nil
    }

    /// Height of `text` wrapped to `width`. Independent of whether the
    /// live text view is scrolling, so the cap does not feed itself.
    static func contentHeight(
        text: String,
        width: CGFloat,
        font: UIFont,
        inset: UIEdgeInsets,
        lineFragmentPadding: CGFloat
    ) -> CGFloat {
        let line = font.lineHeight
        let oneLine = ceil(line + inset.top + inset.bottom)
        if text.isEmpty || width <= 1 {
            return oneLine
        }
        let containerWidth = max(1, width - inset.left - inset.right - lineFragmentPadding * 2)
        let storage = NSTextStorage(string: text, attributes: [.font: font])
        let manager = NSLayoutManager()
        let container = NSTextContainer(
            size: CGSize(width: containerWidth, height: .greatestFiniteMagnitude)
        )
        container.lineFragmentPadding = lineFragmentPadding
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        manager.ensureLayout(for: container)
        let used = manager.usedRect(for: container)
        return ceil(max(used.height, line) + inset.top + inset.bottom)
    }
}
