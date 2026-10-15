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
    /// v1.05: ⌘1–⌘9 / ⌃1–⌃9 opens that visible chat. 9 is the last.
    /// Does not insert or send. IME marked text keeps the key.
    var onJumpChat: ((Int) -> Void)? = nil
    /// v1.06: ⌘⇧A / ⌃⇧A archives the open chat. Does not insert or send.
    /// IME marked text keeps the key.
    var onArchiveOpenChat: (() -> Void)? = nil
    /// v1.07: ⌘⇧⌫ / ⌃⇧⌫ clears the composer draft. Does not send.
    /// IME marked text keeps the key.
    var onClearComposerDraft: (() -> Void)? = nil
    /// v1.08: ⌘⇧P / ⌃⇧P pins or unpins the open chat. Does not insert or send.
    /// IME marked text keeps the key. A key repeat does not flap the pin.
    var onPinOpenChat: (() -> Void)? = nil
    /// v1.09: ⌘⇧M / ⌃⇧M mutes or unmutes the open chat. Does not insert or send.
    /// IME marked text keeps the key. A key repeat does not flap Mute / Unmute.
    var onMuteOpenChat: (() -> Void)? = nil
    /// v1.11: ⌘⇧R / ⌃⇧R starts rename on the open chat. Does not insert or send.
    /// IME marked text keeps the key. A key repeat does not start another rename.
    var onRenameOpenChat: (() -> Void)? = nil
    /// v1.12: ⌘⇧D / ⌃⇧D asks to delete the open chat. Does not insert or send.
    /// IME marked text keeps the key. A key repeat does not ask again.
    var onDeleteOpenChat: (() -> Void)? = nil
    /// v1.13: ⌘⇧E / ⌃⇧E copies the open transcript. Does not insert or send.
    /// IME marked text keeps the key. A key repeat does not copy again.
    var onCopyTranscript: (() -> Void)? = nil
    /// v1.14: ⌘⇧G / ⌃⇧G collapses or expands every tool-trace group.
    /// Does not insert or send. IME marked text keeps the key.
    /// A key repeat does not flap.
    var onToggleToolTraces: (() -> Void)? = nil
    /// v1.15: ⌘⇧F / ⌃⇧F toggles All / Unread. Does not insert or send.
    /// IME marked text keeps the key. A key repeat does not flap.
    var onToggleChatListFilter: (() -> Void)? = nil
    /// True while the Delete confirm is on screen. Return and Delete confirm.
    /// Esc cancels. A key repeat never confirms.
    var deleteConfirmOpen: Bool = false
    var onConfirmDeleteKey: ((String) -> Void)? = nil
    var onCancelDelete: (() -> Void)? = nil
    /// v1.10: ⌘⇧U / ⌃⇧U marks the open chat unread, or read when it already
    /// shows the unread dot. Does not insert or send. IME marked text keeps
    /// the key. A key repeat does not flap the mark.
    var onMarkOpenChat: (() -> Void)? = nil
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
        view.onJumpChat = { [coordinator = context.coordinator] slot in
            coordinator.parent.onJumpChat?(slot)
        }
        view.onArchiveOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onArchiveOpenChat?()
        }
        view.onClearComposerDraft = { [coordinator = context.coordinator] in
            coordinator.parent.onClearComposerDraft?()
        }
        view.onPinOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onPinOpenChat?()
        }
        view.onMuteOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onMuteOpenChat?()
        }
        view.onMarkOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onMarkOpenChat?()
        }
        view.onRenameOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onRenameOpenChat?()
        }
        view.onDeleteOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onDeleteOpenChat?()
        }
        view.onCopyTranscript = { [coordinator = context.coordinator] in
            coordinator.parent.onCopyTranscript?()
        }
        view.onToggleToolTraces = { [coordinator = context.coordinator] in
            coordinator.parent.onToggleToolTraces?()
        }
        view.onToggleChatListFilter = { [coordinator = context.coordinator] in
            coordinator.parent.onToggleChatListFilter?()
        }
        view.onConfirmDeleteKey = { [coordinator = context.coordinator] key in
            coordinator.parent.onConfirmDeleteKey?(key)
        }
        view.onCancelDelete = { [coordinator = context.coordinator] in
            coordinator.parent.onCancelDelete?()
        }
        view.deleteConfirmOpen = deleteConfirmOpen
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
        view.onJumpChat = { [coordinator = context.coordinator] slot in
            coordinator.parent.onJumpChat?(slot)
        }
        view.onArchiveOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onArchiveOpenChat?()
        }
        view.onClearComposerDraft = { [coordinator = context.coordinator] in
            coordinator.parent.onClearComposerDraft?()
        }
        view.onPinOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onPinOpenChat?()
        }
        view.onMuteOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onMuteOpenChat?()
        }
        view.onMarkOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onMarkOpenChat?()
        }
        view.onRenameOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onRenameOpenChat?()
        }
        view.onDeleteOpenChat = { [coordinator = context.coordinator] in
            coordinator.parent.onDeleteOpenChat?()
        }
        view.onCopyTranscript = { [coordinator = context.coordinator] in
            coordinator.parent.onCopyTranscript?()
        }
        view.onToggleToolTraces = { [coordinator = context.coordinator] in
            coordinator.parent.onToggleToolTraces?()
        }
        view.onToggleChatListFilter = { [coordinator = context.coordinator] in
            coordinator.parent.onToggleChatListFilter?()
        }
        view.onConfirmDeleteKey = { [coordinator = context.coordinator] key in
            coordinator.parent.onConfirmDeleteKey?(key)
        }
        view.onCancelDelete = { [coordinator = context.coordinator] in
            coordinator.parent.onCancelDelete?()
        }
        view.deleteConfirmOpen = deleteConfirmOpen
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
    var onJumpChat: ((Int) -> Void)?
    var onArchiveOpenChat: (() -> Void)?
    var onClearComposerDraft: (() -> Void)?
    var onPinOpenChat: (() -> Void)?
    var onMuteOpenChat: (() -> Void)?
    var onMarkOpenChat: (() -> Void)?
    var onRenameOpenChat: (() -> Void)?
    var onDeleteOpenChat: (() -> Void)?
    var onCopyTranscript: (() -> Void)?
    var onToggleToolTraces: (() -> Void)?
    var onToggleChatListFilter: (() -> Void)?
    var deleteConfirmOpen = false
    var onConfirmDeleteKey: ((String) -> Void)?
    var onCancelDelete: (() -> Void)?
    private var heldConfirmKeys = Set<UIKeyboardHIDUsage>()
    var onBackspaceRemoveChip: (() -> Bool)?
    /// v1.08: the first ⌘⇧P of a hold toggles. Further repeats do not.
    private var pinOpenChatConsumed = false
    /// v1.09: the first ⌘⇧M of a hold toggles. Further repeats do not.
    private var muteOpenChatConsumed = false
    /// v1.11: the first ⌘⇧R of a hold starts rename. Further repeats do not.
    private var renameOpenChatConsumed = false
    /// v1.12: the first ⌘⇧D of a hold asks. Further repeats do not.
    private var deleteOpenChatConsumed = false
    /// v1.13: the first ⌘⇧E of a hold copies. Further repeats do not.
    private var copyTranscriptConsumed = false
    /// v1.14: the first ⌘⇧G of a hold toggled. Repeats of that hold do not.
    private var toolTraceGroupsConsumed = false
    /// v1.15: the first ⌘⇧F of a hold toggled. Repeats of that hold do not.
    private var chatListFilterConsumed = false
    /// v1.10: the first ⌘⇧U of a hold applies. Further repeats do not.
    private var markOpenChatConsumed = false
    var sendMuted = false
    /// Hardware Delete with Shift/Alt/Cmd/Ctrl. Software Delete leaves this false.
    private var deleteModifierChord = false
    /// v1.07: the Delete that is currently down, so ⌘⇧⌫ can clear the draft
    /// instead of deleting one character if the key command does not consume it.
    private var backspaceCommand = false
    private var backspaceControl = false
    private var backspaceOption = false
    private var backspaceShift = false
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
            commands.append(contentsOf: jumpChatCommands())
            commands.append(contentsOf: archiveOpenChatCommands())
            commands.append(contentsOf: clearComposerDraftCommands())
            commands.append(contentsOf: pinOpenChatCommands())
            commands.append(contentsOf: muteOpenChatCommands())
            commands.append(contentsOf: markOpenChatCommands())
            commands.append(contentsOf: renameOpenChatCommands())
            commands.append(contentsOf: deleteOpenChatCommands())
            commands.append(contentsOf: copyTranscriptCommands())
            commands.append(contentsOf: toolTraceGroupCommands())
            commands.append(contentsOf: chatListFilterCommands())
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

    /// ⌘1–⌘9 / ⌃1–⌃9. Opens that chat. Does not insert or send.
    /// 9 is the last visible chat. IME keeps the key.
    private func jumpChatCommands() -> [UIKeyCommand] {
        var commands: [UIKeyCommand] = []
        for digit in ["1", "2", "3", "4", "5", "6", "7", "8", "9"] {
            let command = UIKeyCommand(
                title: ChatJump.action,
                action: #selector(jumpChatFromShortcut(_:)),
                input: digit,
                modifierFlags: .command
            )
            let control = UIKeyCommand(
                title: ChatJump.action,
                action: #selector(jumpChatFromShortcut(_:)),
                input: digit,
                modifierFlags: .control
            )
            command.wantsPriorityOverSystemBehavior = true
            control.wantsPriorityOverSystemBehavior = true
            commands.append(command)
            commands.append(control)
        }
        return commands
    }

    /// ⌘⇧A / ⌃⇧A. Archives the open chat. Does not insert or send.
    /// IME keeps the key. An empty chat is ignored by the chat view.
    private func archiveOpenChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: ArchiveOpenChat.action,
            action: #selector(archiveOpenChatFromShortcut),
            input: "a",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: ArchiveOpenChat.action,
            action: #selector(archiveOpenChatFromShortcut),
            input: "a",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧P / ⌃⇧P. Pins or unpins the open chat. Does not insert or send.
    /// IME keeps the key. A repeat of the held chord does not flap.
    private func pinOpenChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: PinOpenChat.action,
            action: #selector(pinOpenChatFromShortcut),
            input: "p",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: PinOpenChat.action,
            action: #selector(pinOpenChatFromShortcut),
            input: "p",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧M / ⌃⇧M. Mutes or unmutes the open chat. Does not insert or send.
    /// IME keeps the key. A repeat of the held chord does not flap.
    private func muteOpenChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: MuteOpenChat.action,
            action: #selector(muteOpenChatFromShortcut),
            input: "m",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: MuteOpenChat.action,
            action: #selector(muteOpenChatFromShortcut),
            input: "m",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧U / ⌃⇧U. Marks the open chat unread, or read when it already
    /// shows the unread dot. Does not insert or send. IME keeps the key.
    /// A repeat of the held chord does not flap.
    private func markOpenChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: MarkOpenChat.action,
            action: #selector(markOpenChatFromShortcut),
            input: "u",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: MarkOpenChat.action,
            action: #selector(markOpenChatFromShortcut),
            input: "u",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }


    /// ⌘⇧R / ⌃⇧R. Starts rename on the open chat. Does not insert or send.
    /// IME keeps the key. A repeat of the held chord does not start another.
    private func renameOpenChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: RenameOpenChat.action,
            action: #selector(renameOpenChatFromShortcut),
            input: "r",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: RenameOpenChat.action,
            action: #selector(renameOpenChatFromShortcut),
            input: "r",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧D / ⌃⇧D. Asks to delete the open chat. Does not insert or send.
    /// IME keeps the key. A repeat of the held chord does not ask again.
    private func deleteOpenChatCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: DeleteOpenChat.action,
            action: #selector(deleteOpenChatFromShortcut),
            input: "d",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: DeleteOpenChat.action,
            action: #selector(deleteOpenChatFromShortcut),
            input: "d",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧E / ⌃⇧E. Copies the open transcript. Does not insert or send.
    /// IME keeps the key. A repeat of the held chord does not copy again.
    private func copyTranscriptCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: CopyTranscript.action,
            action: #selector(copyTranscriptFromShortcut),
            input: "e",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: CopyTranscript.action,
            action: #selector(copyTranscriptFromShortcut),
            input: "e",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧G / ⌃⇧G. Collapses or expands every tool-trace group.
    /// Does not insert or send. IME keeps the key. A repeat does not flap.
    private func toolTraceGroupCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: ToolTraceGroups.action,
            action: #selector(toggleToolTracesFromShortcut),
            input: "g",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: ToolTraceGroups.action,
            action: #selector(toggleToolTracesFromShortcut),
            input: "g",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧F / ⌃⇧F. Toggles All / Unread. Does not insert or send.
    /// IME keeps the key. A repeat of the held chord does not flap.
    private func chatListFilterCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: ChatListFilterKey.action,
            action: #selector(toggleChatListFilterFromShortcut),
            input: "f",
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: ChatListFilterKey.action,
            action: #selector(toggleChatListFilterFromShortcut),
            input: "f",
            modifierFlags: [.control, .shift]
        )
        command.wantsPriorityOverSystemBehavior = true
        control.wantsPriorityOverSystemBehavior = true
        return [command, control]
    }

    /// ⌘⇧⌫ / ⌃⇧⌫. Clears the draft. Does not insert or send.
    /// IME keeps the key. An empty draft is ignored by the model.
    private func clearComposerDraftCommands() -> [UIKeyCommand] {
        let command = UIKeyCommand(
            title: ClearComposerDraft.action,
            action: #selector(clearComposerDraftFromShortcut),
            input: UIKeyCommand.inputDelete,
            modifierFlags: [.command, .shift]
        )
        let control = UIKeyCommand(
            title: ClearComposerDraft.action,
            action: #selector(clearComposerDraftFromShortcut),
            input: UIKeyCommand.inputDelete,
            modifierFlags: [.control, .shift]
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
        if deleteConfirmOpen {
            onCancelDelete?()
            return
        }
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

    @objc private func jumpChatFromShortcut(_ sender: UIKeyCommand) {
        if markedTextRange != nil { return }
        guard let raw = sender.input, let slot = Int(raw), (1...9).contains(slot) else { return }
        onJumpChat?(slot)
    }

    @objc private func archiveOpenChatFromShortcut() {
        if markedTextRange != nil { return }
        onArchiveOpenChat?()
    }

    @objc private func clearComposerDraftFromShortcut() {
        if markedTextRange != nil { return }
        onClearComposerDraft?()
    }

    /// The first press toggles. A repeat of this hold returns without
    /// toggling again, so Pin / Unpin does not flap and p is not inserted.
    @objc private func pinOpenChatFromShortcut() {
        if markedTextRange != nil { return }
        if pinOpenChatConsumed { return }
        pinOpenChatConsumed = true
        onPinOpenChat?()
    }

    /// The first press toggles. A repeat of this hold returns without
    /// toggling again, so Mute / Unmute does not flap and m is not inserted.
    @objc private func muteOpenChatFromShortcut() {
        if markedTextRange != nil { return }
        if muteOpenChatConsumed { return }
        muteOpenChatConsumed = true
        onMuteOpenChat?()
    }

    /// The first press applies the sidebar mark. A repeat of this hold
    /// returns without applying again, so the mark does not flap and u
    /// is not inserted.
    @objc private func markOpenChatFromShortcut() {
        if markedTextRange != nil { return }
        if markOpenChatConsumed { return }
        markOpenChatConsumed = true
        onMarkOpenChat?()
    }


    /// The first press starts rename. A repeat of this hold returns
    /// without starting another, so the field does not flap and r is
    /// not inserted.
    @objc private func renameOpenChatFromShortcut() {
        if markedTextRange != nil { return }
        if renameOpenChatConsumed { return }
        renameOpenChatConsumed = true
        onRenameOpenChat?()
    }

    /// The first press asks. A repeat of this hold returns without
    /// asking again, so d is not inserted and the confirm is not accepted.
    @objc private func deleteOpenChatFromShortcut() {
        if markedTextRange != nil { return }
        if deleteOpenChatConsumed { return }
        deleteOpenChatConsumed = true
        onDeleteOpenChat?()
    }

    /// The first press copies. A repeat of this hold returns without
    /// copying again, so e is not inserted.
    @objc private func copyTranscriptFromShortcut() {
        if markedTextRange != nil { return }
        if copyTranscriptConsumed { return }
        copyTranscriptConsumed = true
        onCopyTranscript?()
    }

    /// The first press toggles. A repeat of this hold returns without
    /// toggling again, so g is not inserted and the groups do not flap.
    @objc private func toggleToolTracesFromShortcut() {
        if markedTextRange != nil { return }
        if toolTraceGroupsConsumed { return }
        toolTraceGroupsConsumed = true
        onToggleToolTraces?()
    }

    /// The first press toggles. A repeat of this hold returns without
    /// toggling again, so f is not inserted and All / Unread does not flap.
    @objc private func toggleChatListFilterFromShortcut() {
        if markedTextRange != nil { return }
        if chatListFilterConsumed { return }
        chatListFilterConsumed = true
        onToggleChatListFilter?()
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

    /// Enter or Delete confirms while the dialog is up. A repeat is swallowed
    /// and does not confirm. After confirm, the key stays swallowed until
    /// release so the next chat does not send or delete a character.
    private func confirmKind(_ code: UIKeyboardHIDUsage) -> String? {
        switch code {
        case .keyboardReturn, .keyboardReturnOrEnter:
            return "return"
        case .keyboardDeleteOrBackspace, .keyboardDeleteForward:
            return "delete"
        default:
            return nil
        }
    }

    private func handleDeleteConfirm(_ key: UIKey) -> Bool {
        let code = key.keyCode
        let modified = key.modifierFlags.contains(.command)
            || key.modifierFlags.contains(.control)
            || key.modifierFlags.contains(.alternate)
            || key.modifierFlags.contains(.shift)
        if code == .keyboardEscape {
            guard deleteConfirmOpen, !modified else { return false }
            onCancelDelete?()
            return true
        }
        guard let kind = confirmKind(code), !modified else { return false }
        if DeleteOpenChat.confirmKeyBlocked(kind) {
            heldConfirmKeys.insert(code)
            return true
        }
        guard deleteConfirmOpen else { return false }
        let repeatPress = heldConfirmKeys.contains(code)
        if !repeatPress {
            heldConfirmKeys.insert(code)
        }
        if repeatPress {
            return true
        }
        onConfirmDeleteKey?(kind)
        return true
    }

    private func releaseConfirmKey(_ code: UIKeyboardHIDUsage) {
        heldConfirmKeys.remove(code)
        if let kind = confirmKind(code) {
            DeleteOpenChat.releaseConfirmKey(kind)
        }
    }

    /// v0.87: empty field removes the last chip. Text still deletes as usual.
    /// v1.07: ⌘⇧⌫ / ⌃⇧⌫ clears the whole draft and does not delete one character.
    override func deleteBackward() {
        if deleteConfirmOpen || DeleteOpenChat.confirmKeyBlocked("delete") {
            return
        }
        let command = backspaceCommand
        let control = backspaceControl
        let option = backspaceOption
        let shift = backspaceShift
        let chord = deleteModifierChord
        deleteModifierChord = false
        backspaceCommand = false
        backspaceControl = false
        backspaceOption = false
        backspaceShift = false
        if markedTextRange == nil,
           ClearComposerDraft.isChord(
               command: command,
               control: control,
               option: option,
               shift: shift,
               delete: true
           ) {
            onClearComposerDraft?()
            return
        }
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
        for press in presses {
            if let code = press.key?.keyCode {
                releaseConfirmKey(code)
            }
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardP { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "p"
        }) {
            pinOpenChatConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardM { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "m"
        }) {
            muteOpenChatConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardU { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "u"
        }) {
            markOpenChatConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardR { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "r"
        }) {
            renameOpenChatConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardD { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "d"
        }) {
            deleteOpenChatConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardE { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "e"
        }) {
            copyTranscriptConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardG { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "g"
        }) {
            toolTraceGroupsConsumed = false
        }
        if presses.contains(where: { press in
            if press.key?.keyCode == .keyboardF { return true }
            return press.key?.charactersIgnoringModifiers.lowercased() == "f"
        }) {
            chatListFilterConsumed = false
        }
        super.pressesEnded(presses, with: event)
        // If deleteBackward already ran it cleared the flag. If a chorded
        // Delete never reached it, drop the flag on the next turn so a
        // later on-screen Delete is not treated as a chord.
        if deleteModifierChord || backspaceCommand || backspaceControl || backspaceOption || backspaceShift {
            DispatchQueue.main.async { [weak self] in
                self?.deleteModifierChord = false
                self?.backspaceCommand = false
                self?.backspaceControl = false
                self?.backspaceOption = false
                self?.backspaceShift = false
            }
        }
    }

    override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            if let code = press.key?.keyCode {
                releaseConfirmKey(code)
            }
        }
        heldConfirmKeys.removeAll()
        pinOpenChatConsumed = false
        muteOpenChatConsumed = false
        markOpenChatConsumed = false
        renameOpenChatConsumed = false
        deleteOpenChatConsumed = false
        copyTranscriptConsumed = false
        toolTraceGroupsConsumed = false
        chatListFilterConsumed = false
        super.pressesCancelled(presses, with: event)
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            guard let key = press.key else { continue }
            if handleDeleteConfirm(key) {
                return
            }
            if key.keyCode == .keyboardP {
                let mods = key.modifierFlags
                if PinOpenChat.isChord(
                    key: "p",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), pinOpenChatConsumed {
                    // Held ⌘⇧P. Do not insert p and do not toggle again.
                    return
                }
            }
            if key.keyCode == .keyboardM {
                let mods = key.modifierFlags
                if MuteOpenChat.isChord(
                    key: "m",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), muteOpenChatConsumed {
                    // Held ⌘⇧M. Do not insert m and do not toggle again.
                    return
                }
            }
            if key.keyCode == .keyboardU {
                let mods = key.modifierFlags
                if MarkOpenChat.isChord(
                    key: "u",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), markOpenChatConsumed {
                    // Held ⌘⇧U. Do not insert u and do not apply again.
                    return
                }
            }
            if key.keyCode == .keyboardR {
                let mods = key.modifierFlags
                if RenameOpenChat.isChord(
                    key: "r",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), renameOpenChatConsumed {
                    // Held ⌘⇧R. Do not insert r and do not start another rename.
                    return
                }
            }
            if key.keyCode == .keyboardD {
                let mods = key.modifierFlags
                if DeleteOpenChat.isChord(
                    key: "d",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), deleteOpenChatConsumed {
                    // Held ⌘⇧D. Do not insert d and do not delete again.
                    return
                }
            }
            if key.keyCode == .keyboardE {
                let mods = key.modifierFlags
                if CopyTranscript.isChord(
                    key: "e",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), copyTranscriptConsumed {
                    // Held ⌘⇧E. Do not insert e and do not copy again.
                    return
                }
            }
            if key.keyCode == .keyboardG {
                let mods = key.modifierFlags
                if ToolTraceGroups.isChord(
                    key: "g",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), toolTraceGroupsConsumed {
                    // Held ⌘⇧G. Do not insert g and do not flap the groups.
                    return
                }
            }
            if key.keyCode == .keyboardF {
                let mods = key.modifierFlags
                if ChatListFilterKey.isChord(
                    key: "f",
                    characters: key.charactersIgnoringModifiers,
                    command: mods.contains(.command),
                    control: mods.contains(.control),
                    option: mods.contains(.alternate),
                    shift: mods.contains(.shift)
                ), chatListFilterConsumed {
                    // Held ⌘⇧F. Do not insert f and do not flap All / Unread.
                    return
                }
            }
            if key.keyCode == .keyboardDeleteOrBackspace {
                let mods = key.modifierFlags
                backspaceCommand = mods.contains(.command)
                backspaceControl = mods.contains(.control)
                backspaceOption = mods.contains(.alternate)
                backspaceShift = mods.contains(.shift)
                deleteModifierChord = backspaceCommand
                    || backspaceOption
                    || backspaceControl
                    || backspaceShift
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
