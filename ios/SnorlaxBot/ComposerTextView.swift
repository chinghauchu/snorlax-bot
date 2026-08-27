// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

/// UITextView composer so typeahead chips keep a stable caret after insert.
struct ComposerTextView: UIViewRepresentable {
    @Binding var text: String
    var chipNames: [String]
    var placeholder: String
    var disabled: Bool
    @Binding var pendingCaret: Int?
    var focused: FocusState<Bool>.Binding
    var onSubmit: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.delegate = context.coordinator
        view.font = .systemFont(ofSize: 14)
        view.backgroundColor = .clear
        view.textContainerInset = UIEdgeInsets(top: 4, left: 0, bottom: 4, right: 0)
        view.textContainer.lineFragmentPadding = 0
        view.isScrollEnabled = false
        view.adjustsFontForContentSizeCategory = true
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        view.isEditable = !disabled
        view.isUserInteractionEnabled = !disabled
        if view.text != text {
            let selected = view.selectedRange
            view.attributedText = Self.chipped(text, names: chipNames)
            view.typingAttributes = Self.plainAttributes
            if let caret = pendingCaret {
                let loc = min(max(caret, 0), (view.text as NSString).length)
                view.selectedRange = NSRange(location: loc, length: 0)
                DispatchQueue.main.async { pendingCaret = nil }
            } else {
                let loc = min(selected.location, (view.text as NSString).length)
                view.selectedRange = NSRange(location: loc, length: 0)
            }
        } else if let caret = pendingCaret {
            view.attributedText = Self.chipped(text, names: chipNames)
            view.typingAttributes = Self.plainAttributes
            let loc = min(max(caret, 0), (view.text as NSString).length)
            view.selectedRange = NSRange(location: loc, length: 0)
            DispatchQueue.main.async { pendingCaret = nil }
        }
        if focused.wrappedValue, !view.isFirstResponder, !disabled {
            view.becomeFirstResponder()
        } else if !focused.wrappedValue, view.isFirstResponder {
            view.resignFirstResponder()
        }
        context.coordinator.placeholderLabel.text = placeholder
        context.coordinator.placeholderLabel.isHidden = !text.isEmpty
        if context.coordinator.placeholderLabel.superview !== view {
            view.addSubview(context.coordinator.placeholderLabel)
            context.coordinator.placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                context.coordinator.placeholderLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                context.coordinator.placeholderLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 4),
            ])
        }
    }

    static var plainAttributes: [NSAttributedString.Key: Any] {
        [
            .font: UIFont.systemFont(ofSize: 14),
            .foregroundColor: UIColor.label,
        ]
    }

    static func chipped(_ text: String, names: [String]) -> NSAttributedString {
        let output = NSMutableAttributedString(string: text, attributes: plainAttributes)
        let lowered = Set(names.map { $0.lowercased() })
        guard let regex = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9._-]*)") else {
            return output
        }
        let ns = text as NSString
        let full = NSRange(location: 0, length: ns.length)
        regex.enumerateMatches(in: text, range: full) { match, _, _ in
            guard let match else { return }
            let token = ns.substring(with: match.range(at: 1)).lowercased()
            guard lowered.contains(token) else { return }
            output.addAttributes(
                [
                    .foregroundColor: UIColor.tintColor,
                    .backgroundColor: UIColor.tintColor.withAlphaComponent(0.18),
                ],
                range: match.range
            )
        }
        return output
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerTextView
        let placeholderLabel: UILabel = {
            let label = UILabel()
            label.font = .systemFont(ofSize: 14)
            label.textColor = .placeholderText
            return label
        }()

        init(_ parent: ComposerTextView) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text ?? ""
            placeholderLabel.isHidden = !parent.text.isEmpty
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            parent.focused.wrappedValue = true
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            parent.focused.wrappedValue = false
        }

        func textView(
            _ textView: UITextView,
            shouldChangeTextIn range: NSRange,
            replacementText text: String
        ) -> Bool {
            guard text == "\n" else { return true }
            if textView.markedTextRange != nil {
                return true
            }
            if parent.disabled { return false }
            parent.onSubmit()
            return false
        }
    }
}
