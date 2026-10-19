// SPDX-License-Identifier: Apache-2.0
import UIKit

/// v1.35: long-press a link in a completed message bubble to see where
/// it goes before opening it. The context menu header and preview are
/// the full destination URL. Open Link follows the existing tap. Copy
/// Link writes that URL, never the visible label. A normal tap still
/// opens. No animation. No new HTTP.
/// Desktop middle-truncates the same destination in a status pill
/// (`desktop/src/linkStatus.ts`). This side shows the full string.
enum LinkPreview {
    static let openLink = "Open Link"
    static let copyLink = "Copy Link"

    /// Full destination. www autolinks already include `http://` on the URL.
    static func destination(_ url: URL) -> String {
        url.absoluteString
    }

    /// Clipboard text is the destination, never the visible label.
    static func copyText(_ url: URL) -> String {
        destination(url)
    }

    /// Preview card above the menu. The URL wraps; it is not truncated.
    static func headerView(_ text: String) -> UIView {
        let label = UILabel()
        label.text = text
        label.font = .systemFont(ofSize: 12)
        label.textColor = .secondaryLabel
        label.numberOfLines = 0
        label.lineBreakMode = .byCharWrapping
        label.textAlignment = .natural
        let maxTextWidth: CGFloat = 280
        label.preferredMaxLayoutWidth = maxTextWidth
        let textSize = label.sizeThatFits(CGSize(width: maxTextWidth, height: 2000))
        let width = min(300, max(textSize.width + 20, 44))
        let height = max(textSize.height + 16, 28)
        label.frame = CGRect(x: 10, y: 8, width: width - 20, height: height - 16)
        let wrap = UIView(frame: CGRect(x: 0, y: 0, width: width, height: height))
        wrap.backgroundColor = .secondarySystemBackground
        wrap.layer.cornerRadius = 10
        wrap.clipsToBounds = true
        wrap.isAccessibilityElement = true
        wrap.accessibilityLabel = text
        wrap.addSubview(label)
        return wrap
    }

    /// Header title and preview are both the full destination.
    static func configuration(
        for url: URL,
        open: @escaping (URL) -> Void
    ) -> UITextItem.MenuConfiguration {
        let destination = destination(url)
        let openAction = UIAction(title: openLink) { _ in
            open(url)
        }
        let copyAction = UIAction(title: copyLink) { _ in
            UIPasteboard.general.string = copyText(url)
        }
        let menu = UIMenu(title: destination, children: [openAction, copyAction])
        return UITextItem.MenuConfiguration(
            preview: .view(headerView(destination)),
            menu: menu
        )
    }
}
