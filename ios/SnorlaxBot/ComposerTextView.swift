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
    var onReturnSend: (() -> Void)? = nil
    var onPasteAttachments: (([ComposerPasteboard.Attachment]) -> Void)? = nil
    var onCaretChange: ((NSRange) -> Void)? = nil
    /// Hardware Esc: Stop while generating (v0.53), Jump when frozen (v0.60).
    /// v0.62: Jump then returns focus to the composer (hardware keyboard).
    /// v0.68: an armed recall consumes Esc first (restore empty) when idle.
    /// `composing` is IME marked text.
    var onEscapeStop: ((Bool) -> Void)? = nil
    /// v0.68: hardware Up-arrow recalls the latest user message when empty.
    var onArrowUpRecall: (() -> Void)? = nil
    /// v0.92: Option+Up / Option+Down opens the previous or next visible chat.
    /// The chat view ignores this while find is open. IME is filtered here.
    var onChatNav: ((Int) -> Void)? = nil
    /// v1.00: ⌘⇧C / ⌃⇧C copies the last assistant reply. Does not send.
    var onCopyLastReply: (() -> Void)? = nil
    /// v1.04: ⌘N / ⌃N starts a new chat. Does not insert or send.
    /// IME marked text keeps the key.
    var onNewChat: (() -> Void)? = nil
    /// v0.87: empty composer + Delete removes the last pending chip.
    /// Hardware Delete and the on-screen keyboard both call `deleteBackward`.
    /// Returns true when a chip was removed.
    var onBackspaceRemoveChip: (() -> Bool)? = nil
    /// v0.55: hardware Return does not send while an assistant turn is in flight.
    var sendMuted: Bool = false
    /// v0.84: grown height, already capped. The parent applies it with no animation.
    var onHeight: ((CGFloat) -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> ComposerUITextView {
        let view = ComposerUITextView()
        view.delegate = context.coordinator
        view.onReturnSend = { [coordinator = context.coordinator] in
            coordinator.parent.onReturnSend?()
        }
        view.onPasteAttachments = { [coordinator = context.coordinator] files in
            coordinator.parent.onPasteAttachments?(files)
        }
        view.onEscapeStop = { [coordinator = context.coordinator] composing in
            coordinator.parent.onEscapeStop?(composing)
        }
        view.onArrowUpRecall = { [coordinator = context.coordinator] in
            coordinator.parent.onArrowUpRecall?()
        }
        view.onChatNav = { [coordinator = context.coordinator] direction in
            coordinator.parent.onChatNav?(direction)
        }
        view.onCopyLastReply = { [coordinator = context.coordinator] in
            coordinator.parent.onCopyLastReply?()
        }
        view.onNewChat = { [coordinator = context.coordinator] in
            coordinator.parent.onNewChat?()
        }
        view.onBackspaceRemoveChip = { [coordinator = context.coordinator] in
            coordinator.parent.onBackspaceRemoveChip?() ?? false
        }
        view.onGrowHeight = { [coordinator = context.coordinator] next in
            let send = coordinator.parent.onHeight
            DispatchQueue.main.async { send?(next) }
        }
        view.sendMuted = sendMuted
        view.font = .systemFont(ofSize: 14)
        view.backgroundColor = .clear
        view.textContainerInset = UIEdgeInsets(top: 4, left: 0, bottom: 4, right: 0)
        view.textContainer.lineFragmentPadding = 0
        view.textContainer.widthTracksTextView = true
        view.textContainer.lineBreakMode = .byWordWrapping
        view.isScrollEnabled = false
        view.adjustsFontForContentSizeCategory = true
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: ComposerUITextView, context: Context) {
        context.coordinator.parent = self
        view.onReturnSend = { [coordinator = context.coordinator] in
            coordinator.parent.onReturnSend?()
        }
        view.onPasteAttachments = { [coordinator = context.coordinator] files in
            coordinator.parent.onPasteAttachments?(files)
        }
        view.onEscapeStop = { [coordinator = context.coordinator] composing in
            coordinator.parent.onEscapeStop?(composing)
        }
        view.onArrowUpRecall = { [coordinator = context.coordinator] in
            coordinator.parent.onArrowUpRecall?()
        }
        view.onChatNav = { [coordinator = context.coordinator] direction in
            coordinator.parent.onChatNav?(direction)
        }
        view.onCopyLastReply = { [coordinator = context.coordinator] in
            coordinator.parent.onCopyLastReply?()
        }
        view.onNewChat = { [coordinator = context.coordinator] in
            coordinator.parent.onNewChat?()
        }
        view.onBackspaceRemoveChip = { [coordinator = context.coordinator] in
            coordinator.parent.onBackspaceRemoveChip?() ?? false
        }
        view.onGrowHeight = { [coordinator = context.coordinator] next in
            let send = coordinator.parent.onHeight
            DispatchQueue.main.async { send?(next) }
        }
        view.sendMuted = sendMuted
        view.isEditable = !disabled
        view.isUserInteractionEnabled = !disabled
        let textChanged = view.text != text
        if textChanged {
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
        view.applyGrow(text: text)
        if textChanged, view.isScrollEnabled {
            view.scrollRangeToVisible(view.selectedRange)
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

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: ComposerUITextView,
        context: Context
    ) -> CGSize? {
        let width = proposal.width ?? uiView.bounds.width
        let font = uiView.font ?? .systemFont(ofSize: 14)
        let content = ComposerGrow.contentHeight(
            text: text,
            width: width,
            font: font,
            inset: uiView.textContainerInset,
            lineFragmentPadding: uiView.textContainer.lineFragmentPadding
        )
        let resting = ComposerGrow.restingHeight(font: font, inset: uiView.textContainerInset)
        let fitted = ComposerGrow.frame(
            contentHeight: content,
            empty: text.isEmpty,
            restingHeight: resting
        )
        return CGSize(width: max(width, 0), height: fitted.height)
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
            parent.onCaretChange?(textView.selectedRange)
            guard let view = textView as? ComposerUITextView else { return }
            view.applyGrow(text: parent.text)
            if view.isScrollEnabled {
                view.scrollRangeToVisible(view.selectedRange)
            }
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            parent.onCaretChange?(textView.selectedRange)
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            parent.focused.wrappedValue = true
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            parent.focused.wrappedValue = false
        }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            // IME: ignore Enter/return while marked text is composing.
            if textView.markedTextRange != nil {
                return true
            }
            return true
        }
    }
}

