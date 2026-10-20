// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UIKit

struct ChatView: View {
    let agentID: String
    @Environment(AppModel.self) private var model
    @FocusState private var composerFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stick = StickToBottom.State.armed
    @State private var lastAssistantSig = ""
    @State private var expandedToolStacks: Set<String> = []
    @State private var jumpPaint = StickToBottom.JumpChipPaint.hidden
    @State private var jumpPaintGeneration = 0
    @State private var copiedReplyId: String?
    @State private var copiedReplyPulse = 0
    @State private var findOpen = false
    @State private var findQuery = ""
    @State private var findIndex = 0
    @State private var shortcutsOpen = false
    @State private var lightbox: ImageLightbox.Target?
    @State private var lightboxFrame: ImageLightbox.Target?
    @State private var lightboxPaint = ImageLightbox.Paint.hidden
    @State private var lightboxGeneration = 0
    @FocusState private var lightboxCloseFocused: Bool
    @State private var readingOffsetY: CGFloat = 0
    @State private var readingNearBottom = true
    @State private var readingFrames: [ReadingPlace.Frame] = []
    /// v1.30: fraction still to apply once the anchor row is measured.
    @State private var readingOffsetPendingID: String?
    @State private var readingOffsetPendingFraction: CGFloat = 0
    @State private var readingOffsetPendingToken = 0
    /// Holds publish until scroll geometry catches the restored offset.
    @State private var readingRestoreCommandedY: CGFloat?
    @FocusState private var findFieldFocused: Bool
    /// v1.03: programmatic transcript offset. Geometry lags a key repeat.
    @State private var transcriptPosition = ScrollPosition()
    @State private var scrollBox = TranscriptScroll.Box.zero
    @State private var commandedY: CGFloat?
    @State private var previousGeometryY: CGFloat = 0
    @State private var keyboardJumpToken = 0
    /// v1.12: chord opens the sidebar Delete confirm. Nil until then.
    @State private var pendingDeleteChatID: String?
    /// v1.13: muted Copied beside the chat name after ⌘⇧E. Same 1.2s as Copy.
    @State private var transcriptCopied = false
    @State private var transcriptCopiedPulse = 0
    /// v1.25: the sent message a keyboard jump just landed on.
    @State private var userJumpHighlightID: String?
    @State private var quoteJumpUnmeasuredID: String?
    @State private var quoteJumpToken = 0
    @State private var userJumpPulse = 0
    @State private var userJumpUnmeasuredID: String?
    @State private var userJumpToken = 0

    private var agent: Agent {
        model.visibleAgents.first(where: { $0.id == agentID })
            ?? (model.isConfigured ? .chrome : .placeholderChannel)
    }

    private var hasRealAgent: Bool { !agent.id.isEmpty }

    /// v0.95: the chat chrome uses the local display name. Transcript
    /// speakers stay on the server name.
    private var chatTitle: String {
        model.chatDisplayName(for: agent)
    }

    var body: some View {
        @Bindable var model = model
        let hits = loadedFindHits
        let safeFindIndex = hits.isEmpty ? -1 : min(max(findIndex, 0), hits.count - 1)
        let activeHit = safeFindIndex >= 0 ? hits[safeFindIndex] : nil
        VStack(spacing: 0) {
            if findOpen {
                findBar(index: safeFindIndex, total: hits.count)
            }
            transcript
            Divider()
            ComposerBar(
                agentName: chatTitle,
                isChannel: agent.isChannel,
                focused: $composerFocused,
                showJump: stick.showJump,
                onCopyLastReply: { copyLastAssistantReply() },
                onNewChat: { newChatFromComposer() },
                onJumpChat: { slot in jumpChatFromComposer(slot) },
                onArchiveOpenChat: { archiveOpenChatFromComposer() },
                onUnarchiveOpenChat: { unarchiveOpenChatFromComposer() },
                onChatHistory: { direction in chatHistoryFromComposer(direction) },
                onTranscriptText: { step in transcriptTextFromComposer(step) },
                onUserMessageJump: { direction in userMessageJumpFromComposer(direction) },
                onQuoteJump: { quoteJumpFromComposer() },
                onClearComposerDraft: { clearComposerDraftFromComposer() },
                onPinOpenChat: { pinOpenChatFromComposer() },
                onMuteOpenChat: { muteOpenChatFromComposer() },
                onMarkOpenChat: { markOpenChatFromComposer() },
                onRenameOpenChat: { renameOpenChatFromComposer() },
                onDeleteOpenChat: { deleteOpenChatFromComposer() },
                onCopyTranscript: { copyTranscriptFromComposer() },
                onToggleToolTraces: { toggleToolTracesFromComposer() },
                onToggleChatListFilter: { toggleChatListFilterFromComposer() },
                onToggleArchiveList: { toggleArchiveListFromComposer() },
                onNextUnread: { nextUnreadFromComposer() },
                onPreviousUnread: { previousUnreadFromComposer() },
                onRegenerateLastReply: { regenerateLastReplyFromComposer() },
                onFocusSidebarList: { focusSidebarFromComposer() },
                onMarkAllRead: { markAllReadFromComposer() },
                deleteConfirmOpen: pendingDeleteChatID != nil,
                onConfirmDeleteKey: { key in confirmDeleteOpenChat(key: key) },
                onCancelDelete: { cancelDeleteOpenChat() },
                onEscapeFind: {
                    guard findOpen else { return false }
                    closeFind()
                    return true
                }
            )
        }
        .environment(
            \.chatFind,
            ChatFindSession(
                query: findOpen ? findQuery : "",
                activeRowId: activeHit?.rowId ?? "",
                activeStart: activeHit?.start ?? -1,
                activeEnd: activeHit?.end ?? -1
            )
        )
        .environment(\.transcriptTextPercent, model.transcriptTextPercent)
        .environment(\.quoteChordBlocked, quoteChordBlocked)
        .onKeyPress(phases: [.down, .up, .`repeat`]) { press in
            if deleteConfirmKey(press) == .handled {
                return .handled
            }
            if press.phase != .down && !press.phase.contains(.`repeat`) {
                return .ignored
            }
            if jumpChatKey(press) == .handled {
                return .handled
            }
            if newChatKey(press) == .handled {
                return .handled
            }
            if archiveOpenChatKey(press) == .handled {
                return .handled
            }
            if unarchiveOpenChatKey(press) == .handled {
                return .handled
            }
            if chatHistoryKey(press) == .handled {
                return .handled
            }
            if transcriptTextKey(press) == .handled {
                return .handled
            }
            if clearComposerDraftKey(press) == .handled {
                return .handled
            }
            if pinOpenChatKey(press) == .handled {
                return .handled
            }
            if muteOpenChatKey(press) == .handled {
                return .handled
            }
            if markOpenChatKey(press) == .handled {
                return .handled
            }
            if renameOpenChatKey(press) == .handled {
                return .handled
            }
            if deleteOpenChatKey(press) == .handled {
                return .handled
            }
            if copyTranscriptKey(press) == .handled {
                return .handled
            }
            if toolTraceGroupsKey(press) == .handled {
                return .handled
            }
            if chatListFilterKey(press) == .handled {
                return .handled
            }
            if archiveListKey(press) == .handled {
                return .handled
            }
            if nextUnreadKey(press) == .handled {
                return .handled
            }
            if previousUnreadKey(press) == .handled {
                return .handled
            }
            if regenerateLastReplyKey(press) == .handled {
                return .handled
            }
            if focusSidebarKey(press) == .handled {
                return .handled
            }
            if markAllReadKey(press) == .handled {
                return .handled
            }
            if chatNavKey(press) == .handled {
                return .handled
            }
            if userMessageJumpKey(press) == .handled {
                return .handled
            }
            if quoteJumpKey(press) == .handled {
                return .handled
            }
            if transcriptScrollKey(press) == .handled {
                return .handled
            }
            if copyLastReplyKey(press) == .handled {
                return .handled
            }
            return focusComposerKey(press)
        }
        .navigationTitle(chatTitle)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(model.threadID != nil && agent.isChannel)
        .toolbar {
            if model.threadID != nil, agent.isChannel {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Task { await model.closeThread() }
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .accessibilityLabel("Back to timeline")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    shortcutsOpen = true
                } label: {
                    Image(systemName: "questionmark.circle")
                }
                .accessibilityLabel(ChatShortcuts.title)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    if findOpen {
                        closeFind()
                    } else {
                        openFind()
                    }
                } label: {
                    Image(systemName: findOpen ? "magnifyingglass.circle.fill" : "magnifyingglass")
                }
                .accessibilityLabel(ChatFind.inputLabel)
                .keyboardShortcut("f", modifiers: .command)
            }
            ToolbarItem(placement: .principal) {
                if hasRealAgent {
                    Button {
                        model.showProfile = true
                    } label: {
                        HStack(spacing: 8) {
                            AgentAvatar(agent: agent, size: 24)
                            Text(chatTitle)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            if transcriptCopied {
                                Text(CopyTranscript.copiedLabel)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .accessibilityLabel(chatTitle)
                    .accessibilityHint("Opens info")
                } else {
                    Text(chatTitle)
                        .font(.system(size: 14, weight: .semibold))
                }
            }
        }
        .sheet(isPresented: $model.showProfile) {
            if hasRealAgent {
                ProfileSheet(agent: agent)
            }
        }
        .sheet(isPresented: $shortcutsOpen) {
            ChatShortcutsSheet()
        }
        .confirmationDialog(
            pendingDeleteAgent.map { row in
                DeleteOpenChat.confirmTitle(
                    name: model.chatDisplayName(for: row),
                    isChannel: row.isChannel
                )
            } ?? "",
            isPresented: deleteConfirmPresented,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                confirmDeleteOpenChat(key: nil)
            }
            .keyboardShortcut(.defaultAction)
            Button("Cancel", role: .cancel) {
                cancelDeleteOpenChat()
            }
            .keyboardShortcut(.cancelAction)
        }
        .overlay {
            if lightboxPaint.mounted, let frame = lightboxFrame {
                ImageLightboxOverlay(
                    target: frame,
                    shown: lightboxPaint.shown,
                    reduceMotion: reduceMotion,
                    closeFocused: $lightboxCloseFocused,
                    onClose: { closeLightbox() }
                )
            }
        }
        .task(id: agentID) {
            dismissLightboxImmediately()
            stick = StickToBottom.State.armed
            lastAssistantSig = ""
            expandedToolStacks = []
            transcriptCopied = false
            closeFind()
            guard hasRealAgent || !model.isConfigured else { return }
            if !(model.selectedAgentID == agentID && model.threadID != nil) {
                await model.select(agentID, push: false)
            }
            if model.canCompose {
                let keepList = model.sidebarKeyboardFocus
                    && UIDevice.current.userInterfaceIdiom == .pad
                if !keepList {
                    model.sidebarKeyboardFocus = false
                    composerFocused = true
                }
                model.wantsComposerFocus = false
            }
        }
            .onChange(of: model.threadID) { _, _ in
                dismissLightboxImmediately()
                expandedToolStacks = []
                closeFind()
            }
            .onChange(of: model.wantsComposerFocus) { _, wants in
            guard wants, model.canCompose || model.isSending else { return }
            model.sidebarKeyboardFocus = false
            composerFocused = true
            model.wantsComposerFocus = false
        }
        .onChange(of: model.sidebarFocusRequest) { _, _ in
            if model.sidebarKeyboardFocus {
                composerFocused = false
            }
        }
    }

    /// Hardware Page Up / Page Down and ⌘↑ / ⌘↓ when focus is not in a
    /// text field. The composer, find, lightbox, and shortcuts sheet
    /// keep those keys. ⌘↓ uses the same Jump path as the chip.
    private func transcriptScrollKey(_ press: KeyPress) -> KeyPress.Result {
        if composerFocused || findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if TranscriptScroll.textInputIsFirstResponder() { return .ignored }
        guard hasRealAgent else { return .ignored }
        guard let action = TranscriptScroll.action(
            key: transcriptScrollKeyName(press),
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        applyTranscriptScroll(action)
        return .handled
    }

    private func transcriptScrollKeyName(_ press: KeyPress) -> TranscriptScroll.Key {
        switch press.key {
        case .pageUp: return .pageUp
        case .pageDown: return .pageDown
        case .home: return .home
        case .end: return .end
        case .upArrow: return .up
        case .downArrow: return .down
        default: return .other
        }
    }

    /// Page and Home assign an instant offset. End re-arms stick the
    /// same way Jump to latest does, then the transcript snaps.
    private func applyTranscriptScroll(_ action: TranscriptScroll.Action) {
        if TranscriptScroll.prefersJumpToLatest(action) {
            claimTargetedScroll(.bottom)
            commandedY = nil
            stick = StickToBottom.onJumpToLatest()
            keyboardJumpToken += 1
            return
        }
        if action == .top {
            claimTargetedScroll(.top)
        }
        var box = scrollBox
        if let commandedY {
            box.offsetY = commandedY
        }
        let next = TranscriptScroll.offset(box: box, action: action)
        commandedY = next
        let near = TranscriptScroll.isNearBottom(offsetY: next, box: box)
        stick = StickToBottom.onUserScroll(state: stick, nearBottom: near)
        readingNearBottom = near
        let transaction = TranscriptScroll.transaction(reduceMotion: reduceMotion)
        withTransaction(transaction) {
            transcriptPosition.scrollTo(point: CGPoint(x: 0, y: next))
        }
    }

    /// Hardware ⌘1–⌘9 / ⌃1–⌃9 when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. ⌘9
    /// opens the last chat in the list order.
    private func jumpChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard let slot = ChatJump.slot(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if ChatJump.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        model.openChatAtJumpSlot(slot)
        return .handled
    }

    /// Composer ⌘1–⌘9. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    private func jumpChatFromComposer(_ slot: Int) {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.openChatAtJumpSlot(slot)
    }

