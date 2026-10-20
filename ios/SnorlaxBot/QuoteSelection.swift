// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// v0.94: quote a text selection into the composer.
/// User-RIGHT and completed assistant-LEFT `kind=message` only.
/// The quote is markdown `>` lines. The caret sits on the blank line
/// after the quote. An existing draft is kept and the quote is appended
/// after one blank line. A whitespace-only composer counts as empty.
/// Nothing is sent. Tool lines, widget / approve / connect cards, file
/// chips, and the live LEFT stream are not quotable. No HTTP.
/// Keep in lockstep with `desktop/src/quoteSelection.ts`.
enum QuoteSelection {
    static let label = "Quote"

    /// Trimmed selection, or nil when it is empty or whitespace.
    static func quoteable(_ selection: String) -> String? {
        let normalized = selection
            .replacingOccurrences(of: "\u{00a0}", with: " ")
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let trimmed = normalized.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// One `>` line per source line. A blank line inside the selection stays `>`.
    static func block(_ selection: String) -> String? {
        guard let body = quoteable(selection) else { return nil }
        return body
            .components(separatedBy: "\n")
            .map { line in
                line.isEmpty ? ">" : "> \(line)"
            }
            .joined(separator: "\n")
    }

    struct Draft {
        var text: String
        /// UTF-16 length, matching the composer caret.
        var caret: Int
    }

    /// Nil when the selection should do nothing. Does not send.
    static func append(draft: String, selection: String) -> Draft? {
        guard let block = block(selection) else { return nil }
        let quoted = block + "\n\n"
        let text: String
        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            text = quoted
        } else {
            text = trimmingTrailingWhitespace(draft) + "\n\n" + quoted
        }
        return Draft(text: text, caret: (text as NSString).length)
    }

    /// True for a user-RIGHT kind=message, and for a completed assistant one.
    /// File chips, tool lines, and cards are not quotable. Streaming LEFT is not.
    static func surfaceAllowed(
        kindMessage: Bool,
        fromUser: Bool,
        completed: Bool,
        fileChip: Bool
    ) -> Bool {
        if fileChip { return false }
        if !kindMessage { return false }
        if fromUser { return true }
        return completed
    }

    /// Selection the edit menu or the long-press menu should quote, if any.
    static func menuSelection() -> String? {
        quoteable(QuoteTextView.currentSelection())
    }

    private static func trimmingTrailingWhitespace(_ text: String) -> String {
        var end = text.endIndex
        while end > text.startIndex {
            let prev = text.index(before: end)
            if text[prev].isWhitespace || text[prev].isNewline {
                end = prev
            } else {
                break
            }
        }
        return String(text[..<end])
    }
}

/// Non-editable selectable message text. The system selection menu gains
/// Quote when the selection has text. Reduce Motion adds no animation.
struct QuoteSelectableText: UIViewRepresentable {
    var text: AttributedString
    var quoteEnabled: Bool = true
    var font: UIFont = .systemFont(ofSize: 14)
    var expandsHorizontally: Bool = false
    var onQuote: (String) -> Void
    var onLink: ((URL) -> Void)? = nil
    @Environment(\.quoteChordBlocked) private var quoteChordBlocked
    @Environment(\.quoteSourceId) private var quoteSourceId

    func makeCoordinator() -> Coordinator {
        Coordinator(onQuote: onQuote, onLink: onLink)
    }