/// Hardware Return sends after composition commits. Shift+Return stays newline.
/// Software Return still inserts a newline (send button unchanged).
final class ComposerUITextView: UITextView {
    var onReturnSend: (() -> Void)?
    var onPasteAttachments: (([ComposerPasteboard.Attachment]) -> Void)?
    var onEscapeStop: ((Bool) -> Void)?
    var onArrowUpRecall: (() -> Void)?
    var onChatNav: ((Int) -> Void)?
    var onCopyLastReply: (() -> Void)?
    var onNewChat: (() -> Void)?
    var onBackspaceRemoveChip: (() -> Bool)?
    var sendMuted = false
    /// Hardware Delete with Shift/Alt/Cmd/Ctrl. Software Delete leaves this false.
    private var deleteModifierChord = false
    var onGrowHeight: ((CGFloat) -> Void)?
    private var grewWidth: CGFloat = -1
    private var reportedHeight: CGFloat = -1

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        guard abs(width - grewWidth) > 0.5 else { return }
        grewWidth = width
        applyGrow(text: text ?? "")
    }

    /// v0.84: turn internal scrolling on only once the text is past the cap.
    func applyGrow(text: String) {
        let width = bounds.width
        guard width > 1, let font else {
            isScrollEnabled = false
            return
        }
        let content = ComposerGrow.contentHeight(
            text: text,
            width: width,
            font: font,
            inset: textContainerInset,
            lineFragmentPadding: textContainer.lineFragmentPadding
        )
        let resting = ComposerGrow.restingHeight(font: font, inset: textContainerInset)
        let fitted = ComposerGrow.frame(
            contentHeight: content,
            empty: text.isEmpty,
            restingHeight: resting
        )
        if isScrollEnabled != fitted.scroll {
            isScrollEnabled = fitted.scroll
        }
        guard abs(reportedHeight - fitted.height) > 0.5 else { return }
        reportedHeight = fitted.height
        onGrowHeight?(fitted.height)
    }

    override var keyCommands: [UIKeyCommand]? {
        let escape = UIKeyCommand(
            title: StopGenerating.label,
            action: #selector(stopGeneratingFromEscape),
            input: UIKeyCommand.inputEscape,
            modifierFlags: []
        )
        escape.wantsPriorityOverSystemBehavior = true
        var commands = (super.keyCommands ?? []) + [escape]
        // Up-arrow moves the caret once the field has text. Recall only when empty.
        if text.isEmpty && markedTextRange == nil {
            let up = UIKeyCommand(
                title: RecallDraft.editAsNewMessage,
                action: #selector(recallFromArrowUp),
                input: UIKeyCommand.inputUpArrow,
                modifierFlags: []
            )
            up.wantsPriorityOverSystemBehavior = true
            commands.append(up)
        }
        // IME keeps Option+arrows and ⌘L while marked text is composing.
        if markedTextRange == nil {
            commands.append(contentsOf: chatNavCommands())
            commands.append(contentsOf: focusComposerCommands())
            commands.append(contentsOf: copyLastReplyCommands())
            commands.append(contentsOf: newChatCommands())
        }
        return commands
    }

    /// ⌘L / ⌃L while the composer is already first responder.
    /// Do not insert and do not send. The caret stays put.
    private func focusComposerCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: FocusComposer.action,
            action: #selector(focusComposerFromShortcut),
            input: "l",
            modifierFlags: .command
        )
        let control = UIKeyCommand(
            title: FocusComposer.action,
            action: #selector(focusComposerFromShortcut),
            input: "l",
            modifierFlags: .control
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧C / ⌃⇧C. Copies the last assistant reply. Does not insert or send.
    private func copyLastReplyCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: CopyLastReply.action,
            action: #selector(copyLastReplyFromShortcut),
            input: "c",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: CopyLastReply.action,
            action: #selector(copyLastReplyFromShortcut),
            input: "c",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘N / ⌃N. Starts a new chat. Does not insert or send.
    private func newChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: NewChat.action,
            action: #selector(newChatFromShortcut),
            input: "n",
            modifierFlags: .command
        )
        let control = UIKeyCommand(
            title: NewChat.action,
            action: #selector(newChatFromShortcut),
            input: "n",
            modifierFlags: .control
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// Option+Up / Option+Down. Plain Up stays the recall command above.
    private func chatNavCommands() -> [UIKeyCommand] {
        let up = UIKeyCommand(
            title: ChatNav.action,
            action: #selector(chatNavUp),
            input: UIKeyCommand.inputUpArrow,
            modifierFlags: .alternate
        )
        let down = UIKeyCommand(
            title: ChatNav.action,
            action: #selector(chatNavDown),
            input: UIKeyCommand.inputDownArrow,
            modifierFlags: .alternate
        )
        up.wantsPriorityOverSystemBehavior = true
        down.wantsPriorityOverSystemBehavior = true
        return [up, down]
    }

    @objc private func stopGeneratingFromEscape() {
        // IME: do not steal Esc while marked text is composing.
        let composing = markedTextRange != nil
        onEscapeStop?(composing)
    }

    @objc private func recallFromArrowUp() {
        if markedTextRange != nil || !text.isEmpty { return }
        onArrowUpRecall?()
    }

    @objc private func focusComposerFromShortcut() {
        if markedTextRange != nil { return }
    }

    @objc private func copyLastReplyFromShortcut() {
        if markedTextRange != nil { return }
        onCopyLastReply?()
    }

    @objc private func newChatFromShortcut() {
        if markedTextRange != nil { return }
        onNewChat?()
    }

    @objc private func chatNavUp() {
        performChatNav(-1)
    }

    @objc private func chatNavDown() {
        performChatNav(1)
    }

    /// IME marked text keeps the key. Find and other gates live in the chat view.
    private func performChatNav(_ direction: Int) {
        if markedTextRange != nil { return }
        onChatNav?(direction)
    }

    override func paste(_ sender: Any?) {
        let files = ComposerPasteboard.attachments(from: .general)
        if files.isEmpty {
            super.paste(sender)
            return
        }
        onPasteAttachments?(files)
        let text = ComposerPasteboard.plainText(from: .general, files: files)
        if !text.isEmpty {
            insertText(text)
        }
    }

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)), ComposerPasteboard.shouldIntercept(.general) {
            return true
        }
        return super.canPerformAction(action, withSender: sender)
    }

    /// v0.87: empty field removes the last chip. Text still deletes as usual.
    override func deleteBackward() {
        let chord = deleteModifierChord
        deleteModifierChord = false
        let current = text ?? ""
        if BackspaceChip.composerAllowsRemove(
            composerText: current,
            composing: markedTextRange != nil,
            chord: chord
        ), onBackspaceRemoveChip?() == true {
            return
        }
        super.deleteBackward()
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        super.pressesEnded(presses, with: event)
        // If deleteBackward already ran it cleared the flag. If a chorded
        // Delete never reached it, drop the flag on the next turn so a
        // later on-screen Delete is not treated as a chord.
        if deleteModifierChord {
            DispatchQueue.main.async { [weak self] in
                self?.deleteModifierChord = false
            }
        }
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            guard let key = press.key else { continue }
            if key.keyCode == .keyboardDeleteOrBackspace {
                let mods = key.modifierFlags
                deleteModifierChord = mods.contains(.command)
                    || mods.contains(.alternate)
                    || mods.contains(.control)
                    || mods.contains(.shift)
                continue
            }
            if key.keyCode == .keyboardUpArrow {
                let mods = key.modifierFlags
                let chord = mods.contains(.command)
                    || mods.contains(.alternate)
                    || mods.contains(.control)
                    || mods.contains(.shift)
                if markedTextRange != nil || !text.isEmpty || chord {
                    super.pressesBegan(presses, with: event)
                    return
                }
                onArrowUpRecall?()
                return
            }
            if key.keyCode == .keyboardReturn || key.keyCode == .keyboardReturnOrEnter {
                if markedTextRange != nil {
                    super.pressesBegan(presses, with: event)
                    return
                }
                if key.modifierFlags.contains(.shift) {
                    super.pressesBegan(presses, with: event)
                    return
                }
                if sendMuted {
                    super.pressesBegan(presses, with: event)
                    return
                }
                onReturnSend?()
                return
            }
        }
        super.pressesBegan(presses, with: event)
    }
}