    /// Hardware ⌘N / ⌃N when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and other text fields own the key.
    private func newChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard NewChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if NewChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        model.createAgentFromChord()
        return .handled
    }

    /// Composer ⌘N. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    private func newChatFromComposer() {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.createAgentFromChord()
    }

    /// Hardware ⌘⇧A / ⌃⇧A when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    private func archiveOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard ArchiveOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if ArchiveOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        model.archiveChat(agent.id)
        return .handled
    }

    /// Composer ⌘⇧A. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not archive.
    private func archiveOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.archiveChat(agent.id)
    }

    /// Hardware ⌘⇧B / ⌃⇧B when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A chat that is not archived is left as it is. A key repeat is
    /// swallowed so b is not inserted and Unarchive does not run again.
    private func unarchiveOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard UnarchiveOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if unarchiveOpenChatBlocked() { return .ignored }
        if UnarchiveOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if UnarchiveOpenChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        guard model.isChatArchived(agent.id) else { return .handled }
        model.unarchiveChat(agent.id)
        return .handled
    }

    /// Composer ⌘⇧B. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not unarchive. A chat that is not archived
    /// stays put. The text view swallows a key repeat.
    private func unarchiveOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if unarchiveOpenChatBlocked() { return }
        guard model.isChatArchived(agent.id) else { return }
        model.unarchiveChat(agent.id)
    }

    /// Hardware ⌘[ / ⌃[ and ⌘] / ⌃] when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and the shortcuts sheet
    /// own the key. A key repeat is swallowed so the bracket is not
    /// inserted and history does not step again. Either end is a no-op.
    /// An empty chat can still go back to the chat that was just closed.
    private func chatHistoryKey(_ press: KeyPress) -> KeyPress.Result {
        guard let direction = ChatOpenHistory.direction(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if chatHistoryBlocked() { return .ignored }
        if ChatOpenHistory.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if ChatOpenHistory.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        model.openChatFromHistory(direction)
        return .handled
    }

    /// Hardware ⌘= / ⌃= and ⌘+ grow the transcript text. ⌘- shrinks it.
    /// ⌘0 resets it. The text view handles the same chord and keeps IME
    /// marked text. Find, rename, search, a card text field, and the
    /// shortcuts sheet own the key. A key repeat is swallowed so the
    /// character is not inserted and the size does not step again.
    private func transcriptTextKey(_ press: KeyPress) -> KeyPress.Result {
        guard let step = TranscriptTextScale.step(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if transcriptTextBlocked() { return .ignored }
        if TranscriptTextScale.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if TranscriptTextScale.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        model.adjustTranscriptText(step)
        return .handled
    }

    /// Composer ⌘= / ⌘- / ⌘0 and the control variants. Mention and skill
    /// menus are checked by the bar. Find, the shortcuts sheet, and the
    /// lightbox keep the key. The text view swallows a key repeat.
    private func transcriptTextFromComposer(_ step: TranscriptTextScale.Step) {
        if transcriptTextBlocked() { return }
        model.adjustTranscriptText(step)
    }

    /// Hardware ⌘⇧↑ / ⌃⇧↑ and ⌘⇧↓ / ⌃⇧↓ when the composer is not first
    /// responder. The text view handles the same chord when the composer
    /// is empty, and leaves it alone when the composer has text so the
    /// arrows keep selecting. Find, rename, search, a card text field,
    /// and the shortcuts sheet own the key. A key repeat does not jump
    /// again. Either end stays put.
    private func userMessageJumpKey(_ press: KeyPress) -> KeyPress.Result {
        guard let direction = UserMessageJump.direction(
            up: press.key == .upArrow,
            down: press.key == .downArrow,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        guard hasRealAgent else { return .ignored }
        if userMessageJumpBlocked() { return .ignored }
        if UserMessageJump.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if UserMessageJump.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        applyUserMessageJump(direction)
        return .handled
    }

    /// Composer ⌘⇧↑ / ⌘⇧↓ and the control variants. The text view only
    /// offers the chord when the field is empty. Mention and skill menus
    /// are checked by the bar. Find, the shortcuts sheet, and the lightbox
    /// keep the key. The text view swallows a key repeat.
    private func userMessageJumpFromComposer(_ direction: UserMessageJump.Direction) {
        guard hasRealAgent else { return }
        if userMessageJumpBlocked() { return }
        applyUserMessageJump(direction)
    }

    private func userMessageJumpBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Scroll the sent message under the pinned day header and outline it.
    /// A row that is not laid out yet uses scroll-to-id. Stick-to-bottom
    /// and the reading place follow the same offset path as Page Up.
    /// Collapsed long messages are left collapsed.
    private func applyUserMessageJump(_ direction: UserMessageJump.Direction) {
        let visible = model.visibleMessages(for: agent)
        let hasDay = visible.contains { $0.createdAt != nil }
        let inset: CGFloat = hasDay ? UserMessageJump.stickyInset : 0
        var box = scrollBox
        if let commandedY {
            box.offsetY = commandedY
        }
        let rows: [UserMessageJump.Row] = visible.compactMap { message in
            guard message.isFromUser, message.isKindMessage else { return nil }
            let frame = readingFrames.first { $0.id == message.id }
            return UserMessageJump.Row(id: message.id, top: frame?.minY)
        }
        let line = UserMessageJump.viewLine(
            scrollTop: box.offsetY,
            stickyInset: inset,
            maxOffset: box.maxOffset
        )
        guard let id = UserMessageJump.pick(rows: rows, direction: direction, line: line) else {
            return
        }
        highlightUserJump(id)
        claimTargetedScroll(.message)
        guard let top = rows.first(where: { $0.id == id })?.top else {
            userJumpUnmeasuredID = id
            userJumpToken += 1
            return
        }
        let next = UserMessageJump.scrollOffset(
            targetTop: top,
            stickyInset: inset,
            maxOffset: box.maxOffset
        )
        commandedY = next
        let near = TranscriptScroll.isNearBottom(offsetY: next, box: box)
        stick = StickToBottom.onUserScroll(state: stick, nearBottom: near)
        readingNearBottom = near
        let transaction = TranscriptScroll.transaction(reduceMotion: reduceMotion)
        withTransaction(transaction) {
            transcriptPosition.scrollTo(point: CGPoint(x: 0, y: next))
        }
    }

    /// Hardware ⌘' / ⌃' when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// The composer may already have text. A key repeat does not jump again.
    private func quoteJumpKey(_ press: KeyPress) -> KeyPress.Result {
        guard QuoteJump.isChord(
            key: String(press.key.character),
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        guard hasRealAgent else { return .ignored }
        if userMessageJumpBlocked() { return .ignored }
        if QuoteJump.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if QuoteJump.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        jumpToNearestQuote()
        return .handled
    }

    /// Composer ⌘' / ⌃'. The text view swallows a key repeat and marked text.
    private func quoteJumpFromComposer() {
        guard hasRealAgent else { return }
        if userMessageJumpBlocked() { return }
        jumpToNearestQuote()
    }

    /// The quote nearest the reading line, then its source message.
    private func jumpToNearestQuote() {
        let visible = model.visibleMessages(for: agent)
        let loaded = Set(model.messages.map(\.id))
        let hasDay = visible.contains { $0.createdAt != nil }
        let inset: CGFloat = hasDay ? UserMessageJump.stickyInset : 0
        var box = scrollBox
        if let commandedY {
            box.offsetY = commandedY
        }
        let rows: [UserMessageJump.Row] = visible.compactMap { message in
            guard message.isFromUser, message.isKindMessage else { return nil }
            let targets = model.quoteJumps.targets(
                agentId: message.agentId,
                threadId: model.threadID,
                content: message.content,
                loaded: loaded
            )
            guard !targets.isEmpty else { return nil }
            let frame = readingFrames.first { $0.id == message.id }
            return UserMessageJump.Row(id: message.id, top: frame?.minY)
        }
        let line = UserMessageJump.viewLine(
            scrollTop: box.offsetY,
            stickyInset: inset,
            maxOffset: box.maxOffset
        )
        guard let id = QuoteJump.pickMessageId(rows: rows, line: line),
              let message = visible.first(where: { $0.id == id })
        else { return }
        let targets = model.quoteJumps.targets(
            agentId: message.agentId,
            threadId: model.threadID,
            content: message.content,
            loaded: loaded
        )
        guard let sourceId = QuoteJump.primarySource(targets) else { return }
        applyQuoteJump(sourceId)
    }

    /// Scroll the quoted message under the pinned day header and outline it.
    /// Stick-to-bottom and the reading place follow the same offset path
    /// as Page Up. Collapsed long messages stay collapsed.
    private func applyQuoteJump(_ id: String) {
        guard !id.isEmpty else { return }
        highlightUserJump(id)
        claimTargetedScroll(.message)
        let visible = model.visibleMessages(for: agent)
        let hasDay = visible.contains { $0.createdAt != nil }
        let inset: CGFloat = hasDay ? UserMessageJump.stickyInset : 0
        var box = scrollBox
        if let commandedY {
            box.offsetY = commandedY
        }
        guard let top = readingFrames.first(where: { $0.id == id })?.minY else {
            quoteJumpUnmeasuredID = id
            quoteJumpToken += 1
            return
        }
        let next = UserMessageJump.scrollOffset(
            targetTop: top,
            stickyInset: inset,
            maxOffset: box.maxOffset
        )
        commandedY = next
        let near = TranscriptScroll.isNearBottom(offsetY: next, box: box)
        stick = StickToBottom.onUserScroll(state: stick, nearBottom: near)
        readingNearBottom = near
        let transaction = TranscriptScroll.transaction(reduceMotion: reduceMotion)
        withTransaction(transaction) {
            transcriptPosition.scrollTo(point: CGPoint(x: 0, y: next))
        }
    }

    private func highlightUserJump(_ id: String) {
        userJumpPulse += 1
        let pulse = userJumpPulse
        userJumpHighlightID = id
        let delay = UserMessageJump.highlightDuration(reduceMotion: reduceMotion)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            if pulse == userJumpPulse {
                userJumpHighlightID = nil
            }
        }
    }

    private func transcriptTextBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Composer ⌘[ / ⌘] and the control variants. Mention and skill menus
    /// are checked by the bar. Find, the shortcuts sheet, and the lightbox
    /// keep the key. The text view swallows a key repeat.
    private func chatHistoryFromComposer(_ direction: String) {
        if chatHistoryBlocked() { return }
        guard let step = ChatOpenHistory.Direction(rawValue: direction) else { return }
        model.openChatFromHistory(step)
    }

    private func chatHistoryBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    private func unarchiveOpenChatBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Hardware ⌘⇧⌫ / ⌃⇧⌫ when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// An already empty draft is a no-op inside the model.
    private func clearComposerDraftKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard ClearComposerDraft.isChord(
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift),
            delete: press.key == .delete
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if ClearComposerDraft.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        model.clearComposerDraftFromChord()
        return .handled
    }

    /// Composer ⌘⇧⌫. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not clear. An already empty draft is a no-op.
    private func clearComposerDraftFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.clearComposerDraftFromChord()
    }

    /// Hardware ⌘⇧P / ⌃⇧P when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat is swallowed so Pin / Unpin does not flap.
    private func pinOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard PinOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if PinOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if PinOpenChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        model.toggleChatPin(agent.id)
        return .handled
    }

    /// Composer ⌘⇧P. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not pin. The text view swallows a key repeat.
    private func pinOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.toggleChatPin(agent.id)
    }

    /// Hardware ⌘⇧M / ⌃⇧M when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat is swallowed so Mute / Unmute does not flap.
    private func muteOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard MuteOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if MuteOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if MuteOpenChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        model.toggleChatMute(agent.id)
        return .handled
    }

    /// Composer ⌘⇧M. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not mute. The text view swallows a key repeat.
    private func muteOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.toggleChatMute(agent.id)
    }

    /// Hardware ⌘⇧U / ⌃⇧U when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat is swallowed so the mark does not flap.
    private func markOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard MarkOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if MarkOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if MarkOpenChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        model.toggleChatRead(agent.id)
        return .handled
    }

    /// Composer ⌘⇧U. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not mark. The text view swallows a key repeat.
    private func markOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.toggleChatRead(agent.id)
    }


    /// Hardware ⌘⇧R / ⌃⇧R when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat does not start a second rename.
    private func renameOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard RenameOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if RenameOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if !RenameOpenChat.shouldStart(
            isRepeat: press.`repeat`,
            renaming: model.renameChatID != nil
        ) {
            return .handled
        }
        model.beginRenameOpenChat(agent.id)
        return .handled
    }

    /// Composer ⌘⇧R. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not rename. The text view swallows a key repeat.
    /// A rename already in progress does not start another.
    private func renameOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        model.beginRenameOpenChat(agent.id)
    }

    private var pendingDeleteAgent: Agent? {
        guard let id = pendingDeleteChatID else { return nil }
        return model.visibleAgents.first(where: { $0.id == id })
            ?? model.agents.first(where: { $0.id == id })
    }

    private var deleteConfirmPresented: Binding<Bool> {
        Binding(
            get: { pendingDeleteChatID != nil },
            set: { presented in
                if presented { return }
                if pendingDeleteChatID != nil {
                    cancelDeleteOpenChat()
                }
            }
        )
    }

    /// ⌘⇧D opens the confirm. It does not delete.
    private func requestDeleteOpenChat() {
        guard hasRealAgent else { return }
        guard pendingDeleteChatID == nil else { return }
        pendingDeleteChatID = agent.id
    }

    /// Enter, Delete, or the Delete button. A nil key is the button.
    /// A key blocks itself until release so a hold cannot confirm again.
    private func confirmDeleteOpenChat(key: String?) {
        guard let id = pendingDeleteChatID else { return }
        pendingDeleteChatID = nil
        if let key {
            DeleteOpenChat.blockConfirmKey(key)
        }
        model.deleteOpenChat(id)
    }

    /// Esc or Cancel. Focus returns to the composer.
    private func cancelDeleteOpenChat() {
        guard pendingDeleteChatID != nil else { return }
        pendingDeleteChatID = nil
        composerFocused = true
    }

    private func deleteConfirmKeyName(_ press: KeyPress) -> String? {
        switch press.key {
        case .escape:
            return "escape"
        case .return:
            return "return"
        case .delete, .deleteForward:
            return "delete"
        default:
            return nil
        }
    }

    /// Enter or Delete confirms. Esc cancels. A key repeat never confirms.
    /// Key-up releases the swallow so the next press can type or send.
    private func deleteConfirmKey(_ press: KeyPress) -> KeyPress.Result {
        guard let name = deleteConfirmKeyName(press) else { return .ignored }
        if press.phase == .up {
            if name == "return" || name == "delete" {
                DeleteOpenChat.releaseConfirmKey(name)
            }
            return .ignored
        }
        if pendingDeleteChatID == nil && !DeleteOpenChat.confirmKeyBlocked(name) {
            return .ignored
        }
        let isRepeat = press.`repeat` || press.phase.contains(.`repeat`)
        guard let action = DeleteOpenChat.confirmAction(
            key: name,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift),
            isRepeat: isRepeat
        ) else { return .ignored }
        if action == "swallow" || DeleteOpenChat.confirmKeyBlocked(name) {
            return .handled
        }
        if action == "cancel" {
            cancelDeleteOpenChat()
            return .handled
        }
        if action == "confirm" {
            confirmDeleteOpenChat(key: name)
            return .handled
        }
        return .ignored
    }

    /// Hardware ⌘⇧D / ⌃⇧D when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat is swallowed so it cannot confirm.
    private func deleteOpenChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard DeleteOpenChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return .ignored
        }
        if model.skillMenuOpen() { return .ignored }
        if DeleteOpenChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if DeleteOpenChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        requestDeleteOpenChat()
        return .handled
    }

    /// Composer ⌘⇧D. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not ask. The text view swallows a key repeat.
    private func deleteOpenChatFromComposer() {
        guard hasRealAgent else { return }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen { return }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings { return }
        if model.skillMenuOpen() { return }
        requestDeleteOpenChat()
    }

    /// Hardware ⌘⇧E / ⌃⇧E when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat is swallowed so it does not copy again.
    private func copyTranscriptKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard CopyTranscript.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if copyTranscriptBlocked() { return .ignored }
        if CopyTranscript.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if CopyTranscript.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        copyOpenTranscript()
        return .handled
    }

    /// Composer ⌘⇧E. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not copy. The text view swallows a key repeat.
    private func copyTranscriptFromComposer() {
        guard hasRealAgent else { return }
        if copyTranscriptBlocked() { return }
        copyOpenTranscript()
    }

    private func copyTranscriptBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Copies loaded kind=message bodies. Chrome is skipped. An empty
    /// transcript leaves the pasteboard alone and does not show Copied.
    private func copyOpenTranscript() {
        guard hasRealAgent else { return }
        if copyTranscriptBlocked() { return }
        let visible = model.visibleMessages(for: agent)
        guard let text = CopyTranscript.plainText(messages: visible) else { return }
        UIPasteboard.general.string = text
        transcriptCopied = true
        transcriptCopiedPulse += 1
        let pulse = transcriptCopiedPulse
        Task {
            try? await Task.sleep(nanoseconds: CopyTranscript.feedbackNanoseconds)
            if pulse == transcriptCopiedPulse {
                transcriptCopied = false
            }
        }
    }

    /// Hardware ⌘⇧G / ⌃⇧G when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, a card text field, and an empty chat own the key.
    /// A key repeat is swallowed so it does not flap.
    private func toolTraceGroupsKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard ToolTraceGroups.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if toolTraceGroupsBlocked() { return .ignored }
        if ToolTraceGroups.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if ToolTraceGroups.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        toggleAllToolTraceGroups()
        return .handled
    }

    /// Composer ⌘⇧G. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat does not toggle. The text view swallows a key repeat.
    private func toggleToolTracesFromComposer() {
        guard hasRealAgent else { return }
        if toolTraceGroupsBlocked() { return }
        toggleAllToolTraceGroups()
    }

    private func toolTraceGroupsBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same stacks the transcript paints. A single tool is not a group.
    /// No group leaves the chevrons alone.
    private func toggleAllToolTraceGroups() {
        guard hasRealAgent else { return }
        if toolTraceGroupsBlocked() { return }
        guard let next = CompactToolTraces.toggleAll(
            expanded: expandedToolStacks,
            stacks: openChatToolStacks()
        ) else { return }
        expandedToolStacks = next
    }

    private func openChatToolStacks() -> [CompactToolTraces.Stack] {
        let visible = model.visibleMessages(for: agent)
        let persistedToolIds = Set(visible.filter(\.isToolLine).map(\.id))
        let liveTraces = model.toolTraces.filter { !persistedToolIds.contains($0.id) }
        let lastUserIdx = visible.lastIndex(where: \.isFromUser)
        let liveAssistantIdx = visible.indices.first { index in
            guard let lastUserIdx else { return false }
            let message = visible[index]
            return index > lastUserIdx
                && message.role == .assistant
                && !message.isHandoffRoot
                && !message.isToolLine
                && !message.isWidget
                && !message.isConnect
                && !message.isApprove
        }
        let liveAt: Int? = {
            guard !liveTraces.isEmpty else { return nil }
            if let liveAssistantIdx { return liveAssistantIdx }
            return visible.count
        }()
        return CompactToolTraces.stacks(
            messages: visible,
            liveTraces: liveTraces,
            liveAt: liveAt
        )
    }

    /// Hardware ⌘⇧F / ⌃⇧F when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key.
    /// An empty chat still toggles: the All / Unread control does.
    /// A key repeat is swallowed so the filter does not flap.
    private func chatListFilterKey(_ press: KeyPress) -> KeyPress.Result {
        guard ChatListFilterKey.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if chatListFilterKeyBlocked() { return .ignored }
        if ChatListFilterKey.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if ChatListFilterKey.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        model.toggleChatListFilterFromChord()
        return .handled
    }

    /// Composer ⌘⇧F. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// The text view swallows a key repeat so f is not inserted.
    private func toggleChatListFilterFromComposer() {
        if chatListFilterKeyBlocked() { return }
        model.toggleChatListFilterFromChord()
    }

    private func chatListFilterKeyBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if pendingDeleteChatID != nil { return true }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Hardware ⌘⇧H / ⌃⇧H when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. A chat
    /// does not have to be open. A key repeat is swallowed so it does not flap.
    private func archiveListKey(_ press: KeyPress) -> KeyPress.Result {
        guard ArchiveListKey.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if archiveListBlocked() { return .ignored }
        if ArchiveListKey.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if ArchiveListKey.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        toggleArchivedList()
        return .handled
    }

    /// Composer ⌘⇧H. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// An empty chat still toggles. The text view swallows a key repeat.
    private func toggleArchiveListFromComposer() {
        if archiveListBlocked() { return }
        toggleArchivedList()
    }

    private func archiveListBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same flag as the Archived (n) control. Works with or without an open chat.
    private func toggleArchivedList() {
        if archiveListBlocked() { return }
        model.toggleArchivedListFromChord()
    }

    /// Hardware ⌘⇧J / ⌃⇧J when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. A chat
    /// does not have to be open: the first unread row can still open.
    /// A key repeat is swallowed so it does not jump again.
    private func nextUnreadKey(_ press: KeyPress) -> KeyPress.Result {
        guard NextUnreadChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if nextUnreadBlocked() { return .ignored }
        if NextUnreadChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if NextUnreadChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        openNextUnread()
        return .handled
    }

    /// Composer ⌘⇧J. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// The text view swallows a key repeat so j is not inserted.
    private func nextUnreadFromComposer() {
        if nextUnreadBlocked() { return }
        openNextUnread()
    }

    private func nextUnreadBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same open as tapping the row. No unread row leaves the chat put.
    private func openNextUnread() {
        if nextUnreadBlocked() { return }
        model.openNextUnreadChat()
    }

    /// Hardware ⌘⇧K / ⌃⇧K when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. A chat
    /// does not have to be open: the last unread row can still open.
    /// A key repeat is swallowed so it does not jump again.
    /// ⌘K without Shift is not this chord.
    private func previousUnreadKey(_ press: KeyPress) -> KeyPress.Result {
        guard PreviousUnreadChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if previousUnreadBlocked() { return .ignored }
        if PreviousUnreadChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if PreviousUnreadChat.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        openPreviousUnread()
        return .handled
    }

    /// Composer ⌘⇧K. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// The text view swallows a key repeat so k is not inserted.
    private func previousUnreadFromComposer() {
        if previousUnreadBlocked() { return }
        openPreviousUnread()
    }

    private func previousUnreadBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same open as tapping the row. No unread row leaves the chat put.
    private func openPreviousUnread() {
        if previousUnreadBlocked() { return }
        model.openPreviousUnreadChat()
    }

    /// Hardware Option+Up / Option+Down when the composer is not first
    /// responder. The composer handles the same chord itself, and find
    /// keeps plain arrows plus Return. IME is filtered in the text view.
    private func chatNavKey(_ press: KeyPress) -> KeyPress.Result {
        if composerFocused || findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        let key: ChatNav.Key
        switch press.key {
        case .upArrow: key = .up
        case .downArrow: key = .down
        default: key = .other
        }
        guard let direction = ChatNav.direction(
            key: key,
            option: press.modifiers.contains(.option),
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            shift: press.modifiers.contains(.shift),
            composing: false,
            findOpen: findOpen
        ) else { return .ignored }
        model.openAdjacentChat(direction: direction)
        return .handled
    }

    /// Hardware ⌘⇧C / ⌃⇧C. Allowed while `composerFocused` is true: the
    /// draft is not edited, and the text view offers the same command.
    private func copyLastReplyKey(_ press: KeyPress) -> KeyPress.Result {
        // composerFocused may already be true. The draft stays put either way.
        guard hasRealAgent else { return .ignored }
        if copyLastReplyBlocked() { return .ignored }
        guard CopyLastReply.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        copyLastAssistantReply()
        return .handled
    }

    private func copyLastReplyBlocked() -> Bool {
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if model.skillMenuOpen() { return true }
        return false
    }

    /// Copies the latest completed assistant reply. A streaming reply
    /// is skipped. An empty reply leaves the pasteboard alone.
    private func copyLastAssistantReply() {
        if copyLastReplyBlocked() { return }
        let visible = model.visibleMessages(for: agent)
        let lastUserIdx = visible.lastIndex(where: \.isFromUser)
        let liveIndex = visible.indices.first { index in
            guard let lastUserIdx else { return false }
            let message = visible[index]
            return index > lastUserIdx
                && message.role == .assistant
                && !message.isHandoffRoot
                && !message.isToolLine
                && !message.isWidget
                && !message.isConnect
                && !message.isApprove
        }
        guard let reply = CopyLastReply.lastReply(
            messages: visible,
            sending: model.isSending,
            liveIndex: liveIndex
        ) else { return }
        UIPasteboard.general.string = reply.content
        copiedReplyId = reply.id
        copiedReplyPulse += 1
        let pulse = copiedReplyPulse
        Task {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            if pulse == copiedReplyPulse {
                copiedReplyId = nil
            }
        }
    }

    /// Hardware ⌘⇧Y / ⌃⇧Y when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. A chat
    /// has to be open. A key repeat is swallowed so it does not regenerate again.
    private func regenerateLastReplyKey(_ press: KeyPress) -> KeyPress.Result {
        guard RegenerateLastReply.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        guard hasRealAgent else { return .ignored }
        if composerFocused { return .ignored }
        if regenerateLastReplyBlocked() { return .ignored }
        if RegenerateLastReply.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if RegenerateLastReply.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        regenerateLastReplyFromChord()
        return .handled
    }

    /// Composer ⌘⇧Y. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// The text view swallows a key repeat so y is not inserted.
    private func regenerateLastReplyFromComposer() {
        guard hasRealAgent else { return }
        if regenerateLastReplyBlocked() { return }
        regenerateLastReplyFromChord()
    }

    private func regenerateLastReplyBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if pendingDeleteChatID != nil { return true }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same path as the Regenerate control: only when that control would
    /// show on the latest completed LEFT in this 1:1 chat.
    private func regenerateLastReplyFromChord() {
        guard hasRealAgent, !agent.isChannel, !model.isSending else { return }
        let visible = model.visibleMessages(for: agent)
        let lastUserIdx = visible.lastIndex(where: \.isFromUser)
        let liveAssistantIdx = visible.indices.first { index in
            guard let lastUserIdx else { return false }
            let message = visible[index]
            return index > lastUserIdx
                && message.role == .assistant
                && !message.isHandoffRoot
                && !message.isToolLine
                && !message.isWidget
                && !message.isConnect
                && !message.isApprove
        }
        let lastLeftIdx = visible.indices.last { index in
            let message = visible[index]
            let inFlight = model.isSending && index == liveAssistantIdx
            return !message.isFromUser
                && message.isKindMessage
                && !message.isToolLine
                && !message.isWidget
                && !message.isConnect
                && !message.isApprove
                && !message.isHandoffRoot
                && !inFlight
        }
        guard let lastLeftIdx else { return }
        guard Self.showsRegenerate(
            visible[lastLeftIdx],
            index: lastLeftIdx,
            lastLeftIdx: lastLeftIdx,
            isChannel: agent.isChannel,
            liveAssistantIdx: liveAssistantIdx,
            sending: model.isSending
        ) else { return }
        Task { await model.regenerate() }
    }

    /// Hardware ⌘L / ⌃L focuses the composer and does not insert or send.
    /// When a quotable transcript selection is active, the same chord
    /// quotes it (v1.26) and then focuses the composer. Plain letters
    /// stay where they are. Find, the shortcuts sheet, the lightbox, and
    /// an already-focused composer keep the key. The name field and widget
    /// text fields are first responder, so they keep it too.
    private func focusComposerKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        guard model.canCompose || model.isSending else { return .ignored }
        if model.computerTakeoverOpen || model.showProfile { return .ignored }
        if composerFocused || findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return .ignored
        }
        guard FocusComposer.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if quoteChordBlocked { return .ignored }
        if TranscriptScroll.nonQuoteTextFieldIsFirstResponder() { return .ignored }
        if quoteSelectionFromChord(press) { return .handled }
        model.pendingComposerCaret = (model.draft as NSString).length
        model.sidebarKeyboardFocus = false
        composerFocused = true
        return .handled
    }

    /// v1.26: ⌘L / ⌃L quotes the transcript selection when one message owns it.
    /// A repeat of the hold does not quote again. The composer and any other
    /// text field keep the key. Nothing is sent.
    private func quoteSelectionFromChord(_ press: KeyPress) -> Bool {
        if quoteChordBlocked { return false }
        if TranscriptScroll.nonQuoteTextFieldIsFirstResponder() { return false }
        guard let quoted = QuoteSelectionKey.selectionToQuote(
            inTextField: false,
            selection: QuoteSelection.menuSelection()
        ) else { return false }
        if press.`repeat` { return true }
        guard QuoteSelectionKey.claimTurn() else { return true }
        model.quoteIntoComposer(quoted)
        QuoteTextView.clearActiveSelection()
        model.sidebarKeyboardFocus = false
        return true
    }

    /// Find, shortcuts, rename, the lightbox, settings, and a confirm own ⌘L.
    private var quoteChordBlocked: Bool {
        if findOpen || findFieldFocused || shortcutsOpen || lightbox != nil { return true }
        if model.renameChatID != nil { return true }
        if model.showSettings || model.showProfile || model.computerTakeoverOpen { return true }
        if pendingDeleteChatID != nil { return true }
        if model.skillMenuOpen() { return true }
        return false
    }

    /// Hardware ⌘⇧S / ⌃⇧S when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. A chat
    /// has to be open. A key repeat is swallowed so focus does not move again.
    private func focusSidebarKey(_ press: KeyPress) -> KeyPress.Result {
        guard hasRealAgent else { return .ignored }
        if composerFocused { return .ignored }
        if focusSidebarBlocked() { return .ignored }
        guard FocusSidebarList.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if FocusSidebarList.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if FocusSidebarList.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        focusSidebarFromChord()
        return .handled
    }

    /// Composer ⌘⇧S. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// The text view swallows a key repeat so s is not inserted.
    private func focusSidebarFromComposer() {
        guard hasRealAgent else { return }
        if focusSidebarBlocked() { return }
        focusSidebarFromChord()
    }

    private func focusSidebarBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if pendingDeleteChatID != nil { return true }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same visible order as Option+Up / Option+Down and ⌘1–⌘9.
    /// Nothing changes when that list is empty.
    private func focusSidebarFromChord() {
        model.focusSidebarListFromChord()
    }

    /// Hardware ⌘⇧O / ⌃⇧O when the composer is not first responder.
    /// The text view handles the same chord and keeps IME marked text.
    /// Find, rename, search, and a card text field own the key. A chat
    /// does not have to be open. A key repeat is swallowed so it does not clear again.
    private func markAllReadKey(_ press: KeyPress) -> KeyPress.Result {
        guard MarkAllReadKey.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if composerFocused { return .ignored }
        if markAllReadBlocked() { return .ignored }
        if MarkAllReadKey.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        if MarkAllReadKey.shouldIgnoreRepeat(press.`repeat`) {
            return .handled
        }
        markAllReadFromChord()
        return .handled
    }

    /// Composer ⌘⇧O. Mention and skill menus are checked by the bar.
    /// Find, the shortcuts sheet, and the lightbox keep the key.
    /// The text view swallows a key repeat so o is not inserted.
    private func markAllReadFromComposer() {
        if markAllReadBlocked() { return }
        markAllReadFromChord()
    }

    private func markAllReadBlocked() -> Bool {
        if findOpen || findFieldFocused || lightbox != nil || shortcutsOpen {
            return true
        }
        if pendingDeleteChatID != nil { return true }
        if model.computerTakeoverOpen || model.showProfile || model.showSettings {
            return true
        }
        if model.skillMenuOpen() { return true }
        if model.renameChatID != nil { return true }
        return false
    }

    /// Same path as the Mark all as read control. Nothing unread is a no-op.
    private func markAllReadFromChord() {
        model.markAllChatsReadFromChord()
    }

    private func openFind() {
        findOpen = true
        findFieldFocused = true
    }

    private func closeFind() {
        findOpen = false
        findQuery = ""
        findIndex = 0
        findFieldFocused = false
    }

    private func openLightbox(_ target: ImageLightbox.Target) {
        lightboxFrame = target
        lightbox = target
        composerFocused = false
        lightboxGeneration += 1
        let generation = lightboxGeneration
        lightboxPaint = ImageLightbox.appear(reduceMotion: reduceMotion)
        guard !reduceMotion else { return }
        DispatchQueue.main.async {
            guard generation == lightboxGeneration else { return }
            lightboxPaint = ImageLightbox.shown()
        }
    }

    private func closeLightbox() {
        guard lightbox != nil else { return }
        lightbox = nil
        lightboxGeneration += 1
        let generation = lightboxGeneration
        let next = ImageLightbox.dismiss(reduceMotion: reduceMotion)
        lightboxPaint = next
        if !next.mounted {
            lightboxFrame = nil
            return
        }
        let delay = ImageLightbox.fadeSeconds(reduceMotion: reduceMotion)
        guard delay > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard generation == lightboxGeneration else { return }
            lightboxPaint = .hidden
            lightboxFrame = nil
        }
    }

    /// Leave the chat: drop the overlay immediately, with no fade.
    private func dismissLightboxImmediately() {
        lightbox = nil
        lightboxFrame = nil
        lightboxPaint = .hidden
        lightboxGeneration += 1
    }

    private func findBar(index: Int, total: Int) -> some View {
        HStack(spacing: 6) {
            TextField(ChatFind.placeholder, text: $findQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 12))
                .accessibilityLabel(ChatFind.inputLabel)
                .focused($findFieldFocused)
                .onSubmit { moveFind(1) }
                .onKeyPress(phases: .down) { press in
                    if press.key == .escape {
                        closeFind()
                        return .handled
                    }
                    if press.key == .return, press.modifiers.contains(.shift) {
                        moveFind(-1)
                        return .handled
                    }
                    return .ignored
                }
            Text(ChatFind.countLabel(index: index, total: total))
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .accessibilityLabel(ChatFind.countLabel(index: index, total: total))
            Button {
                moveFind(-1)
            } label: {
                Image(systemName: "chevron.up")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ChatFind.previousLabel)
            Button {
                moveFind(1)
            } label: {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ChatFind.nextLabel)
            Button {
                closeFind()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ChatFind.closeLabel)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(uiColor: .secondarySystemBackground))
    }

    private func moveFind(_ direction: Int) {
        let hits = loadedFindHits
        let base = hits.isEmpty ? -1 : min(findIndex, hits.count - 1)
        findIndex = ChatFind.step(index: base, total: hits.count, direction: direction)
    }

    private func scrollFind(_ proxy: ScrollViewProxy, index: Int) {
        guard findOpen else { return }
        let hits = loadedFindHits
        guard !hits.isEmpty else { return }
        let safe = min(max(index, 0), hits.count - 1)
        claimTargetedScroll(.message)
        proxy.scrollTo(ChatFind.scrollID(hits[safe].rowId), anchor: .center)
    }

    private func findTexts(_ message: Message, completed: Bool) -> [String] {
        if message.isHandoffRoot {
            return [message.userAsk ?? message.content]
        }
        if message.isFromUser {
            return [message.displayContent]
        }
        if message.isToolLine {
            return [message.content]
        }
        if message.isKindMessage {
            let linked = MarkdownReferenceLink.resolve(message.displayContent, completed: completed)
            let prepared = MarkdownFootnote.extract(linked, completed: completed)
            if prepared.notes.isEmpty {
                return MarkdownSplit.bubbles(in: linked, completed: completed)
            }
            var texts = MarkdownSplit.bubbles(in: prepared.text, completed: completed)
            if let last = texts.indices.last {
                let suffix = prepared.notes
                    .map { "\($0.number). \(MarkdownFootnote.plain($0.text))" }
                    .joined(separator: "\n")
                texts[last] += "\n" + suffix
            }
            return texts
        }
        return []
    }

    private func findOmits(_ message: Message, completed: Bool) -> Bool {
        guard findOpen else { return false }
        return ChatFind.omits(
            searchable: message.isKindMessage || message.isHandoffRoot,
            texts: findTexts(message, completed: completed),
            query: findQuery
        )
    }

    private var loadedFindHits: [ChatFind.Hit] {
        guard findOpen, ChatFind.queryActive(findQuery) else { return [] }
        return ChatFind.hits(rows: loadedFindRows, query: findQuery)
    }

    private var loadedFindRows: [ChatFind.Row] {
        let visible = model.visibleMessages(for: agent)
        let persistedToolIds = Set(visible.filter(\.isToolLine).map(\.id))
        let liveTraces = model.toolTraces.filter { !persistedToolIds.contains($0.id) }
        let lastUserIdx = visible.lastIndex(where: \.isFromUser)
        let liveAssistantIdx = visible.indices.first { index in
            guard let lastUserIdx else { return false }
            let message = visible[index]
            return index > lastUserIdx
                && message.role == .assistant
                && !message.isHandoffRoot
                && !message.isToolLine
                && !message.isWidget
                && !message.isConnect
                && !message.isApprove
        }
        let liveAt: Int? = {
            guard !liveTraces.isEmpty else { return nil }
            if let liveAssistantIdx { return liveAssistantIdx }
            return visible.count
        }()
        let toolStacks = CompactToolTraces.stacks(
            messages: visible,
            liveTraces: liveTraces,
            liveAt: liveAt
        )
        let livePaint = CompactToolTraces.livePaint(
            stacks: toolStacks,
            liveTraces: liveTraces,
            expanded: expandedToolStacks
        )
        var rows: [ChatFind.Row] = []
        for (index, message) in visible.enumerated() {
            let toolStack = CompactToolTraces.stack(for: index, in: toolStacks)
            let collapsed = toolStack.map {
                CompactToolTraces.collapsed(
                    expanded: expandedToolStacks,
                    stackId: $0.id,
                    count: $0.items.count
                )
            } ?? false
            if CompactToolTraces.hidePersisted(
                stack: toolStack,
                index: index,
                collapsed: collapsed
            ) || message.isWidget || message.isConnect || message.isApprove {
                continue
            }
            let completed = !(model.isSending && index == liveAssistantIdx)
            let texts = findTexts(message, completed: completed)
            if message.isToolLine || message.isFromUser || message.isHandoffRoot {
                if let text = texts.first, !text.isEmpty {
                    rows.append(ChatFind.Row(id: message.id, text: text))
                }
                continue
            }
            if message.isKindMessage {
                for (offset, text) in texts.enumerated() where !text.isEmpty {
                    rows.append(ChatFind.Row(id: "\(message.id)#\(offset)", text: text))
                }
            }
        }
        for trace in livePaint.lines where !trace.summary.isEmpty {
            rows.append(ChatFind.Row(id: "live:\(trace.id)", text: trace.summary))
        }
        return rows
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottom) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    if model.messages.isEmpty, !model.isConfigured {
                        Text("Paste your Spark URL and token in Settings to start.")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    } else {
                        let visible = model.visibleMessages(for: agent)
                        let lastUserIdx = visible.lastIndex(where: \.isFromUser)
                        let persistedToolIds = Set(visible.filter(\.isToolLine).map(\.id))
                        let liveTraces = model.toolTraces.filter { !persistedToolIds.contains($0.id) }
                        let liveAssistantIdx = visible.indices.first { index in
                            guard let lastUserIdx else { return false }
                            let message = visible[index]
                            return index > lastUserIdx
                                && message.role == .assistant
                                && !message.isHandoffRoot
                                && !message.isToolLine
                                && !message.isWidget
                                && !message.isConnect
                                && !message.isApprove
                        }
                        let toolThisTurn: Bool = {
                            guard let lastUserIdx else { return false }
                            return visible.enumerated().contains {
                                $0.offset > lastUserIdx && $0.element.isToolLine
                            }
                        }()
                        let hasFirstToken: Bool = {
                            guard let liveAssistantIdx else { return false }
                            let row = visible[liveAssistantIdx]
                            return WaitingChrome.hasToken(
                                content: row.content,
                                attachmentCount: row.attachments.count
                            )
                        }()
                        let showWaiting = WaitingChrome.shouldShow(
                            busy: model.isSending,
                            hasFirstToken: hasFirstToken,
                            hasLiveTool: !liveTraces.isEmpty || toolThisTurn,
                            hasError: model.errorMessage != nil || model.composerError != nil
                        )
                        let lastLeftIdx = visible.indices.last { index in
                            let message = visible[index]
                            let inFlight = model.isSending && index == liveAssistantIdx
                            return !message.isFromUser
                                && message.isKindMessage
                                && !message.isToolLine
                                && !message.isWidget
                                && !message.isConnect
                                && !message.isApprove
                                && !message.isHandoffRoot
                                && !inFlight
                        }
                        let liveAt: Int? = {
                            guard !liveTraces.isEmpty else { return nil }
                            if let liveAssistantIdx { return liveAssistantIdx }
                            return visible.count
                        }()
                        let toolStacks = CompactToolTraces.stacks(
                            messages: visible,
                            liveTraces: liveTraces,
                            liveAt: liveAt
                        )
                        let livePaint = CompactToolTraces.livePaint(
                            stacks: toolStacks,
                            liveTraces: liveTraces,
                            expanded: expandedToolStacks
                        )
                        let showLiveChrome = livePaint.header != nil || !livePaint.lines.isEmpty
                        let recallIdx = RecallDraft.latestIndex(
                            in: visible.map { message in
                                RecallDraft.Row(
                                    fromUser: message.isFromUser,
                                    kindMessage: message.isKindMessage,
                                    content: message.content
                                )
                            }
                        )
                        let dayLabels = DaySeparator.labels(
                            rows: visible.enumerated().map { index, message in
                                let toolStack = CompactToolTraces.stack(for: index, in: toolStacks)
                                let collapsed = toolStack.map {
                                    CompactToolTraces.collapsed(
                                        expanded: expandedToolStacks,
                                        stackId: $0.id,
                                        count: $0.items.count
                                    )
                                } ?? false
                                let completed = !(model.isSending && index == liveAssistantIdx)
                                return DaySeparator.Row(
                                    createdAt: message.createdAt,
                                    hidden: CompactToolTraces.hidePersisted(
                                        stack: toolStack,
                                        index: index,
                                        collapsed: collapsed
                                    ) || findOmits(message, completed: completed)
                                )
                            }
                        )
                        let dayGroups = DaySeparator.groups(
                            labels: dayLabels,
                            ids: visible.map(\.id)
                        )
                        let indexedMessages = Array(visible.enumerated())
                        ForEach(dayGroups) { group in
                            Section {
                                ForEach(Array(indexedMessages[group.start..<group.end]), id: \.element.id) { index, message in
                                    let toolStack = CompactToolTraces.stack(for: index, in: toolStacks)
                                    let toolCollapsed = toolStack.map {
                                        CompactToolTraces.collapsed(
                                            expanded: expandedToolStacks,
                                            stackId: $0.id,
                                            count: $0.items.count
                                        )
                                    } ?? false
                                    let rowCompleted = !(model.isSending && index == liveAssistantIdx)
                                    if !CompactToolTraces.hidePersisted(
                                        stack: toolStack,
                                        index: index,
                                        collapsed: toolCollapsed
                                    ), !findOmits(message, completed: rowCompleted) {
                                        if message.id == model.newMessagesAnchorID {
                                            NewMessagesDivider()
                                        }
                                        transcriptItem(
                                            message,
                                            index: index,
                                            in: visible,
                                            agent: agent,
                                            toolTraces: index == liveAssistantIdx ? livePaint.lines : [],
                                            liveHeader: index == liveAssistantIdx ? livePaint.header : nil,
                                            toolStack: toolStack,
                                            toolStackCollapsed: toolCollapsed,
                                            showCopy: Self.showsCopy(
                                                message,
                                                index: index,
                                                liveAssistantIdx: liveAssistantIdx,
                                                sending: model.isSending
                                            ) || Self.showsUserCopy(
                                                message,
                                                pending: model.isSending
                                                    && OptimisticSend.isOptimistic(message.id)
                                                    && model.failedSend(id: message.id) == nil
                                            ),
                                            showSpeak: Self.showsSpeak(
                                                message,
                                                index: index,
                                                liveAssistantIdx: liveAssistantIdx,
                                                sending: model.isSending
                                            ),
                                            showRegenerate: Self.showsRegenerate(
                                                message,
                                                index: index,
                                                lastLeftIdx: lastLeftIdx,
                                                isChannel: agent.isChannel,
                                                liveAssistantIdx: liveAssistantIdx,
                                                sending: model.isSending
                                            ),
                                            completed: !(model.isSending && index == liveAssistantIdx),
                                            showEditAsNew: index == recallIdx,
                                            shortcutCopied: message.id == copiedReplyId,
                                            showCaret: StreamingCaretChrome.shouldShow(
                                                busy: model.isSending,
                                                completed: !(model.isSending && index == liveAssistantIdx),
                                                hasFirstToken: !message.content.isEmpty,
                                                isUser: message.isFromUser,
                                                isKindMessage: message.isKindMessage
                                            )
                                        )
                                        .readingAnchor(message.id)
                                        .padding(.top, turnSpacing(at: index, in: visible, message: message))
                                        .id(message.id)
                                    }
                                }
                            } header: {
                                if let dayLabel = group.label {
                                    Text(dayLabel)
                                        .font(.system(size: 12))
                                        .foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity, alignment: .center)
                                        .multilineTextAlignment(.center)
                                        .padding(.top, 12)
                                        .padding(.bottom, 4)
                                        .background(Color(uiColor: .systemBackground))
                                        .accessibilityAddTraits(.isHeader)
                                }
                            }
                        }
                        if liveAssistantIdx == nil, showLiveChrome {
                            liveToolStreak(agent: agent, paint: livePaint)
                        }
                        if showWaiting {
                            waitingStreak(agent: agent)
                        }
                    }
                    if findOpen, ChatFind.queryActive(findQuery), loadedFindHits.isEmpty {
                        Text(ChatFind.emptyLabel)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.vertical, 8)
                .coordinateSpace(name: ReadingPlace.coordinateSpace)
            }
            .scrollPosition($transcriptPosition)
            .onScrollGeometryChange(for: Bool.self) { geo in
                StickToBottom.isNearBottom(
                    contentHeight: geo.contentSize.height,
                    containerHeight: geo.containerSize.height,
                    offsetY: geo.contentOffset.y
                )
            } action: { _, nearBottom in
                // A keyboard page owns stick until geometry catches the offset.
                if commandedY != nil { return }
                readingNearBottom = nearBottom
                stick = StickToBottom.onUserScroll(state: stick, nearBottom: nearBottom)
                publishReadingPlace(nearBottom: nearBottom)
            }
            .onScrollGeometryChange(for: TranscriptScroll.Box.self) { geo in
                TranscriptScroll.Box(
                    offsetY: geo.contentOffset.y,
                    viewport: geo.containerSize.height,
                    content: geo.contentSize.height
                )
            } action: { _, geometry in
                let merged = TranscriptScroll.reconcile(
                    commandedY: commandedY,
                    previousGeometryY: previousGeometryY,
                    geometry: geometry
                )
                let arrived = commandedY != nil && merged.commandedY == nil
                commandedY = merged.commandedY
                previousGeometryY = merged.previousGeometryY
                scrollBox = merged.box
                if arrived {
                    let near = TranscriptScroll.isNearBottom(
                        offsetY: geometry.offsetY,
                        box: geometry
                    )
                    readingNearBottom = near
                    stick = StickToBottom.onUserScroll(state: stick, nearBottom: near)
                    publishReadingPlace(nearBottom: near)
                }
            }
            .onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y
            } action: { _, offset in
                if let commanded = readingRestoreCommandedY {
                    if abs(offset - commanded) <= 1 {
                        readingRestoreCommandedY = nil
                        readingOffsetY = offset
                        publishReadingPlace(offsetY: offset)
                    }
                    return
                }
                readingOffsetY = offset
                publishReadingPlace(offsetY: offset)
            }
            .onPreferenceChange(ReadingFramesKey.self) { frames in
                readingFrames = frames
                applyPendingReadingOffset(frames)
                if readingOffsetPendingID == nil, readingRestoreCommandedY == nil {
                    publishReadingPlace(frames: frames)
                }
            }
            .onAppear {
                _ = applyPendingRestore(proxy)
            }
            .onDisappear {
                publishReadingPlace()
            }
            .onChange(of: agentID) { _, _ in
                closeFind()
                userJumpHighlightID = nil
            }
            .onChange(of: model.threadID) { _, _ in
                closeFind()
                userJumpHighlightID = nil
            }
            .onChange(of: model.stickBump) { _, _ in
                snapToBottom(proxy)
            }
            .onChange(of: userJumpToken) { _, token in
                guard token > 0, let id = userJumpUnmeasuredID else { return }
                let transaction = TranscriptScroll.transaction(reduceMotion: reduceMotion)
                withTransaction(transaction) {
                    proxy.scrollTo(id, anchor: .top)
                }
            }
            .onChange(of: quoteJumpToken) { _, token in
                guard token > 0, let id = quoteJumpUnmeasuredID else { return }
                let transaction = TranscriptScroll.transaction(reduceMotion: reduceMotion)
                withTransaction(transaction) {
                    proxy.scrollTo(id, anchor: .top)
                }
            }
            .onChange(of: keyboardJumpToken) { _, token in
                guard token > 0 else { return }
                let transaction = TranscriptScroll.transaction(reduceMotion: reduceMotion)
                withTransaction(transaction) {
                    snapToBottom(proxy)
                    transcriptPosition.scrollTo(edge: .bottom)
                }
                if StopGenerating.shouldFocusComposerAfterAbort(
                    hardwareKeyboardAttached: StopGenerating.hardwareKeyboardAttached
                ) {
                    model.wantsComposerFocus = true
                }
            }
            .onChange(of: model.readingTranscriptToken) { _, _ in
                if applyPendingRestore(proxy) { return }
                followStream(proxy)
            }
            .onChange(of: model.messages.count) { _, _ in
                if model.pendingReadingKey != nil { return }
                followStream(proxy)
            }
            .onChange(of: model.messages.last?.content) { _, _ in
                if model.pendingReadingKey != nil { return }
                followStream(proxy)
            }
            .onChange(of: model.toolTraces.count) { _, _ in
                if model.pendingReadingKey != nil { return }
                followStream(proxy)
            }
            .onChange(of: model.isSending) { _, _ in
                if model.pendingReadingKey != nil { return }
                followStream(proxy)
            }
            .onChange(of: findQuery) { _, _ in
                findIndex = 0
                scrollFind(proxy, index: 0)
            }
            .onChange(of: findIndex) { _, index in
                scrollFind(proxy, index: index)
            }
            .onChange(of: stick.showJump) { _, shown in
                applyJumpChipPaint(shown: shown)
            }
            .simultaneousGesture(TapGesture().onEnded { model.dismissSkillPicker() })
            if StopGenerating.shouldOffer(busy: model.isSending) || stick.showJump || jumpPaint.mounted {
                VStack(spacing: 6) {
                    if StopGenerating.shouldOffer(busy: model.isSending) {
                        Button(StopGenerating.label) {
                            model.stopGenerating()
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .buttonStyle(.plain)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color(uiColor: .secondarySystemBackground))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(Color(uiColor: .separator), lineWidth: 1)
                                }
                        }
                        .accessibilityLabel(StopGenerating.label)
                    }
                    if stick.showJump || jumpPaint.mounted {
                        Button(StickToBottom.jumpLabel) {
                            snapToBottom(proxy)
                            if StopGenerating.shouldFocusComposerAfterAbort(
                                hardwareKeyboardAttached: StopGenerating.hardwareKeyboardAttached
                            ) {
                                model.wantsComposerFocus = true
                            }
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .buttonStyle(.plain)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color(uiColor: .secondarySystemBackground))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(Color(uiColor: .separator), lineWidth: 1)
                                }
                        }
                        .opacity(jumpPaint.shown ? 1 : 0)
                        .animation(
                            StickToBottom.jumpChipAnimation(reduceMotion: reduceMotion),
                            value: jumpPaint.shown
                        )
                        .allowsHitTesting(jumpPaint.shown && stick.showJump)
                        .accessibilityLabel(StickToBottom.jumpLabel)
                        .accessibilityHidden(!jumpPaint.shown)
                    }
                }
                .padding(.bottom, 12)
            }
            }
        }
    }

    private func applyJumpChipPaint(shown: Bool) {
        jumpPaintGeneration += 1
        let gen = jumpPaintGeneration
        if shown {
            jumpPaint = StickToBottom.jumpChipAppear(reduceMotion: reduceMotion)
            guard !reduceMotion else { return }
            DispatchQueue.main.async {
                guard gen == jumpPaintGeneration else { return }
                jumpPaint = StickToBottom.jumpChipShown()
            }
            return
        }
        jumpPaint = StickToBottom.jumpChipDismiss(reduceMotion: reduceMotion)
        let delay = StickToBottom.jumpChipFadeSeconds(reduceMotion: reduceMotion)
        guard delay > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard gen == jumpPaintGeneration else { return }
            jumpPaint = .hidden
        }
    }

    private func publishReadingPlace(
        nearBottom: Bool? = nil,
        offsetY: CGFloat? = nil,
        frames: [ReadingPlace.Frame]? = nil
    ) {
        guard hasRealAgent else { return }
        let near = nearBottom ?? readingNearBottom
        let offset = offsetY ?? readingOffsetY
        let rows = frames ?? readingFrames
        let anchor = ReadingPlace.topVisibleAnchor(rows: rows, viewportTop: offset)
        let fraction = ReadingPlace.anchorOffset(
            rows: rows,
            anchorId: anchor,
            viewportTop: offset
        )
        let tail = model.visibleMessages(for: agent).last?.id
        model.noteReadingPlace(
            agentId: agentID,
            threadId: model.threadID,
            nearBottom: near,
            anchorId: anchor,
            tailId: tail,
            anchorOffset: fraction
        )
    }

    /// v1.30: find, a quote jump, a sent-message jump, Home, or End
    /// wins over a restore that was scheduled earlier. Drops a deferred
    /// offset so it cannot yank the transcript afterwards.
    private func claimTargetedScroll(_ kind: ReadingPlace.TargetedKind) {
        readingOffsetPendingID = nil
        readingRestoreCommandedY = nil
        model.noteTargetedScroll(kind)
    }

    /// Instant content offset. Geometry may lag; publish waits until it catches up.
    private func scrollReadingPoint(_ y: CGFloat) {
        readingOffsetY = y
        readingRestoreCommandedY = y
        let transaction = TranscriptScroll.transaction(reduceMotion: true)
        withTransaction(transaction) {
            transcriptPosition.scrollTo(point: CGPoint(x: 0, y: y))
        }
    }

    /// Once the anchor is measured, scroll so the saved fraction sits
    /// above the viewport. No animation. An explicit target cancels it.
    private func applyPendingReadingOffset(_ frames: [ReadingPlace.Frame]) {
        guard let id = readingOffsetPendingID else { return }
        guard model.targetedScrollToken == readingOffsetPendingToken else {
            readingOffsetPendingID = nil
            return
        }
        guard let frame = frames.first(where: { $0.id == id }) else { return }
        let fraction = readingOffsetPendingFraction
        readingOffsetPendingID = nil
        let y = ReadingPlace.restoredContentOffset(
            minY: frame.minY,
            maxY: frame.maxY,
            fraction: fraction
        )
        guard abs(y - frame.minY) >= 1 else { return }
        scrollReadingPoint(y)
    }

    /// Park on the saved message, or open at the latest. Returns true when
    /// this transcript was the switch being restored. An explicit target
    /// claimed after the switch was scheduled wins and is not overwritten.
    /// The offset assign is instant.
    private func applyPendingRestore(_ proxy: ScrollViewProxy) -> Bool {
        guard let key = model.pendingReadingKey else { return false }
        guard key == ReadingPlace.key(agentId: agentID, threadId: model.threadID) else {
            return false
        }
        let decision = ReadingPlace.decision(
            scheduled: model.pendingReadingTargeted,
            current: model.targetedScrollToken,
            kind: model.targetedScrollKind
        )
        if decision != .place {
            readingOffsetPendingID = nil
            readingRestoreCommandedY = nil
            model.consumeReadingRestore()
            let transaction = TranscriptScroll.transaction(reduceMotion: true)
            if decision == .bottom {
                withTransaction(transaction) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            } else if decision == .top {
                withTransaction(transaction) {
                    transcriptPosition.scrollTo(edge: .top)
                }
            }
            return true
        }
        let visible = model.visibleMessages(for: agent)
        let ids = visible.map(\.id)
        let saved = model.readingPlace(for: key)
        let mode = ReadingPlace.restore(saved: saved, anchorIds: ids)
        let grew = mode == .anchor && ReadingPlace.tailGrew(saved: saved, tailId: ids.last)
        stick = ReadingPlace.stick(mode: mode, tailGrew: grew)
        lastAssistantSig = StickToBottom.signature(messages: visible)
        model.consumeReadingRestore()
        let transaction = TranscriptScroll.transaction(reduceMotion: true)
        if mode == .anchor, let anchor = saved?.anchorId {
            let fraction = saved?.anchorOffset ?? 0
            if let frame = readingFrames.first(where: { $0.id == anchor }) {
                readingOffsetPendingID = nil
                let y = ReadingPlace.restoredContentOffset(
                    minY: frame.minY,
                    maxY: frame.maxY,
                    fraction: fraction
                )
                if abs(y - frame.minY) < 1 {
                    readingRestoreCommandedY = nil
                    withTransaction(transaction) {
                        proxy.scrollTo(anchor, anchor: .top)
                    }
                } else {
                    scrollReadingPoint(y)
                }
            } else {
                readingOffsetPendingID = anchor
                readingOffsetPendingFraction = fraction
                readingOffsetPendingToken = model.targetedScrollToken
                withTransaction(transaction) {
                    proxy.scrollTo(anchor, anchor: .top)
                }
            }
        } else {
            readingOffsetPendingID = nil
            withTransaction(transaction) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
        return true
    }

    private func snapToBottom(_ proxy: ScrollViewProxy) {
        claimTargetedScroll(.bottom)
        stick = StickToBottom.onSendOrRegenerate()
        lastAssistantSig = StickToBottom.signature(messages: model.visibleMessages(for: agent))
        proxy.scrollTo("bottom", anchor: .bottom)
    }

    private func followStream(_ proxy: ScrollViewProxy) {
        if StickToBottom.shouldFollow(stick) {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
        let next = StickToBottom.signature(messages: model.visibleMessages(for: agent))
        stick = StickToBottom.onAssistantActivity(
            state: stick,
            prev: lastAssistantSig,
            next: next
        )
        lastAssistantSig = next
    }

    @ViewBuilder
    private func liveToolStreak(agent: Agent, paint: CompactToolTraces.LivePaint) -> some View {
        let traces = paint.lines
        let speaker = liveToolSpeaker(agent: agent, traces: traces)
        let speakerName = traces.first?.senderName.flatMap { $0.isEmpty ? nil : $0 }
            ?? paint.header.map { _ in agent.name }
            ?? speaker.name
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                AgentAvatar(agent: speaker, size: 20)
                Text(speakerName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            if let header = paint.header {
                ToolStackHeader(
                    count: header.items.count,
                    expanded: expandedToolStacks.contains(header.id)
                ) {
                    expandedToolStacks = CompactToolTraces.toggle(
                        expanded: expandedToolStacks,
                        stackId: header.id
                    )
                }
                .padding(.horizontal, 12)
            }
            ForEach(traces) { trace in
                FindHighlighted(text: trace.summary, rowId: "live:\(trace.id)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .id("live:\(trace.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .id("live-tools")
    }

    @ViewBuilder
    private func waitingStreak(agent: Agent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                AgentAvatar(agent: agent, size: 20)
                Text(agent.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            WaitingLabel()
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .id("waiting")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(agent.name), \(WaitingChrome.label)")
    }

    /// Match desktop: speaker is the trace's senderId, else the conversation
    /// (`active`). Never the first roster agent.
    private func liveToolSpeaker(agent: Agent, traces: [LiveToolTrace]) -> Agent {
        if let id = traces.first?.senderId, !id.isEmpty,
           let found = model.visibleAgents.first(where: { $0.id == id })
        {
            return found
        }
        return agent
    }

    @ViewBuilder
    private func transcriptItem(
        _ message: Message,
        index: Int,
        in messages: [Message],
        agent: Agent,
        toolTraces: [LiveToolTrace] = [],
        liveHeader: CompactToolTraces.Stack? = nil,
        toolStack: CompactToolTraces.Stack? = nil,
        toolStackCollapsed: Bool = false,
        showCopy: Bool = false,
        showSpeak: Bool = false,
        showRegenerate: Bool = false,
        completed: Bool = true,
        showEditAsNew: Bool = false,
        showCaret: Bool = false,
        shortcutCopied: Bool = false
    ) -> some View {
        let onTimeline = agent.isChannel && model.threadID == nil
        if onTimeline, message.isHandoffRoot {
            Button {
                Task { await model.openJump(channelId: agent.id, threadId: message.id) }
            } label: {
                HandoffTimelineRow(message: message, agents: model.visibleAgents)
            }
            .buttonStyle(.plain)
        } else {
            MessageBubble(
                message: message,
                messageIndex: index,
                agents: model.visibleAgents,
                localPreviews: model.localPreviews[message.id] ?? [],
                sameSender: !message.isHandoffRoot && !message.hasRoutineKicker && sameSender(at: index, in: messages),
                threadRoot: agent.isChannel && model.threadID != nil && message.isHandoffRoot,
                toolTraces: toolTraces,
                liveHeader: liveHeader,
                liveHeaderExpanded: liveHeader.map { expandedToolStacks.contains($0.id) } ?? false,
                onToggleLiveHeader: {
                    guard let id = liveHeader?.id else { return }
                    expandedToolStacks = CompactToolTraces.toggle(
                        expanded: expandedToolStacks,
                        stackId: id
                    )
                },
                toolStack: toolStack,
                toolStackCollapsed: toolStackCollapsed,
                onToggleToolStack: {
                    guard let id = toolStack?.id else { return }
                    expandedToolStacks = CompactToolTraces.toggle(
                        expanded: expandedToolStacks,
                        stackId: id
                    )
                },
                showCopy: showCopy,
                showSpeak: showSpeak,
                showRegenerate: showRegenerate,
                completed: completed,
                showEditAsNew: showEditAsNew,
                showCaret: showCaret,
                shortcutCopied: shortcutCopied,
                jumpHighlight: userJumpHighlightID == message.id,
                onQuoteJump: { sourceId in applyQuoteJump(sourceId) },
                onOpenImage: { target in
                    openLightbox(target)
                }
            ) { jump in
                Task { await model.openJump(channelId: jump.channelId, threadId: jump.threadId) }
            }
            .environment(\.quoteSourceId, message.id)
        }
    }

    private func senderKey(_ message: Message) -> String {
        message.senderId.isEmpty ? (message.role == .user ? "user" : message.agentId) : message.senderId
    }

    private func sameSender(at index: Int, in messages: [Message]) -> Bool {
        guard index > 0 else { return false }
        if messages[index].hasRoutineKicker { return false }
        return senderKey(messages[index - 1]) == senderKey(messages[index])
    }

    /// v0.54: LEFT different turns / after tool-widget-approve-connect are
    /// 12pt. User-right stays 4pt same-sender / 16pt speaker change.
    private func turnSpacing(at index: Int, in messages: [Message], message: Message? = nil) -> CGFloat {
        let row = message ?? (messages.indices.contains(index) ? messages[index] : nil)
        return AssistantBubbleGap.turnSpacing(
            index: index,
            isUser: row?.isFromUser == true,
            sameSender: sameSender(at: index, in: messages),
            isHandoffRoot: row?.isHandoffRoot == true
        )
    }

    private static func showsCopy(
        _ message: Message,
        index: Int,
        liveAssistantIdx: Int?,
        sending: Bool
    ) -> Bool {
        guard !message.isFromUser,
              message.isKindMessage,
              !message.isToolLine,
              !message.isWidget,
              !message.isConnect,
              !message.isApprove,
              !message.isHandoffRoot
        else { return false }
        if sending, index == liveAssistantIdx { return false }
        return true
    }

    /// v0.86: long-press Copy on a settled user-RIGHT kind=message.
    /// Hidden while that bubble is still the in-flight optimistic send.
    /// Does not turn on Speak or Regenerate.
    private static func showsUserCopy(_ message: Message, pending: Bool) -> Bool {
        guard message.isFromUser, message.isKindMessage else { return false }
        return !pending
    }

    private static func showsRegenerate(
        _ message: Message,
        index: Int,
        lastLeftIdx: Int?,
        isChannel: Bool,
        liveAssistantIdx: Int?,
        sending: Bool
    ) -> Bool {
        guard showsCopy(
            message,
            index: index,
            liveAssistantIdx: liveAssistantIdx,
            sending: sending
        ) else { return false }
        return !isChannel && index == lastLeftIdx && !sending
    }

    private static func showsSpeak(
        _ message: Message,
        index: Int,
        liveAssistantIdx: Int?,
        sending: Bool
    ) -> Bool {
        showsCopy(
            message,
            index: index,
            liveAssistantIdx: liveAssistantIdx,
            sending: sending
        )
    }
}

private struct ComposerBar: View {
    let agentName: String
    var isChannel: Bool
    var focused: FocusState<Bool>.Binding
    var showJump = false
    var onCopyLastReply: () -> Void = {}
    var onNewChat: () -> Void = {}
    var onJumpChat: (Int) -> Void = { _ in }
    var onArchiveOpenChat: () -> Void = {}
    var onUnarchiveOpenChat: () -> Void = {}
    var onChatHistory: (String) -> Void = { _ in }
    var onTranscriptText: (TranscriptTextScale.Step) -> Void = { _ in }
    var onUserMessageJump: (UserMessageJump.Direction) -> Void = { _ in }
    var onQuoteJump: () -> Void = {}
    var onClearComposerDraft: () -> Void = {}
    var onPinOpenChat: () -> Void = {}
    var onMuteOpenChat: () -> Void = {}
    var onMarkOpenChat: () -> Void = {}
    var onRenameOpenChat: () -> Void = {}
    var onDeleteOpenChat: () -> Void = {}
    var onCopyTranscript: () -> Void = {}
    var onToggleToolTraces: () -> Void = {}
    var onToggleChatListFilter: () -> Void = {}
    var onToggleArchiveList: () -> Void = {}
    var onNextUnread: () -> Void = {}
    var onPreviousUnread: () -> Void = {}
    var onRegenerateLastReply: () -> Void = {}
    var onFocusSidebarList: () -> Void = {}
    var onMarkAllRead: () -> Void = {}
    var deleteConfirmOpen = false
    var onConfirmDeleteKey: (String) -> Void = { _ in }
    var onCancelDelete: () -> Void = {}
    var onEscapeFind: () -> Bool = { false }
    @Environment(AppModel.self) private var model
    @State private var pickerItem: PhotosPickerItem?
    /// v0.84: grown field height. Empty starts at the single-line floor.
    @State private var fieldHeight = ComposerGrow.minHeight
    @State private var attachMenu = false
    @State private var showPhotos = false
    @State private var showFiles = false
    @State private var dropTarget = false

    private var mentionQuery: String? {
        let draft = model.draft
        guard let at = draft.lastIndex(of: "@") else { return nil }
        let prefix = draft[..<at]
        if let last = prefix.last, last.isLetter || last.isNumber || last == "_" { return nil }
        let after = draft[draft.index(after: at)...]
        if after.contains(where: { $0.isWhitespace }) { return nil }
        return String(after)
    }

    private var canQueue: Bool {
        model.canQueueFollowUp()
    }

    private var canSend: Bool {
        let trimmed = model.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return model.canCompose
            && !SendMuted.whileGenerating(busy: model.isSending)
            && !model.isAttaching
            && model.attachError == nil
            && (!trimmed.isEmpty || !model.pendingAttachments.isEmpty)
    }

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 8) {
            if !model.pendingAttachments.isEmpty {
                FlowWrap(spacing: 6) {
                    ForEach(model.pendingAttachments) { row in
                        pendingChip(row)
                    }
                }
            }
            if let error = model.attachError, !error.isEmpty {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.red)
            }
            if !isChannel, model.skillMenuOpen() {
                let candidates = model.skillCandidates()
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(candidates) { skill in
                        Button {
                            model.insertSkill(skill)
                        } label: {
                            Text(skill.name)
                                .font(.system(size: SkillPicker.nameSize))
                                .foregroundStyle(.primary)
                                .frame(
                                    maxWidth: .infinity,
                                    minHeight: SkillPicker.rowHeight,
                                    alignment: .leading
                                )
                                .padding(.horizontal, 10)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(width: SkillPicker.popupWidth, alignment: .leading)
                .background(.bar, in: RoundedRectangle(cornerRadius: SkillPicker.cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: SkillPicker.cornerRadius)
                        .stroke(Color(uiColor: .separator), lineWidth: 1)
                )
            } else if let query = mentionQuery {
                let candidates = model.mentionCandidates(query: query)
                if !candidates.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(candidates) { candidate in
                            Button {
                                model.insertMention(candidate)
                            } label: {
                                HStack(spacing: 8) {
                                    AgentAvatar(agent: candidate, size: 20)
                                    Text(candidate.name)
                                        .font(.system(size: 14))
                                        .foregroundStyle(.primary)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(width: 240, alignment: .leading)
                    .background(.bar, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(uiColor: .separator), lineWidth: 0.5)
                    )
                }
            }
            if !model.openQueuedItems().isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(model.openQueuedItems()) { item in
                        HStack(spacing: 8) {
                            Text(QueuedSend.label)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.secondary)
                            TextField(
                                QueuedSend.editLabel,
                                text: Binding(
                                    get: { item.text },
                                    set: { model.editQueued(id: item.id, text: $0) }
                                )
                            )
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .textFieldStyle(.plain)
                            .accessibilityLabel(QueuedSend.editLabel)
                            Button {
                                model.removeQueued(id: item.id)
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 11, weight: .bold))
                                    .frame(width: 20, height: 20)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(QueuedSend.removeLabel)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Color(uiColor: .secondarySystemBackground),
                            in: RoundedRectangle(cornerRadius: 8)
                        )
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(QueuedSend.listLabel)
            }
            HStack(alignment: .bottom, spacing: 8) {
                Button {
                    attachMenu = true
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 16))
                        .frame(width: 44, height: 44)
                }
                .disabled(!model.canCompose)
                .accessibilityLabel("Attach")
                .confirmationDialog("Attach", isPresented: $attachMenu) {
                    Button("Photos") { showPhotos = true }
                    Button("Files") { showFiles = true }
                }

                ComposerTextView(
                    text: $model.draft,
                    chipNames: model.composerChipNames,
                    placeholder: "Message \(agentName)",
                    disabled: !(model.canCompose || model.isSending),
                    pendingCaret: $model.pendingComposerCaret,
                    focused: focused,
                    onReturnSend: {
                        guard SendMuted.enterSends(busy: model.isSending) else { return }
                        Task { await model.send() }
                    },
                    onReturnWhileMuted: {
                        model.queueFollowUp()
                    },
                    onPasteAttachments: { items in
                        Task {
                            for item in items {
                                await model.addPendingFile(
                                    name: item.name,
                                    mime: item.mime,
                                    data: item.data
                                )
                            }
                        }
                    },
                    onCaretChange: { range in
                        model.noteComposerSelection(range)
                    },
                    onEscapeStop: { composing in
                        if ImageLightbox.escapeCloses(open: lightbox != nil, composing: composing) {
                            closeLightbox()
                            return
                        }
                        if dropTarget {
                            dropTarget = false
                            return
                        }
                        if !composing && onEscapeFind() { return }
                        model.stopGeneratingFromEscape(composing: composing)
                        if !model.clearRecallFromEscape(composing: composing) {
                            model.jumpToLatestFromEscape(composing: composing, showJump: showJump)
                        }
                    },
                    onArrowUpRecall: {
                        model.recallLastSentFromArrowUp()
                    },
                    onChatNav: { direction in
                        guard !findOpen, lightbox == nil, !shortcutsOpen else { return }
                        model.openAdjacentChat(direction: direction)
                    },
                    onCopyLastReply: onCopyLastReply,
                    onNewChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onNewChat()
                    },
                    onJumpChat: { slot in
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onJumpChat(slot)
                    },
                    onArchiveOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onArchiveOpenChat()
                    },
                    onUnarchiveOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onUnarchiveOpenChat()
                    },
                    onChatHistory: { direction in
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onChatHistory(direction)
                    },
                    onTranscriptText: { step in
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onTranscriptText(step)
                    },
                    onUserMessageJump: { direction in
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onUserMessageJump(direction)
                    },
                    onQuoteJump: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onQuoteJump()
                    },
                    onClearComposerDraft: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onClearComposerDraft()
                    },
                    onPinOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onPinOpenChat()
                    },
                    onMuteOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onMuteOpenChat()
                    },
                    onMarkOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onMarkOpenChat()
                    },
                    onRenameOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onRenameOpenChat()
                    },
                    onDeleteOpenChat: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onDeleteOpenChat()
                    },
                    onCopyTranscript: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onCopyTranscript()
                    },
                    onToggleToolTraces: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onToggleToolTraces()
                    },
                    onToggleChatListFilter: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onToggleChatListFilter()
                    },
                    onToggleArchiveList: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onToggleArchiveList()
                    },
                    onNextUnread: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onNextUnread()
                    },
                    onPreviousUnread: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onPreviousUnread()
                    },
                    onRegenerateLastReply: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onRegenerateLastReply()
                    },
                    onFocusSidebarList: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onFocusSidebarList()
                    },
                    onMarkAllRead: {
                        if mentionQuery != nil || model.skillMenuOpen() { return }
                        onMarkAllRead()
                    },
                    deleteConfirmOpen: deleteConfirmOpen,
                    onConfirmDeleteKey: { key in
                        onConfirmDeleteKey(key)
                    },
                    onCancelDelete: {
                        onCancelDelete()
                    },
                    onBackspaceRemoveChip: {
                        model.removeLastPendingChipFromBackspace()
                    },
                    sendMuted: SendMuted.whileGenerating(busy: model.isSending),
                    onHeight: { next in
                        guard abs(fieldHeight - next) > 0.5 else { return }
                        var transaction = Transaction()
                        transaction.disablesAnimations = true
                        withTransaction(transaction) {
                            fieldHeight = next
                        }
                    }
                )
                .frame(height: fieldHeight, alignment: .bottom)
                .frame(
                    minHeight: ComposerGrow.minHeight,
                    maxHeight: ComposerGrow.maxHeight,
                    alignment: .bottom
                )

                Button {
                    Task { await model.toggleDictation() }
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "mic")
                            .font(.system(size: 16))
                            .foregroundStyle(
                                model.dictation == .recording ? Dictation.danger : Color.secondary
                            )
                            .frame(width: 44, height: 44)
                        if model.dictation == .recording {
                            DictationListeningDot()
                                .padding(4)
                        }
                    }
                }
                .disabled(!model.canCompose || Dictation.busy(model.dictation))
                .accessibilityLabel(Dictation.label(model.dictation))
                .accessibilityAddTraits(Dictation.pressed(model.dictation) ? .isSelected : [])
                .accessibilityValue(Dictation.busy(model.dictation) ? Dictation.hintTranscribing : "")

                Button {
                    if canQueue {
                        model.queueFollowUp()
                    } else {
                        Task { await model.send() }
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                }
                .disabled(!canSend && !canQueue)
                .opacity(
                    SendMuted.whileGenerating(busy: model.isSending) && !canQueue
                        ? SendMuted.disabledOpacity
                        : 1
                )
                .accessibilityLabel("Send")
            }
            if Dictation.cancelable(model.dictation) {
                Button("Cancel") {
                    model.cancelDictation()
                }
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .accessibilityLabel("Cancel dictation")
            }
            if let hint = Dictation.composerHint(state: model.dictation, error: model.composerError)
                ?? OptimisticSend.composerHint(error: model.composerError)
            {
                Text(hint)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.updatesFrequently)
                    .accessibilityIdentifier(Dictation.hintRole)
            } else if let error = model.composerError, !error.isEmpty {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
        .photosPicker(isPresented: $showPhotos, selection: $pickerItem, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            if case .success(let url) = result {
                Task { await loadFile(url) }
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await loadPhoto(item) }
        }
        .overlay {
            if dropTarget {
                Text(ChatDrop.label)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color(uiColor: .secondarySystemBackground).opacity(0.92))
                    .allowsHitTesting(false)
                    .accessibilityLabel(ChatDrop.label)
            }
        }
        // SwiftUI onDrop installs a UIDropInteraction on the composer.
        .onDrop(of: ChatDrop.types, isTargeted: $dropTarget) { providers in
            guard ChatDrop.accepts(providers: providers) else { return false }
            Task { @MainActor in
                for provider in providers {
                    guard let payload = await ChatDrop.load(provider) else { continue }
                    await model.addPendingFile(
                        name: payload.name,
                        mime: payload.mime,
                        data: payload.data
                    )
                }
            }
            return true
        }
        .onDisappear {
            model.cancelDictation()
        }
    }

    @ViewBuilder
    private func pendingChip(_ row: PendingChatAttachment) -> some View {
        if row.kind == .image, let data = row.previewData, let uiImage = UIImage(data: data) {
            ZStack(alignment: .topTrailing) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Button {
                    model.removePending(id: row.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .frame(width: 44, height: 44)
                .accessibilityLabel("Remove \(row.name)")
            }
            .frame(width: 56, height: 56)
        } else if row.kind == .video {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(uiColor: .secondarySystemFill))
                    if let poster = row.posterImage {
                        Image(uiImage: poster)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Image(systemName: "play.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(.primary)
                    }
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(uiColor: .separator), lineWidth: 1)
                )
                Button {
                    model.removePending(id: row.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .frame(width: 44, height: 44)
                .accessibilityLabel("Remove \(row.name)")
            }
            .frame(width: 56, height: 56)
        } else {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(row.name)
                        .font(.system(size: 13))
                        .lineLimit(1)
                    Text(ChatAttachment.formatSize(row.size))
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                Button {
                    model.removePending(id: row.id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .frame(width: 44, height: 44)
                .accessibilityLabel("Remove \(row.name)")
            }
            .padding(.leading, 10)
            .frame(height: 36)
            .frame(minHeight: 44)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(uiColor: .separator), lineWidth: 1)
            )
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        let isVideo = item.supportedContentTypes.contains {
            $0.conforms(to: .movie) || $0.conforms(to: .video)
        } || data.sniffedVideoMIME != nil
        let mime: String
        let name: String
        if isVideo {
            mime = data.sniffedVideoMIME ?? "video/mp4"
            name = "clip.mp4"
        } else {
            mime = data.sniffedImageMIME
            name = "photo"
        }
        await MainActor.run {
            pickerItem = nil
        }
        await model.addPendingFile(name: name, mime: mime, data: data)
    }

    private func loadFile(_ url: URL) async {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        await model.addPendingFile(name: url.lastPathComponent, mime: mime, data: data)
    }
}