    func makeUIView(context: Context) -> QuoteTextView {
        let view = QuoteTextView()
        view.backgroundColor = .clear
        view.isEditable = false
        view.isSelectable = true
        view.isScrollEnabled = false
        view.showsVerticalScrollIndicator = false
        view.showsHorizontalScrollIndicator = false
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.textContainer.lineBreakMode = .byCharWrapping
        view.dataDetectorTypes = []
        view.delegate = context.coordinator
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.required, for: .vertical)
        view.linkTextAttributes = [
            .foregroundColor: UIColor.tintColor,
            .underlineStyle: 0,
        ]
        return view
    }

    func updateUIView(_ uiView: QuoteTextView, context: Context) {
        context.coordinator.onQuote = onQuote
        context.coordinator.onLink = onLink
        uiView.quoteEnabled = quoteEnabled
        uiView.quoteChordBlocked = quoteChordBlocked
        uiView.quoteSourceId = quoteSourceId
        uiView.onQuoteKey = { context.coordinator.onQuote($0) }
        uiView.expandsHorizontally = expandsHorizontally
        uiView.baseFont = font
        let styled = Self.styled(text, font: font, expandsHorizontally: expandsHorizontally)
        if uiView.attributedText != styled {
            uiView.attributedText = styled
        }
        uiView.textContainer.lineBreakMode = expandsHorizontally ? .byClipping : .byCharWrapping
        uiView.textContainer.widthTracksTextView = !expandsHorizontally
        uiView.backgroundColor = .clear
        uiView.isScrollEnabled = false
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: QuoteTextView,
        context: Context
    ) -> CGSize? {
        let limit = proposal.width
        if expandsHorizontally || limit == nil || limit == .infinity {
            let fitted = uiView.sizeThatFits(
                CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
            )
            return CGSize(width: ceil(fitted.width), height: ceil(max(fitted.height, 1)))
        }
        let width = limit ?? 0
        uiView.bounds.size.width = width
        let fitted = uiView.sizeThatFits(
            CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        )
        return CGSize(width: width, height: ceil(max(fitted.height, 1)))
    }

    private static func styled(
        _ text: AttributedString,
        font: UIFont,
        expandsHorizontally: Bool
    ) -> NSAttributedString {
        let titles = linkTitles(text)
        let mutable = NSMutableAttributedString(attributedString: NSAttributedString(text))
        let full = NSRange(location: 0, length: mutable.length)
        if full.length > 0 {
            mutable.enumerateAttribute(.font, in: full) { value, range, _ in
                if value == nil {
                    mutable.addAttribute(.font, value: font, range: range)
                }
            }
            if mutable.attribute(.paragraphStyle, at: 0, effectiveRange: nil) == nil {
                let style = NSMutableParagraphStyle()
                style.lineBreakMode = expandsHorizontally ? .byClipping : .byCharWrapping
                mutable.addAttribute(.paragraphStyle, value: style, range: full)
            }
        }
        for (range, title) in titles where range.location >= 0 && range.location + range.length <= mutable.length {
            mutable.addAttribute(.snorlaxLinkTitle, value: title, range: range)
        }
        return mutable
    }

    /// Custom link titles do not survive the NSAttributedString bridge.
    /// Read them first, then write them back onto the text view's string.
    private static func linkTitles(_ text: AttributedString) -> [(NSRange, String)] {
        var spans: [(NSRange, String)] = []
        for run in text.runs {
            guard let title = run.snorlaxLinkTitle, !title.isEmpty else { continue }
            let range = utf16Range(run.range, in: text)
            if range.length > 0 { spans.append((range, title)) }
        }
        return spans
    }

    private static func utf16Range(
        _ range: Range<AttributedString.Index>,
        in source: AttributedString
    ) -> NSRange {
        let prefix = String(source.characters[source.startIndex..<range.lowerBound])
        let slice = String(source.characters[range])
        return NSRange(location: prefix.utf16.count, length: slice.utf16.count)
    }
}

final class QuoteTextView: UITextView {
    var quoteEnabled = true
    var expandsHorizontally = false
    var baseFont: UIFont = .systemFont(ofSize: 14)
    /// v1.26: hardware ⌘L / ⌃L. Nil while an overlay owns the keyboard.
    var onQuoteKey: ((String) -> Void)?
    var quoteChordBlocked = false
    /// v1.27: message this text belongs to, so a quote can jump back.
    var quoteSourceId = ""
    /// The first ⌘L of a hold quotes. Further repeats of that hold do not.
    var quoteHold = false
    static weak var active: QuoteTextView?

    static func currentSourceId() -> String? {
        guard let id = active?.quoteSourceId, !id.isEmpty else { return nil }
        return id
    }

    static func clearActiveSelection() {
        guard let view = active else { return }
        view.selectedTextRange = view.textRange(from: view.endOfDocument, to: view.endOfDocument)
    }

