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
    /// A CommonMark link title, when the bubble stashed one, sits above
    /// the URL as the tooltip line and the accessibility hint.
    static func headerView(_ text: String) -> UIView {
        let hint = MarkdownLinkTitle.consumePreviewHint()
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
        var titleLabel: UILabel?
        var titleHeight: CGFloat = 0
        if let hint {
            let tip = UILabel()
            tip.text = hint
            tip.font = .systemFont(ofSize: 12, weight: .semibold)
            tip.textColor = .label
            tip.numberOfLines = 0
            tip.lineBreakMode = .byWordWrapping
            tip.textAlignment = .natural
            tip.preferredMaxLayoutWidth = maxTextWidth
            let tipSize = tip.sizeThatFits(CGSize(width: maxTextWidth, height: 2000))
            titleHeight = tipSize.height + 4
            titleLabel = tip
        }
        let contentWidth = max(textSize.width, titleLabel?.sizeThatFits(CGSize(width: maxTextWidth, height: 2000)).width ?? 0)
        let width = min(300, max(contentWidth + 20, 44))
        let height = max(textSize.height + 16 + titleHeight, 28)
        if let titleLabel, let hint {
            titleLabel.text = hint
            titleLabel.frame = CGRect(x: 10, y: 8, width: width - 20, height: max(titleHeight - 4, 0))
            label.frame = CGRect(x: 10, y: 8 + titleHeight, width: width - 20, height: textSize.height)
        } else {
            label.frame = CGRect(x: 10, y: 8, width: width - 20, height: height - 16)
        }
        let wrap = UIView(frame: CGRect(x: 0, y: 0, width: width, height: height))
        wrap.backgroundColor = .secondarySystemBackground
        wrap.layer.cornerRadius = 10
        wrap.clipsToBounds = true
        wrap.isAccessibilityElement = true
        wrap.accessibilityLabel = text
        if let hint {
            wrap.accessibilityHint = hint
        }
        if let titleLabel {
            wrap.addSubview(titleLabel)
        }
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