private struct FlowWrap: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let result = arrange(
            proposal: ProposedViewSize(width: bounds.width, height: bounds.height),
            subviews: subviews
        )
        for (subview, origin) in zip(subviews, result.origins) {
            subview.place(
                at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
                proposal: .unspecified
            )
        }
    }

    private func arrange(
        proposal: ProposedViewSize,
        subviews: Subviews
    ) -> (size: CGSize, origins: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var width: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            width = max(width, x - spacing)
        }
        return (CGSize(width: width, height: y + rowHeight), origins)
    }
}

private struct MessageBubble: View {
    let message: Message
    var messageIndex: Int = 0
    let agents: [Agent]
    var localPreviews: [Data] = []
    var sameSender = false
    var threadRoot = false
    var toolTraces: [LiveToolTrace] = []
    var liveHeader: CompactToolTraces.Stack? = nil
    var liveHeaderExpanded = false
    var onToggleLiveHeader: (() -> Void)? = nil
    var toolStack: CompactToolTraces.Stack? = nil
    var toolStackCollapsed = false
    var onToggleToolStack: (() -> Void)? = nil
    var showCopy = false
    var showSpeak = false
    var showRegenerate = false
    var completed = true
    var showEditAsNew = false
    var showCaret = false
    var shortcutCopied = false
    var jumpHighlight = false
    var onQuoteJump: (String) -> Void = { _ in }
    var onOpenImage: (ImageLightbox.Target) -> Void = { _ in }
    var onJump: ((HandoffRef) -> Void)?
    @Environment(AppModel.self) private var model
    @Environment(\.chatFind) private var find
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shareURL: URL?
    @State private var copied = false
    @State private var copyPulse = 0