    override var keyCommands: [UIKeyCommand]? {
        let base = super.keyCommands
        guard !quoteChordBlocked, quoteEnabled, markedTextRange == nil else { return base }
        guard let range = selectedTextRange, !range.isEmpty,
              let raw = text(in: range),
              QuoteSelectionKey.selectionToQuote(inTextField: false, selection: raw) != nil
        else { return base }
        let command = UIKeyCommand(
            title: QuoteSelectionKey.action,
            action: #selector(quoteSelectionFromHardware),
            input: "l",
            modifierFlags: .command
        )
        let control = UIKeyCommand(
            title: QuoteSelectionKey.action,
            action: #selector(quoteSelectionFromHardware),
            input: "l",
            modifierFlags: .control
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control] + (base ?? [])
    }

    /// The first ⌘L of a hold quotes. Further repeats of that hold do not.
    @objc func quoteSelectionFromHardware() {
        if quoteChordBlocked || quoteHold { return }
        guard let range = selectedTextRange, !range.isEmpty,
              let raw = text(in: range),
              let quoted = QuoteSelectionKey.selectionToQuote(inTextField: false, selection: raw)
        else { return }
        guard QuoteSelectionKey.claimTurn() else { return }
        quoteHold = true
        onQuoteKey?(quoted)
        QuoteTextView.clearActiveSelection()
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardL { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "l"
        }) {
            quoteHold = false
        }
        super.pressesEnded(presses, with: event)
    }

    override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        quoteHold = false
        super.pressesCancelled(presses, with: event)
    }

    static func currentSelection() -> String {
        guard let view = active,
              let range = view.selectedTextRange,
              !range.isEmpty,
              let text = view.text(in: range)
        else { return "" }
        return text
    }

    override func becomeFirstResponder() -> Bool {
        QuoteTextView.active = self
        return super.becomeFirstResponder()
    }
}

extension QuoteSelectableText {
    final class Coordinator: NSObject, UITextViewDelegate {
        var onQuote: (String) -> Void
        var onLink: ((URL) -> Void)?

        init(onQuote: @escaping (String) -> Void, onLink: ((URL) -> Void)?) {
            self.onQuote = onQuote
            self.onLink = onLink
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            if let view = textView as? QuoteTextView {
                QuoteTextView.active = view
            }
        }

        func textView(
            _ textView: UITextView,
            editMenuForTextIn range: NSRange,
            suggestedActions: [UIMenuElement]
        ) -> UIMenu? {
            guard let view = textView as? QuoteTextView, view.quoteEnabled else { return nil }
            guard range.length > 0, let raw = textView.text, let swift = Range(range, in: raw) else {
                return nil
            }
            let selected = String(raw[swift])
            guard QuoteSelection.quoteable(selected) != nil else { return nil }
            let quote = UIAction(title: QuoteSelection.label) { [weak self] _ in
                self?.onQuote(selected)
            }
            return UIMenu(children: [quote] + suggestedActions)
        }

        func textView(
            _ textView: UITextView,
            primaryActionFor textItem: UITextItem,
            defaultAction: UIAction
        ) -> UIAction? {
            if case .link(let url) = textItem.content, let onLink {
                return UIAction { _ in onLink(url) }
            }
            return defaultAction
        }

        /// v1.35: long-press a link. The header/preview is the full
        /// destination. A tap still uses primaryActionFor above.
        /// Message bubbles pass onLink; other text keeps the system menu.
        func textView(
            _ textView: UITextView,
            menuConfigurationFor textItem: UITextItem,
            defaultMenu: UIMenu
        ) -> UITextItem.MenuConfiguration? {
            guard let onLink else { return nil }
            guard case .link(let url) = textItem.content else { return nil }
            if MarkdownFootnote.isMarker(url) {
                let show = UIAction(title: MarkdownFootnote.showLabel) { [weak self] _ in
                    self?.onLink?(url)
                }
                return UITextItem.MenuConfiguration(menu: UIMenu(children: [show]))
            }
            guard WebLinks.allows(url) else { return nil }
            MarkdownLinkTitle.previewHint = MarkdownLinkTitle.hint(in: textView, at: textItem)
            return LinkPreview.configuration(for: url, open: onLink)
        }
    }
}