    private var isUser: Bool { message.isFromUser }

    /// v1.27: quote blocks with a loaded source are buttons. Find keeps
    /// the whole body so the match stays highlighted. No animation.
    private var showsQuoteJump: Bool {
        !message.content.isEmpty
            && !ChatFind.queryActive(find.query)
            && !loadedQuoteTargets.isEmpty
    }

    private var userQuoteBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(
                Array(QuoteJump.parts(content: message.content, targets: loadedQuoteTargets).enumerated()),
                id: \.offset
            ) { _, part in
                quotePart(part)
            }
        }
    }

    private var loadedQuoteTargets: [QuoteJump.Link] {
        let loaded = Set(model.messages.map(\.id))
        return model.quoteJumps.targets(
            agentId: message.agentId,
            threadId: model.threadID,
            content: message.content,
            loaded: loaded
        )
    }

    @ViewBuilder
    private func quotePart(_ part: QuoteJump.Part) -> some View {
        switch part {
        case .quote(let text, let sourceId):
            Button {
                onQuoteJump(sourceId)
            } label: {
                Text(text)
                    .transcriptFont(14)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(QuoteJump.action)
        case .text(let text):
            userQuoteLabel(text, findable: false)
        }
    }

    private func findStroke(_ rowId: String) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .stroke(
                find.activeRowId == rowId && ChatFind.queryActive(find.query)
                    ? Color.accentColor
                    : Color.clear,
                lineWidth: 1
            )
    }

    /// Reference links resolve across the whole message before footnotes
    /// and the blank-line bubble split, so a definition in a later
    /// paragraph still matches.
    private var referenceBody: String {
        MarkdownReferenceLink.resolve(message.displayContent, completed: completed)
    }

    private var footnotePrepared: MarkdownFootnote.Prepared {
        MarkdownFootnote.extract(referenceBody, completed: completed)
    }

    private var leftBubbles: [String] {
        let prepared = footnotePrepared
        if prepared.notes.isEmpty && referenceBody == message.displayContent {
            return MarkdownSplit.bubbles(in: message.displayContent, completed: completed)
        }
        return MarkdownSplit.bubbles(in: prepared.text, completed: completed)
    }

    private var senderAgent: Agent? {
        agents.first(where: { $0.id == message.senderId })
    }

    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
            if !isUser && !sameSender {
                HStack(spacing: 6) {
                    AgentAvatar(
                        agent: senderAgent ?? Agent(
                            id: message.senderId,
                            name: message.senderName,
                            title: "",
                            description: "",
                            avatar: message.senderAvatar,
                            kind: .agent,
                            memberIds: [],
                            sharedProject: false,
                            createdAt: .distantPast,
                            updatedAt: .distantPast
                        ),
                        size: 20
                    )
                    VStack(alignment: .leading, spacing: 1) {
                        Text(message.senderName)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.secondary)
                        if let kicker = message.routineName, !kicker.isEmpty {
                            Text(kicker)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 12)
            }
            if let liveHeader {
                ToolStackHeader(
                    count: liveHeader.items.count,
                    expanded: liveHeaderExpanded,
                    toggle: { onToggleLiveHeader?() }
                )
                .padding(.horizontal, 12)
            }
            ForEach(toolTraces) { trace in
                FindHighlighted(text: trace.summary, rowId: "live:\(trace.id)")
                    .transcriptFont(12)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .id("live:\(trace.id)")
            }
            if message.isToolLine {
                if CompactToolTraces.showHeader(stack: toolStack, index: messageIndex),
                   let toolStack
                {
                    ToolStackHeader(
                        count: toolStack.items.count,
                        expanded: !toolStackCollapsed,
                        toggle: { onToggleToolStack?() }
                    )
                    .padding(.horizontal, 12)
                }
                if !(toolStackCollapsed && CompactToolTraces.showHeader(
                    stack: toolStack,
                    index: messageIndex
                )) {
                    FindHighlighted(text: message.content, rowId: message.id)
                        .transcriptFont(12)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                }
            } else if message.isWidget, message.widget != nil {
                WidgetCardView(message: message)
                    .padding(.horizontal, 12)
            } else if message.isConnect, message.connect != nil {
                ConnectCardView(message: message)
                    .padding(.horizontal, 12)
            } else if message.isApprove, message.approve != nil {
                ApproveCardView(message: message)
                    .padding(.horizontal, 12)
            } else if threadRoot {
                HStack(alignment: .top, spacing: 0) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("from \(message.senderName)")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        FindHighlighted(
                            text: message.userAsk ?? message.content,
                            rowId: message.id
                        )
                            .transcriptFont(14)
                            .textSelection(.enabled)
                            if let brief = message.brief, !brief.isEmpty {
                            DisclosureGroup("Context") {
                                Text(brief)
                                    .transcriptFont(12)
                                    .foregroundStyle(.secondary)
                            }
                            .transcriptFont(12)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 16))
                    Spacer(minLength: 48)
                }
                .padding(.horizontal, 12)
            } else if isUser {
                HStack(alignment: .top, spacing: 0) {
                    Spacer(minLength: 48)
                    VStack(alignment: .leading, spacing: 6) {
                        userAttachments
                        if showsQuoteJump {
                            userQuoteBody
                        }
                        if !showsQuoteJump && !message.content.isEmpty {
                            MentionLabel(
                                text: message.displayContent,
                                names: agents.filter { !$0.isChannel }.map(\.name),
                                links: true,
                                findRowId: message.id
                            )
                            .transcriptFont(14)
                            .textSelection(.enabled)
                            .frame(minWidth: 0, alignment: .leading)
                        }
                    }
                    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.accentColor.opacity(0.22), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(findStroke(message.id))
                    .overlay {
                        if jumpHighlight {
                            RoundedRectangle(cornerRadius: 16)
                                .strokeBorder(Color.accentColor.opacity(0.65), lineWidth: 2)
                                .allowsHitTesting(false)
                        }
                    }
                    .animation(
                        UserMessageJump.highlightAnimates(reduceMotion: reduceMotion)
                            ? .easeOut(duration: 0.18)
                            : nil,
                        value: jumpHighlight
                    )
                    .opacity(model.failedSend(id: message.id) == nil ? 1 : 0.55)
                    .transaction { transaction in
                        transaction.animation = nil
                    }
                    .modifier(timeMenu)
                }
                .padding(.horizontal, 12)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    userAttachments
                    if !leftBubbles.isEmpty {
                        HStack(alignment: .top, spacing: 0) {
                            VStack(alignment: .leading, spacing: AssistantBubbleGap.sameTurn) {
                                ForEach(Array(leftBubbles.enumerated()), id: \.offset) { offset, part in
                                    LongMessageBody(
                                        completed: completed,
                                        text: part,
                                        activeFind: find.activeRowId == "\(message.id)#\(offset)"
                                    ) {
                                        HStack(alignment: .lastTextBaseline, spacing: 2) {
                                            if MidStreamPlaintext.shouldRenderMarkdown(completed: completed) {
                                                AssistantMarkdown(
                                                    text: part,
                                                    names: agents.filter { !$0.isChannel }.map(\.name),
                                                    completed: completed,
                                                    wrapScope: "\(message.id)#\(offset)",
                                                    showFootnotes: offset == leftBubbles.count - 1
                                                )
                                            } else {
                                                MidStreamPlaintextView(
                                                    text: part,
                                                    rowId: "\(message.id)#\(offset)"
                                                )
                                            }
                                            if showCaret && offset == leftBubbles.count - 1 {
                                                StreamingCaretView()
                                            }
                                        }
                                    }
                                    .environment(\.markdownFootnotes, footnotePrepared.notes)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(
                                        Color(uiColor: .secondarySystemFill),
                                        in: RoundedRectangle(cornerRadius: 16)
                                    )
                                    .overlay(findStroke("\(message.id)#\(offset)"))
                                    .overlay {
                                        if jumpHighlight && offset == 0 {
                                            RoundedRectangle(cornerRadius: 16)
                                                .strokeBorder(Color.accentColor.opacity(0.65), lineWidth: 2)
                                                .allowsHitTesting(false)
                                        }
                                    }
                                    .animation(
                                        QuoteJump.highlightAnimates(reduceMotion: reduceMotion)
                                            ? .easeOut(duration: 0.18)
                                            : nil,
                                        value: jumpHighlight
                                    )
                                    .modifier(timeMenu)
                                }
                            }
                            Spacer(minLength: 48)
                        }
                    }
                    if showCopy || showSpeak {
                        HStack(spacing: 12) {
                            if showCopy {
                                HStack(spacing: 6) {
                                    Button("Copy") {
                                        UIPasteboard.general.string = message.content
                                        copied = true
                                        copyPulse += 1
                                        let pulse = copyPulse
                                        Task {
                                            try? await Task.sleep(nanoseconds: 1_200_000_000)
                                            if pulse == copyPulse {
                                                copied = false
                                            }
                                        }
                                    }
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                                    .buttonStyle(.plain)
                                    if copied || shortcutCopied {
                                        Text("Copied")
                                            .font(.system(size: 12))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            if showSpeak {
                                let speaking = model.speakingMessageId == message.id
                                Button(Speak.label(speaking)) {
                                    Task { await model.toggleSpeak(message: message) }
                                }
                                .font(.system(size: 12))
                                .foregroundStyle(speaking ? Color.primary : Color.secondary)
                                .buttonStyle(.plain)
                                .accessibilityLabel(Speak.label(speaking))
                                .accessibilityAddTraits(Speak.pressed(speaking) ? .isSelected : [])
                            }
                            if showRegenerate {
                                Button("Regenerate") {
                                    Task { await model.regenerate() }
                                }
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                                .buttonStyle(.plain)
                                .disabled(model.isSending)
                            }
                        }
                    }
                }
                .padding(.horizontal, 12)
            }
            if isUser, model.failedSend(id: message.id) != nil {
                HStack(spacing: 0) {
                    Text(FailedSend.couldnt)
                        .accessibilityLabel(FailedSend.line)
                    Text(" · ")
                        .accessibilityHidden(true)
                    Button(FailedSend.retry) {
                        Task { await model.retryFailedSend(id: message.id) }
                    }
                    .buttonStyle(.plain)
                    .disabled(FailedSend.retryBlocked(busy: model.isSending))
                    .foregroundStyle(Color.accentColor)
                    Text(" · ")
                        .accessibilityHidden(true)
                    Button(FailedSend.remove) {
                        model.dismissFailedSend(id: message.id)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(FailedSend.remove)
                }
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
            }
            if isUser, let jump = message.visibleJump(in: agents) {
                Button {
                    onJump?(jump)
                } label: {
                    HStack(spacing: 0) {
                        Text("Also in ")
                            .foregroundStyle(.secondary)
                        Text(agents.first(where: { $0.id == jump.channelId })?.name ?? "Snorlax-Bot")
                            .foregroundStyle(Color.accentColor)
                    }
                    .font(.system(size: 12))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isUser ? "You" : message.senderName)
        .sheet(isPresented: Binding(
            get: { shareURL != nil },
            set: { if !$0 { shareURL = nil } }
        )) {
            if let shareURL {
                AttachmentShareSheet(url: shareURL)
            }
        }
    }

    @ViewBuilder
    private var userAttachments: some View {
        let atts = message.userRightAttachments
        let images = atts.filter { ImageLightbox.isImage($0.kind) }
        let videos = atts.filter { $0.kind == .video }
        let files = atts.filter { $0.kind == .file }
        if images.isEmpty && videos.isEmpty && files.isEmpty && localPreviews.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(images) { image in
                    Button {
                        onOpenImage(
                            ImageLightbox.Target(
                                id: image.id,
                                url: image.url,
                                name: image.name,
                                local: nil
                            )
                        )
                    } label: {
                        RemoteImage(urlString: image.url, mime: "image/*")
                            .frame(maxWidth: 220, maxHeight: 160)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(ImageLightbox.label(for: image.name))
                }
                ForEach(videos) { video in
                    RemoteVideo(urlString: video.url)
                        .frame(width: 220, height: 160)
                }
                if images.isEmpty && videos.isEmpty {
                    ForEach(Array(localPreviews.enumerated()), id: \.offset) { offset, data in
                        if let image = UIImage(data: data) {
                            Button {
                                onOpenImage(
                                    ImageLightbox.Target(
                                        id: "local-\(message.id)-\(offset)",
                                        url: "",
                                        name: ImageLightbox.label,
                                        local: data
                                    )
                                )
                            } label: {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(maxWidth: 220, maxHeight: 160)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(ImageLightbox.label)
                        }
                    }
                }
                ForEach(files) { file in
                    Button {
                        Task {
                            if let url = await model.openAttachment(file) {
                                shareURL = url
                            }
                        }
                    } label: {
                        Text(file.name)
                            .font(.system(size: 13))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .frame(height: 36)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(uiColor: .separator), lineWidth: 1)
                    )
                    .accessibilityLabel(file.name)
                }
            }
        }
    }

    /// v0.65: long-press menu. Streaming bubbles pass a nil stamp so the
    /// time stays hidden while the caret is up.
    private var timeMenu: BubbleTimestampMenu {
        BubbleTimestampMenu(
            stamp: BubbleTime.label(
                createdAt: message.createdAt,
                streaming: !completed
            ),
            showCopy: showCopy,
            showSpeak: showSpeak,
            showRegenerate: showRegenerate,
            speaking: model.speakingMessageId == message.id,
            showEditAsNew: showEditAsNew,
            showFailedSend: model.failedSend(id: message.id) != nil,
            retryDisabled: FailedSend.retryBlocked(busy: model.isSending),
            onCopy: { copyMessageText() },
            onSpeak: { Task { await model.toggleSpeak(message: message) } },
            onRegenerate: { Task { await model.regenerate() } },
            onEditAsNew: { model.editAsNewMessage(message.content) },
            showQuote: canQuote,
            onRetry: { Task { await model.retryFailedSend(id: message.id) } },
            onRemove: { model.dismissFailedSend(id: message.id) },
            onQuote: { model.quoteIntoComposer($0) }
        )
    }

    /// v0.94: user-RIGHT kind=message, and a completed assistant LEFT one.
    /// Streaming LEFT, tool lines, cards, and file-only bubbles are not.
    private var canQuote: Bool {
        QuoteSelection.surfaceAllowed(
            kindMessage: message.isKindMessage
                && !message.isToolLine
                && !message.isWidget
                && !message.isConnect
                && !message.isApprove
                && !message.isHandoffRoot,
            fromUser: message.isFromUser,
            completed: completed,
            fileChip: false
        ) && !message.content.isEmpty
    }

    private func copyMessageText() {
        UIPasteboard.general.string = message.content
        copied = true
        copyPulse += 1
        let pulse = copyPulse
        Task {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            if pulse == copyPulse {
                copied = false
            }
        }
    }
}

/// v0.65: timestamp is a non-actionable section header. Copy / Speak /
/// Regenerate stay beside it when those controls already show. A user
/// bubble with no actions still reveals the time as a disabled row.
private struct BubbleTimestampMenu: ViewModifier {
    let stamp: String?
    var showCopy: Bool
    var showSpeak: Bool
    var showRegenerate: Bool
    var speaking: Bool
    var showEditAsNew: Bool
    var showFailedSend: Bool = false
    var retryDisabled: Bool = false
    var showQuote: Bool = false
    let onCopy: () -> Void
    let onSpeak: () -> Void
    let onRegenerate: () -> Void
    let onEditAsNew: () -> Void
    var onRetry: () -> Void = {}
    var onRemove: () -> Void = {}
    var onQuote: (String) -> Void = { _ in }

    @ViewBuilder
    private var failedSendActions: some View {
        if showFailedSend {
            Button(FailedSend.retry) { onRetry() }
                .disabled(retryDisabled)
            Button(FailedSend.remove) { onRemove() }
        }
    }

    /// Long-press Quote only when this bubble is quotable and text is selected.
    @ViewBuilder
    private var quoteButton: some View {
        if showQuote, let selected = QuoteSelection.menuSelection() {
            Button(QuoteSelection.label) { onQuote(selected) }
        }
    }

    func body(content: Content) -> some View {
        if let stamp {
            let selectedQuote = showQuote ? QuoteSelection.menuSelection() : nil
            let hasActions = showCopy || showSpeak || showRegenerate || showFailedSend || showEditAsNew || selectedQuote != nil
            if hasActions {
                content.contextMenu {
                    Section {
                        if showCopy {
                            Button("Copy") { onCopy() }
                        }
                        if showSpeak {
                            Button(Speak.label(speaking)) { onSpeak() }
                        }
                        if showRegenerate {
                            Button("Regenerate") { onRegenerate() }
                        }
                        if showEditAsNew {
                            Button(RecallDraft.editAsNewMessage) { onEditAsNew() }
                        }
                        quoteButton
                        failedSendActions
                    } header: {
                        Text(stamp)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                content.contextMenu {
                    Button(stamp) {}
                        .disabled(true)
                }
            }
        } else if showCopy || showFailedSend || showEditAsNew || (showQuote && QuoteSelection.menuSelection() != nil) {
            content.contextMenu {
                if showCopy {
                    Button("Copy") { onCopy() }
                }
                if showEditAsNew {
                    Button(RecallDraft.editAsNewMessage) { onEditAsNew() }
                }
                quoteButton
                failedSendActions
            }
        } else {
            content
        }
    }
}

private struct AttachmentShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct HandoffTimelineRow: View {
    let message: Message
    let agents: [Agent]

    private var sender: Agent? {
        agents.first(where: { $0.id == message.senderId })
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            AgentAvatar(
                agent: sender ?? Agent(
                    id: message.senderId,
                    name: message.senderName,
                    title: "",
                    description: "",
                    avatar: message.senderAvatar,
                    kind: .agent,
                    memberIds: [],
                    sharedProject: false,
                    createdAt: .distantPast,
                    updatedAt: .distantPast
                ),
                size: 20
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(message.senderName)
                    .font(.system(size: 13, weight: .medium))
                Text("from \(message.senderName)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                FindHighlighted(
                    text: message.userAsk ?? message.content,
                    rowId: message.id,
                    lineLimit: 1
                )
                    .font(.system(size: 13))
                Text(repliesLabel(message.replyCount ?? 0))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func repliesLabel(_ count: Int) -> String {
        count == 1 ? "1 reply" : "\(count) replies"
    }

    /// Plain text beside a quote button. Find uses the full body above,
    /// so this copy does not carry a find range.
    private func userQuoteLabel(_ text: String, findable: Bool) -> some View {
        MentionLabel(
            text: text,
            names: agents.filter { !$0.isChannel }.map(\.name),
            links: true,
            findRowId: findable ? message.id : ""
        )
        .transcriptFont(14)
        .textSelection(.enabled)
        .frame(minWidth: 0, alignment: .leading)
    }
}
