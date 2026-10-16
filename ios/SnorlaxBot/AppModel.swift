// SPDX-License-Identifier: Apache-2.0
import Foundation
import Observation
import SwiftUI
import UIKit

/// Stream flags for one Send. Mutated from the SSE callback so a
/// pre-reply error is visible when the request returns. No timer.
private final class SendWatch: @unchecked Sendable {
    var sawReply = false
    var streamError: String?
    let beforeIDs: Set<String>

    init(beforeIDs: Set<String>) {
        self.beforeIDs = beforeIDs
    }

    func observe(_ event: RuntimeClient.StreamEvent) {
        switch event {
        case .delta(_, let text, _, _, _):
            if FailedSend.replyStarted(
                delta: text,
                isUser: false,
                isTool: false,
                isCard: false,
                content: ""
            ) {
                sawReply = true
            }
        case .tool:
            sawReply = true
        case .done(let saved):
            if FailedSend.replyStarted(
                delta: nil,
                isUser: saved.isFromUser,
                isTool: saved.isToolLine,
                isCard: saved.isWidget || saved.isConnect || saved.isApprove,
                content: saved.content
            ) {
                sawReply = true
            }
        case .error(let message):
            if !sawReply {
                streamError = message
            }
        default:
            break
        }
    }
}

@MainActor
@Observable
final class AppModel {
    private enum Keys {
        static let runtimeURL = "snorlax.runtimeURL"
        static let theme = "snorlax.theme"
        static let accent = "snorlax.accent"
    }

    /// Runtime URL. Loopback (`http://127.0.0.1:8787`, `http://localhost:8787`)
    /// is valid and persisted across launch.
    var runtimeURL: String {
        didSet { UserDefaults.standard.set(runtimeURL, forKey: Keys.runtimeURL) }
    }

    var token: String {
        didSet { KeychainStore.save(token) }
    }

    var theme: AppTheme {
        didSet { UserDefaults.standard.set(theme.rawValue, forKey: Keys.theme) }
    }

    var accent: AccentChoice {
        didSet { UserDefaults.standard.set(accent.rawValue, forKey: Keys.accent) }
    }

    var agents: [Agent] = []
    var selectedAgentID: String? {
        didSet {
            guard let id = selectedAgentID, id != oldValue else { return }
            clearReplyUnread(id)
        }
    }
    var navigationPath: [String] = []
    var messages: [Message] = [] {
        didSet {
            syncNewMessages(returning: newMessagesReturning)
            noteChatPreview()
        }
    }
    /// v0.80: last preview line per chat, from transcripts already in memory.
    var chatPreviews: [String: String] = [:]
    /// v0.83: latest-message createdAt per chat, already in memory.
    var chatActivity: [String: Date] = [:]
    /// v0.76: message id the New messages line sits above. Nil hides it.
    var newMessagesAnchorID: String?
    var toolTraces: [LiveToolTrace] = []
    var threadID: String?
    var unreadChannelIDs: Set<String> = []
    /// v0.70 persisted reply-unread roster ids. Handoff dots stay in `unreadChannelIDs`.
    var replyUnreadIDs: Set<String> = []
    /// v0.88: All shows every chat. Unread keeps rows that paint the accent dot.
    var chatListFilter: ChatListFilter.Mode = .all {
        didSet { ChatListFilter.write(chatListFilter) }
    }
    /// v1.05: the chat list is showing Archived instead of the main roster.
    /// Not persisted. Cleared when that list leaves the screen.
    var archiveListShowing = false
    /// v1.16: Archived list chrome. The sidebar Archived (n) control and
    /// ⌘⇧H both write this. Not persisted. Jump order reads
    /// `archiveListShowing`, which the list sets only while it is on screen.
    var showArchivedList = false
    /// The list and the open chat can both see one ⌘⇧H. The second
    /// delivery inside this window does not flap the list.
    private var archiveListChordAt: TimeInterval = 0
    /// Same slot delivered by the list and the chat within one keypress.
    private var jumpChordSlot = 0
    private var jumpChordAt: TimeInterval = 0
    /// The chat view and the composer can both see one ⌘⇧J. The second
    /// delivery inside this window does not open that chat again.
    private var nextUnreadChordId = ""
    private var nextUnreadChordAt: TimeInterval = 0
    /// v1.19: the chat list keeps keyboard focus after ⌘⇧S. iPad arrow
    /// selection must not yank focus back to the composer.
    var sidebarKeyboardFocus = false
    /// Bumped when ⌘⇧S asks the visible list to focus one row.
    var sidebarFocusRequest = 0
    var sidebarFocusChatID: String?
    /// The chat view and the composer can both see one ⌘⇧S.
    private var sidebarFocusChordAt: TimeInterval = 0
    /// The list and the open chat can both see one ⌘⇧O. The second
    /// delivery inside this window does not clear again.
    private var markAllReadChordAt: TimeInterval = 0
    /// v0.89: pinned chat ids, in the order they were pinned. UserDefaults.
    var pinnedChatIDs: [String] = [] {
        didSet { ChatPins.write(pinnedChatIDs) }
    }
    /// v0.95: local display names, keyed by chat id. UserDefaults.
    var chatNames: [String: String] = [:] {
        didSet { ChatNames.write(chatNames) }
    }
    /// v1.11: the chat whose list row is the inline rename field.
    /// Not persisted. A second keyboard start does not replace it.
    var renameChatID: String? = nil
    /// v0.96: archived chat ids. UserDefaults. Pin ids stay so Unarchive restores them.
    var archivedChatIDs: [String] = [] {
        didSet { ChatArchive.write(archivedChatIDs) }
    }
    /// v1.02: muted chat ids. UserDefaults. Messages still arrive.
    var mutedChatIDs: [String] = [] {
        didSet { ChatMute.write(mutedChatIDs) }
    }
    /// App scene is active. A backgrounded app is not focused on the open chat.
    var sceneFocused = true
    private var chatUnread = ChatUnread()
    /// v0.76: last seen message id per chat. UserDefaults.
    private var chatLastSeen = ChatLastSeen()
    private var newMessagesPlace = NewMessages.Place.fresh
    private var watchingNewMessages = false
    private var newMessagesReturning = false
    var lastExtraChannelID: String?
    var localPreviews: [String: [Data]] = [:]
    var draft = "" {
        didSet {
            if SkillPicker.query(in: draft) == nil {
                skillPickerDismissed = false
            }
            recallArmed = RecallDraft.armedAfterEdit(text: draft, wasArmed: recallArmed)
            if !suppressDraftPersist {
                persistOpenDraft()
            }
        }
    }
    /// v0.68: composer text came from recalling the latest user message.
    var recallArmed = false
    var pendingAttachments: [PendingChatAttachment] = []
    var attachError: String?
    var attachInFlight = 0
    var isSending = false
    /// v0.93: chat whose client-started assistant reply is still in flight.
    var generatingChatID: String?
    /// v0.78 failed Sends for this session. Not persisted. No HTTP.
    var failedSends: [FailedSendRecord] = []
    var hiddenOrphanIDs: Set<String> = []
    private var retryOverride: FailedSendRecord?
    var errorMessage: String?
    var composerError: String?
    var wantsComposerFocus = false
    /// Bumped on Send / Regenerate so the transcript snaps and re-arms stick.
    var stickBump = 0
    /// v0.74: session reading place per chat. Not persisted.
    private var readingPlaces: [String: ReadingPlace.Place] = [:]
    var pendingReadingKey: String?
    private(set) var readingTranscriptToken = 0
    private var readingLoadGeneration = 0
    /// True from the start of a chat switch until that transcript is restored.
    private var readingPublishLocked = false
    private var streamTask: Task<Void, Never>?
    private var streamEpoch = 0
    /// Unsent composer text per conversation. UserDefaults, per chat.
    private var chatDrafts = ChatDrafts()
    /// Chat the composer text belongs to. iPad's list binding updates
    /// `selectedAgentID` before adopt runs, so the draft must not follow it.
    private var composerAgentID: String?
    private var composerThreadID: String?
    private var suppressDraftPersist = false
    var showSettings = false
    var showProfile = false
    var routines: [Routine] = []
    var skills: [Skill] = []
    var memories: [String] = []
    var userMemories: [String] = []
    var composerSkills: [Skill] = []
    var skillPickerDismissed = false
    var plugins: [Plugin] = []
    var pluginCatalog: [PluginCatalogEntry] = []
    var computerPreview: ComputerPreview?
    var computerImage: UIImage?
    var computerTakeoverOpen = false
    var computerSessionId: String?
    var computerTakeoverAgentId: String?
    var dictation: Dictation.State = .idle
    var speakingMessageId: String?
    var composerCaret = 0
    var composerSelectionLength = 0
    private var dictationCapture = DictationCapture()
    private var dictationEpoch = 0
    private var speakPlayback = SpeakPlayback()
    private var speakEpoch = 0
    /// v1.04: collapses a held ⌘N and a second listener in the same moment.
    @ObservationIgnored private var newChatChordAt: TimeInterval = 0
    /// v1.15: the list and the chat can both see one ⌘⇧F. The second
    /// delivery inside this window does not flip the filter back.
    @ObservationIgnored private var filterChordAt: TimeInterval = 0
    /// v1.12: a delete already in flight must not start another.
    @ObservationIgnored private var deleteOpenChatBusy = false

    init() {
        runtimeURL = UserDefaults.standard.string(forKey: Keys.runtimeURL) ?? ""
        token = KeychainStore.load()
        theme = AppTheme(rawValue: UserDefaults.standard.string(forKey: Keys.theme) ?? "") ?? .system
        accent = AccentChoice(rawValue: UserDefaults.standard.string(forKey: Keys.accent) ?? "") ?? .teal
        chatListFilter = ChatListFilter.read()
        pinnedChatIDs = ChatPins.read()
        chatNames = ChatNames.read()
        archivedChatIDs = ChatArchive.read()
        mutedChatIDs = ChatMute.read()
        publishReplyUnread()
    }

    var isConfigured: Bool {
        !runtimeURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var client: RuntimeClient? {
        guard isConfigured,
              let url = RuntimeClient.normalizeBase(runtimeURL)
        else { return nil }
        return RuntimeClient(baseURL: url, token: token.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var canCompose: Bool {
        client != nil && !isSending && selectedAgent != nil && !computerTakeoverOpen
    }

    func stopGenerating() {
        guard isSending else { return }
        streamEpoch += 1
        streamTask?.cancel()
        if StopGenerating.shouldFocusComposerAfterAbort(
            hardwareKeyboardAttached: StopGenerating.hardwareKeyboardAttached
        ) {
            wantsComposerFocus = true
        }
    }

    /// Hardware Escape (UIKeyCommand). Same abort as tapping Stop.
    /// Esc implies a hardware keyboard — return focus to the composer.
    func stopGeneratingFromEscape(composing: Bool) {
        guard StopGenerating.escapeStops(
            busy: isSending,
            composing: composing,
            pendingWidget: StopGenerating.pendingWidget(in: messages),
            pendingApprove: StopGenerating.pendingApprove(in: messages),
            pendingConnect: StopGenerating.pendingConnect(in: messages)
        ) else { return }
        stopGenerating()
        if StopGenerating.shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true) {
            wantsComposerFocus = true
        }
    }

    /// v0.60: hardware Esc activates Jump when frozen (chip visible,
    /// not generating). Same skips as v0.53. Stop wins while in flight
    /// because `escapeJumps` is false when busy.
    /// v0.62: Esc implies a hardware keyboard — return focus after Jump.
    func jumpToLatestFromEscape(composing: Bool, showJump: Bool) {
        guard StickToBottom.escapeJumps(
            showJump: showJump,
            busy: isSending,
            composing: composing,
            pendingWidget: StopGenerating.pendingWidget(in: messages),
            pendingApprove: StopGenerating.pendingApprove(in: messages),
            pendingConnect: StopGenerating.pendingConnect(in: messages)
        ) else { return }
        stickBump += 1
        if StopGenerating.shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true) {
            wantsComposerFocus = true
        }
    }

    /// v0.68: hardware Up-arrow. Empty composer only; IME is filtered by the field.
    func recallLastSentFromArrowUp() {
        guard !computerTakeoverOpen else { return }
        guard RecallDraft.arrowUpRecalls(composerText: draft, composing: false) else { return }
        guard let text = latestRecallableUserText() else { return }
        draft = text
        recallArmed = true
        pendingComposerCaret = (text as NSString).length
    }

    /// v0.94: insert a `>` quote of the selection. Does not send.
    /// Keeps an existing draft and appends after a blank line.
    func quoteIntoComposer(_ selection: String) {
        guard !computerTakeoverOpen else { return }
        guard let next = QuoteSelection.append(draft: draft, selection: selection) else { return }
        draft = next.text
        pendingComposerCaret = next.caret
        wantsComposerFocus = true
    }

    /// v0.68: long-press "Edit as new message" on the latest user bubble.
    func editAsNewMessage(_ text: String) {
        guard !computerTakeoverOpen else { return }
        guard !text.isEmpty else { return }
        draft = text
        recallArmed = true
        pendingComposerCaret = (text as NSString).length
        wantsComposerFocus = true
    }

    /// Escape restores a recalled draft to empty. Stop / pending cards win.
    /// Returns true when this Escape was consumed.
    @discardableResult
    func clearRecallFromEscape(composing: Bool) -> Bool {
        guard !computerTakeoverOpen else { return false }
        guard RecallDraft.escapeClears(
            armed: recallArmed,
            composing: composing,
            busy: isSending,
            pendingWidget: StopGenerating.pendingWidget(in: messages),
            pendingApprove: StopGenerating.pendingApprove(in: messages),
            pendingConnect: StopGenerating.pendingConnect(in: messages)
        ) else { return false }
        draft = ""
        recallArmed = false
        pendingComposerCaret = 0
        return true
    }

    private func latestRecallableUserText() -> String? {
        guard let agent = selectedAgent else { return nil }
        let rows = visibleMessages(for: agent).map {
            RecallDraft.Row(
                fromUser: $0.isFromUser,
                kindMessage: $0.isKindMessage,
                content: $0.content
            )
        }
        return RecallDraft.latestText(in: rows)
    }

    var isAttaching: Bool { attachInFlight > 0 }

    var visibleAgents: [Agent] {
        if !isConfigured && agents.isEmpty {
            return [.placeholderChannel, .placeholder]
        }
        return agents
    }

    var selectedAgent: Agent? {
        let id = selectedAgentID
        return visibleAgents.first(where: { $0.id == id })
    }

    func bootstrap() async {
        guard isConfigured, let client else {
            agents = []
            retainChatPreviews()
            plugins = []
            pluginCatalog = []
            adoptComposerDraft(agentId: Agent.channelID, threadId: nil)
            selectedAgentID = Agent.channelID
            messages = []
            localPreviews = [:]
            navigationPath = []
            threadID = nil
            return
        }
        do {
            let roster = try await client.listAgents()
            agents = roster
            retainChatPins(against: roster)
            retainChatMutes(against: roster)
            retainChatArchives(against: roster)
            retainChatNames(against: roster)
            retainChatPreviews()
            plugins = (try? await client.listPlugins()) ?? []
            pluginCatalog = (try? await client.listPluginCatalog()) ?? []
            if let next = Agent.fallbackRosterSelection(in: roster) {
                await select(next.id, push: true)
                wantsComposerFocus = true
            } else {
                adoptComposerDraft(agentId: nil, threadId: nil)
                selectedAgentID = nil
                messages = []
                navigationPath = []
                threadID = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func select(_ id: String, push: Bool) async {
        await loadConversation(id, thread: nil, push: push)
    }

    /// Sidebar order after archive, then All / Unread, then the Pinned group.
    /// Archived chats are skipped. The name-search field does not change this order.
    func visibleChatOrder() -> [String] {
        let rows = visibleAgents.filter {
            !isChatArchived($0.id) &&
            ChatListFilter.includes(
                filter: chatListFilter,
                hasUnreadDot: showsUnreadDot($0)
            )
        }
        let grouped = ChatPins.grouped(rows, pinned: pinnedChatIDs) { $0.id }
        return grouped.pinned.map(\.id) + grouped.rest.map(\.id)
    }

    /// Same as opening that row: clears unread, restores the draft and
    /// reading place, then focuses the composer.
    func openAdjacentChat(direction: Int) {
        guard !computerTakeoverOpen else { return }
        guard let next = ChatNav.adjacent(
            ids: visibleChatOrder(),
            currentId: selectedAgentID,
            direction: direction
        ) else { return }
        Task {
            await select(next, push: true)
            wantsComposerFocus = true
        }
    }

    /// Visible jump order. The main roster matches Option+Up / Option+Down.
    /// The Archived screen replaces that roster. Section headers are not ids.
    func jumpChatIds() -> [String] {
        ChatJump.order(
            mainIds: visibleChatOrder(),
            archivedIds: archivedAgents.map(\.id),
            archiveListShowing: archiveListShowing,
            archiveReplacesMain: true
        )
    }

    /// v1.05: hardware ⌘1–⌘9 / ⌃1–⌃9. Same open as tapping the row,
    /// including the draft swap and composer focus. A slot past the
    /// visible count does nothing. ⌘9 is the last chat.
    func openChatAtJumpSlot(_ slot: Int) {
        guard !computerTakeoverOpen else { return }
        guard let id = ChatJump.target(ids: jumpChatIds(), slot: slot) else { return }
        let now = Date().timeIntervalSinceReferenceDate
        if slot == jumpChordSlot, now - jumpChordAt < 0.05 { return }
        jumpChordSlot = slot
        jumpChordAt = now
        Task {
            await select(id, push: true)
            wantsComposerFocus = true
        }
    }

    /// v1.17: hardware ⌘⇧J / ⌃⇧J. The next unread row after the open
    /// chat, in the same order as Option+Up / Option+Down and ⌘1–⌘9,
    /// wrapping. Same open as tapping the row, including the draft
    /// swap, the reading place, and composer focus. No unread row
    /// leaves the open chat put. The open chat is not selected again
    /// when it is the only unread row.
    func openNextUnreadChat() {
        guard !computerTakeoverOpen else { return }
        let ids = jumpChatIds()
        var unread = Set<String>()
        for id in ids {
            if let agent = agents.first(where: { $0.id == id }), showsUnreadDot(agent) {
                unread.insert(id)
            }
        }
        guard let next = NextUnreadChat.target(
            ids: ids,
            currentId: selectedAgentID,
            unread: unread
        ) else { return }
        let now = Date().timeIntervalSinceReferenceDate
        if next == nextUnreadChordId, now - nextUnreadChordAt < 0.05 { return }
        nextUnreadChordId = next
        nextUnreadChordAt = now
        Task {
            await select(next, push: true)
            wantsComposerFocus = true
        }
    }

    /// v1.19: hardware ⌘⇧S / ⌃⇧S. Focus the open chat's row when it is
    /// visible, otherwise the first visible row in the All / Unread,
    /// pin, and archive order. Does not open a different chat. iPhone
    /// shows the chat list. A second view that sees the same key does
    /// not move focus again. An empty list changes nothing. No HTTP.
    func focusSidebarListFromChord() {
        guard let id = FocusSidebarList.target(
            ids: jumpChatIds(),
            openID: selectedAgentID
        ) else { return }
        let now = Date().timeIntervalSinceReferenceDate
        if now - sidebarFocusChordAt < 0.05 { return }
        sidebarFocusChordAt = now
        sidebarKeyboardFocus = true
        sidebarFocusChatID = id
        sidebarFocusRequest += 1
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
        if UIDevice.current.userInterfaceIdiom != .pad {
            navigationPath = []
        }
    }

    /// v1.20: hardware ⌘⇧O / ⌃⇧O. The same clear as Mark all as read:
    /// every reply dot and every channel handoff dot, including
    /// archived chats. Nothing unread is a no-op. A second view that
    /// sees the same key does not clear again. No HTTP.
    func markAllChatsReadFromChord() {
        let now = Date().timeIntervalSinceReferenceDate
        if now - markAllReadChordAt < 0.05 { return }
        markAllReadChordAt = now
        guard hasAnyUnreadChat else { return }
        markAllChatsRead()
    }

    func openJump(channelId: String, threadId: String) async {
        guard agents.contains(where: { $0.id == channelId && $0.isChannel }) else {
            return
        }
        unreadChannelIDs.remove(channelId)
        await loadConversation(channelId, thread: threadId, push: true)
    }

    func closeThread() async {
        guard let id = selectedAgentID else { return }
        await loadConversation(id, thread: nil, push: false)
    }

    /// Save the open draft and show the draft for `agentId` + `threadId`.
    /// Does not change focus. Caret moves to the end of the loaded text.
    /// The composer owner is independent of `selectedAgentID` (iPad's list
    /// binding updates selection before this runs). Switching disarms
    /// recall so a restored draft is not wiped by Escape.
    private func adoptComposerDraft(agentId: String?, threadId: String?) {
        let next = chatDrafts.swap(
            fromAgentId: composerAgentID,
            fromThreadId: composerThreadID,
            text: draft,
            toAgentId: agentId,
            toThreadId: threadId
        )
        composerAgentID = agentId
        composerThreadID = threadId
        suppressDraftPersist = true
        draft = next
        suppressDraftPersist = false
        recallArmed = false
        pendingComposerCaret = next.utf16.count
    }

    /// The open chat's unsent text is part of the persisted map.
    private func persistOpenDraft() {
        let agentId = composerAgentID ?? selectedAgentID
        guard let agentId else { return }
        let ownedThread = composerAgentID == nil ? threadID : composerThreadID
        if composerAgentID == nil {
            composerAgentID = agentId
            composerThreadID = ownedThread
        }
        chatDrafts.set(agentId: agentId, threadId: ownedThread, text: draft)
    }

    /// Latest scroll position for the open chat. Ignored while a switch is in flight.
    func noteReadingPlace(
        agentId: String,
        threadId: String?,
        nearBottom: Bool,
        anchorId: String?,
        tailId: String?
    ) {
        if readingPublishLocked || pendingReadingKey != nil { return }
        let key = ReadingPlace.key(agentId: agentId, threadId: threadId)
        readingPlaces[key] = ReadingPlace.capture(
            nearBottom: nearBottom,
            anchorId: anchorId,
            tailId: tailId
        )
    }

    func readingPlace(for key: String) -> ReadingPlace.Place? {
        readingPlaces[key]
    }

    func consumeReadingRestore() {
        pendingReadingKey = nil
        readingPublishLocked = false
    }

    func loadConversation(_ id: String, thread: String?, push: Bool) async {
        readingPublishLocked = true
        let generation = readingLoadGeneration + 1
        readingLoadGeneration = generation
        if selectedAgentID != id || threadID != thread {
            showProfile = false
            cancelDictation()
            stopSpeaking()
        }
        adoptComposerDraft(agentId: id, threadId: thread)
        selectedAgentID = id
        threadID = thread
        attachError = nil
        pendingAttachments = []
        if push, navigationPath.last != id {
            navigationPath = [id]
        }
        clearReplyUnread(id)
        if visibleAgents.first(where: { $0.id == id })?.isChannel == true {
            unreadChannelIDs.remove(id)
            if id != Agent.channelID {
                lastExtraChannelID = id
            }
        }
        let rows: [Message]
        if isConfigured, let client {
            do {
                rows = try await client.listMessages(agentId: id, threadId: thread)
                prunePreviews()
            } catch {
                errorMessage = error.localizedDescription
                rows = []
            }
        } else {
            rows = []
            localPreviews = [:]
            composerSkills = []
        }
        guard generation == readingLoadGeneration else { return }
        watchingNewMessages = false
        newMessagesPlace = NewMessages.Place(
            key: ChatLastSeen.token(agentId: id, threadId: thread),
            placed: false,
            anchorId: nil
        )
        newMessagesAnchorID = nil
        newMessagesReturning = true
        messages = showListed(rows, agentId: id, threadId: thread)
        newMessagesReturning = false
        pendingReadingKey = ReadingPlace.key(agentId: id, threadId: thread)
        readingTranscriptToken += 1
        await loadComposerSkills()
    }

    func createAgent() async {
        guard let client else {
            showSettings = true
            return
        }
        do {
            let agent = try await client.createAgent(name: "New agent")
            agents.append(agent)
            await select(agent.id, push: true)
            wantsComposerFocus = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// v1.04: hardware ⌘N / ⌃N. Same create as the New agent menu item,
    /// including composer focus. A repeat or a second view that sees
    /// the same key does not create another agent.
    func createAgentFromChord() {
        guard isConfigured else { return }
        let now = Date().timeIntervalSinceReferenceDate
        if now - newChatChordAt < 0.4 { return }
        newChatChordAt = now
        Task { await createAgent() }
    }

    /// v1.15: the same All / Unread choice as the segmented control.
    /// All shows every chat. Unread keeps rows that paint the accent
    /// dot. Persistence stays on `chatListFilter`'s didSet. A second
    /// view that sees the same key does not flap. No HTTP.
    func toggleChatListFilterFromChord() {
        let now = Date().timeIntervalSinceReferenceDate
        if now - filterChordAt < 0.05 { return }
        filterChordAt = now
        chatListFilter = ChatListFilter.toggled(chatListFilter)
    }

    func createChannel(name: String, memberIds: [String]) async {
        guard let client else {
            showSettings = true
            return
        }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let channel = try await client.createChannel(name: trimmed, memberIds: memberIds)
            agents.append(channel)
            await select(channel.id, push: true)
            wantsComposerFocus = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Sidebar confirm passes no visible next and keeps nextRosterSelection.
    /// The keyboard chord passes the next Option+Up/Down row, or nil for
    /// the empty state, and still uses this same DELETE plus cleanup.
    func delete(
        _ agent: Agent,
        visibleNext: String? = nil,
        preferVisibleNext: Bool = false
    ) async {
        guard let client else { return }
        do {
            try await client.deleteAgent(id: agent.id)
            agents.removeAll { $0.id == agent.id }
            retainChatPreviews()
            unreadChannelIDs.remove(agent.id)
            _ = chatUnread.retain(Set(agents.map(\.id)))
            _ = chatLastSeen.retain(Set(agents.map(\.id)))
            retainChatPins(against: agents)
            retainChatMutes(against: agents)
            retainChatArchives(against: agents)
            retainChatNames(against: agents)
            publishReplyUnread()
            if lastExtraChannelID == agent.id {
                lastExtraChannelID = nil
            }
            for index in agents.indices where agents[index].isChannel {
                agents[index].memberIds.removeAll { $0 == agent.id }
            }
            let deletingOpen = preferVisibleNext
                ? (onScreenChatID() == agent.id || selectedAgentID == agent.id)
                : selectedAgentID == agent.id
            if deletingOpen {
                let nextId: String?
                if preferVisibleNext {
                    if let visibleNext, agents.contains(where: { $0.id == visibleNext }) {
                        nextId = visibleNext
                    } else {
                        nextId = nil
                    }
                } else {
                    nextId = Agent.nextRosterSelection(
                        in: agents,
                        removedId: agent.id,
                        currentId: selectedAgentID
                    )?.id
                }
                if let nextId {
                    await select(nextId, push: true)
                } else {
                    adoptComposerDraft(agentId: nil, threadId: nil)
                    selectedAgentID = nil
                    messages = []
                    navigationPath = []
                    threadID = nil
                }
            }
            showProfile = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// v1.12: keyboard delete. Same removal as confirming sidebar Delete.
    /// A repeat or a second call while that removal is in flight does nothing.
    /// The next open chat is the following visible row, or the empty state.
    func deleteOpenChat(_ id: String) {
        guard !id.isEmpty, !deleteOpenChatBusy else { return }
        guard isConfigured, client != nil else { return }
        guard let agent = agents.first(where: { $0.id == id }) else { return }
        let next = DeleteOpenChat.nextId(
            visibleIds: visibleChatOrder(),
            openId: onScreenChatID()
        )
        deleteOpenChatBusy = true
        Task {
            await delete(agent, visibleNext: next, preferVisibleNext: true)
            deleteOpenChatBusy = false
        }
    }

    func saveProfile(_ draft: Agent) async {
        guard let client else { return }
        let previousName = agents.first(where: { $0.id == draft.id })?.name
        do {
            let updated = try await client.patchAgent(
                draft.isChannel
                    ? AgentPatch(
                        name: draft.name,
                        memberIds: draft.memberIds,
                        sharedProject: draft.sharedProject
                    )
                    : AgentPatch(
                        name: draft.name,
                        title: draft.title,
                        description: draft.description,
                        avatar: draft.avatar
                    ),
                id: draft.id
            )
            if let index = agents.firstIndex(where: { $0.id == updated.id }) {
                agents[index] = updated
            } else {
                agents.append(updated)
            }
            if let previousName, updated.name != previousName {
                dropChatName(updated.id)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setSharedProject(id: String, on: Bool) async {
        guard let client else { return }
        do {
            let updated = try await client.patchAgent(
                AgentPatch(sharedProject: on),
                id: id
            )
            if let index = agents.firstIndex(where: { $0.id == updated.id }) {
                agents[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadRoutines(for agentId: String) async {
        guard let client,
              let agent = agents.first(where: { $0.id == agentId }),
              !agent.isChannel
        else {
            routines = []
            return
        }
        do {
            routines = try await client.listRoutines(agentId: agentId)
        } catch {
            routines = []
            errorMessage = error.localizedDescription
        }
    }

    func loadSkillsList(for agentId: String) async {
        guard let client,
              let agent = agents.first(where: { $0.id == agentId }),
              !agent.isChannel
        else {
            skills = []
            return
        }
        do {
            skills = try await client.listSkills(agentId: agentId)
        } catch {
            skills = []
            errorMessage = error.localizedDescription
        }
    }

    func loadMemories(for agentId: String) async {
        guard let client,
              let agent = agents.first(where: { $0.id == agentId }),
              !agent.isChannel
        else {
            memories = []
            return
        }
        do {
            memories = try await client.listMemory(agentId: agentId).facts
        } catch {
            memories = []
            errorMessage = error.localizedDescription
        }
    }

    func composerSkillAgentID() -> String? {
        SkillPicker.agentId(conversation: selectedAgent)
    }

    func loadComposerSkills() async {
        guard let client, let id = composerSkillAgentID() else {
            composerSkills = []
            return
        }
        do {
            composerSkills = try await client.listSkills(agentId: id)
        } catch {
            composerSkills = []
        }
    }

    func loadComputer(for agentId: String) async {
        guard let client,
              let agent = agents.first(where: { $0.id == agentId }),
              !agent.isChannel
        else {
            computerPreview = nil
            computerImage = nil
            return
        }
        do {
            let row = try await client.getComputer(agentId: agentId)
            computerPreview = row
            if row.hasSandbox,
               let path = row.imageUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty,
               let url = client.resolve(path)
            {
                let data = try await client.data(from: url)
                computerImage = UIImage(data: data)
            } else {
                computerImage = nil
            }
        } catch {
            computerPreview = ComputerPreview(hasSandbox: false, width: 1280, height: 800)
            computerImage = nil
        }
    }

    func openComputer(for agentId: String) async {
        guard let client,
              ComputerTakeoverChrome.openPostsSession(hasSandbox: computerPreview?.hasSandbox)
        else { return }
        do {
            let opened = try await client.openComputerSession(agentId: agentId)
            computerSessionId = opened.sessionId
            computerTakeoverAgentId = agentId
            computerTakeoverOpen = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func closeComputer(agentId: String) async {
        let sid = computerSessionId
        computerTakeoverOpen = false
        computerSessionId = nil
        computerTakeoverAgentId = nil
        guard let client else { return }
        do {
            try await client.closeComputerSession(agentId: agentId, sessionId: sid)
        } catch {
            /* already closed */
        }
        await loadComputer(for: agentId)
    }

    func postComputerPointer(agentId: String, event: PointerEvent) async {
        guard computerTakeoverOpen, let client else { return }
        do {
            try await client.postComputerPointer(agentId: agentId, event: event)
        } catch {
            /* session may have ended */
        }
    }

    func postComputerKey(agentId: String, event: KeyEvent) async {
        guard computerTakeoverOpen, let client else { return }
        do {
            try await client.postComputerKey(agentId: agentId, event: event)
        } catch {
            /* session may have ended */
        }
    }

    /// Record only inside an open takeover session (runtime 409 otherwise).
    func startComputerRecord(agentId: String) async -> Bool {
        guard ComputerTakeoverChrome.recordOffered(sessionOpen: computerTakeoverOpen),
              let client
        else { return false }
        do {
            let started = try await client.startComputerRecord(agentId: agentId)
            return started.recording
        } catch {
            /* no session / already recording */
            return false
        }
    }

    func stopComputerRecord(agentId: String) async {
        guard let client else { return }
        do {
            try await client.stopComputerRecord(agentId: agentId)
        } catch {
            /* already stopped */
        }
    }

    /// POST `/skills { name }` from the pending capture. Discard is skip this.
    func saveRecordedSkill(agentId: String, name: String) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ComputerTakeoverChrome.saveDisabled(name: trimmed),
              computerTakeoverOpen,
              let client
        else { return false }
        do {
            let created = try await client.createSkill(agentId: agentId, name: trimmed)
            if let index = skills.firstIndex(where: { $0.id == created.id }) {
                skills[index] = created
            } else {
                skills.append(created)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func setRoutineEnabled(agentId: String, id: String, enabled: Bool) async {
        guard let client else { return }
        do {
            let updated = try await client.patchRoutine(
                agentId: agentId,
                routineId: id,
                enabled: enabled
            )
            if let index = routines.firstIndex(where: { $0.id == updated.id }) {
                routines[index] = updated
            } else {
                routines.append(updated)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func addRoutine(
        agentId: String,
        name: String,
        skill: String,
        schedule: String?,
        webhook: Bool,
        slackChannel: String? = nil,
        githubRepo: String? = nil
    ) async -> Bool {
        guard let client else { return false }
        do {
            let body: RoutineCreate
            if let channel = slackChannel?.trimmingCharacters(in: .whitespacesAndNewlines),
               !channel.isEmpty
            {
                body = RoutineCreate(
                    name: name,
                    skill: skill,
                    trigger: RoutineTrigger(type: "slack", channel: channel)
                )
            } else if let repo = githubRepo?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !repo.isEmpty
            {
                body = RoutineCreate(
                    name: name,
                    skill: skill,
                    trigger: RoutineTrigger(type: "github", repo: repo)
                )
            } else if webhook {
                body = RoutineCreate(
                    name: name,
                    skill: skill,
                    trigger: RoutineTrigger(type: "webhook")
                )
            } else {
                body = RoutineCreate(name: name, skill: skill, schedule: schedule)
            }
            let created = try await client.createRoutine(agentId: agentId, body: body)
            if !routines.contains(where: { $0.id == created.id }) {
                routines.append(created)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func removeRoutine(agentId: String, id: String) async {
        guard let client else { return }
        do {
            try await client.deleteRoutine(agentId: agentId, routineId: id)
            routines.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadSkills(for agentId: String) async -> [Skill] {
        guard let client else { return [] }
        do {
            return try await client.listSkills(agentId: agentId)
        } catch {
            errorMessage = error.localizedDescription
            return []
        }
    }

    func loadSkill(agentId: String, id: String) async -> SkillBody? {
        guard let client else { return nil }
        do {
            return try await client.getSkill(agentId: agentId, skillId: id)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func addSkill(agentId: String, name: String, body: String) async -> Bool {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !trimmedBody.isEmpty, let client else { return false }
        do {
            let created = try await client.createSkill(
                agentId: agentId,
                name: trimmedName,
                body: trimmedBody
            )
            if let index = skills.firstIndex(where: { $0.id == created.id }) {
                skills[index] = created
            } else {
                skills.append(created)
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveSkill(agentId: String, id: String, name: String, body: String) async -> Bool {
        guard let client else { return false }
        do {
            let updated = try await client.patchSkill(
                agentId: agentId,
                skillId: id,
                body: SkillPatch(name: name, body: body)
            )
            if let index = skills.firstIndex(where: { $0.id == id || $0.id == updated.id }) {
                skills[index] = Skill(id: updated.id, name: updated.name)
            } else {
                skills.append(Skill(id: updated.id, name: updated.name))
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func removeSkill(agentId: String, id: String) async {
        guard let client else { return }
        do {
            try await client.deleteSkill(agentId: agentId, skillId: id)
            skills.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeMemory(agentId: String, fact: String) async {
        guard let client else { return }
        do {
            try await client.forgetMemory(agentId: agentId, fact: fact)
            memories.removeAll { $0 == fact }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadUserMemories() async {
        guard let client else {
            userMemories = []
            return
        }
        do {
            userMemories = try await client.listUserMemory().facts
        } catch {
            userMemories = []
            errorMessage = error.localizedDescription
        }
    }

    func removeUserMemory(fact: String) async {
        guard let client else { return }
        do {
            try await client.forgetUserMemory(fact: fact)
            userMemories.removeAll { $0 == fact }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func noteComposerSelection(_ range: NSRange) {
        composerCaret = range.location
        composerSelectionLength = range.length
    }

    func toggleDictation() async {
        if dictation == .processing { return }
        if dictation == .recording {
            await finishDictation()
            return
        }
        await startDictation()
    }

    /// Esc-equivalent. No POST /v1/transcribe. No insert.
    func cancelDictation() {
        guard Dictation.cancelable(dictation) else { return }
        dictationEpoch += 1
        dictationCapture.cancel()
        dictation = .idle
    }

    func startDictation() async {
        guard canCompose else { return }
        composerError = nil
        dictationEpoch += 1
        let epoch = dictationEpoch
        do {
            try await dictationCapture.start()
            guard epoch == dictationEpoch else { return }
            dictation = .recording
        } catch {
            guard epoch == dictationEpoch else { return }
            dictation = .idle
            composerError = Dictation.hintMicOff
        }
    }

    func finishDictation() async {
        guard dictation == .recording else { return }
        let epoch = dictationEpoch
        dictation = .processing
        let packet = dictationCapture.stop()
        guard epoch == dictationEpoch else { return }
        guard let packet else {
            dictation = .idle
            composerError = Dictation.hintNoSpeech
            return
        }
        guard let client else {
            dictation = .idle
            return
        }
        do {
            let result = try await client.transcribeAudio(
                fileName: packet.name,
                mime: packet.mime,
                data: packet.data
            )
            guard epoch == dictationEpoch else { return }
            let next = Dictation.insertTranscript(
                text: draft,
                caret: composerCaret,
                selectionLength: composerSelectionLength,
                transcript: result.text
            )
            draft = next.text
            composerCaret = next.caret
            composerSelectionLength = 0
            pendingComposerCaret = next.caret
            wantsComposerFocus = true
            composerError = nil
        } catch {
            guard epoch == dictationEpoch else { return }
            let message: String
            if let runtime = error as? RuntimeError, case .http(_, let body) = runtime {
                message = body
            } else {
                message = Dictation.errTranscribe
            }
            composerError = message == "No speech detected." ? Dictation.hintNoSpeech : message
        }
        dictation = .idle
    }

    func retryFailedSend(id: String) async {
        guard !FailedSend.retryBlocked(busy: isSending) else { return }
        guard !isAttaching else { return }
        guard let row = failedSends.first(where: { $0.id == id }) else { return }
        guard let agent = selectedAgent, row.agentId == agent.id, row.threadId == threadID else { return }
        retryOverride = row
        await send()
    }

    func send() async {
        let retry = retryOverride
        retryOverride = nil
        cancelDictation()
        dictationEpoch += 1
        guard let client, let agent = selectedAgent else { return }
        guard !isSending, !isAttaching else { return }
        if let retry {
            guard retry.agentId == agent.id, retry.threadId == threadID else { return }
        }
        isSending = true
        defer {
            isSending = false
            generatingChatID = nil
            if StopGenerating.shouldFocusComposerOnSettle() {
                wantsComposerFocus = true
            }
        }

        let content: String
        let chips: [PendingChatAttachment]
        let mentionIDs: [String]
        let user: Message
        let originAgentID = agent.id
        let originThreadID = threadID
        if let retry {
            content = retry.content
            mentionIDs = retry.mentionIds
            chips = retry.message.attachments.map {
                PendingChatAttachment(
                    id: $0.id,
                    kind: $0.kind,
                    name: $0.name,
                    url: $0.url,
                    size: $0.size,
                    previewData: nil,
                    posterImage: nil
                )
            }
            user = retry.message
            if let orphan = retry.orphanServerId {
                hiddenOrphanIDs.insert(orphan)
            }
            failedSends = FailedSend.dismiss(failedSends, id: retry.id)
        } else {
            content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
            chips = pendingAttachments
            guard !content.isEmpty || !chips.isEmpty else { return }
            guard attachError == nil else { return }
            mentionIDs = self.mentionIDs(in: content)
            chatDrafts.clear(agentId: originAgentID, threadId: originThreadID)
            draft = ""
            pendingComposerCaret = 0
            pickedMentions = [:]
            pendingAttachments = []
            attachError = nil
            composerError = nil
            user = Message.optimisticUser(
                agentId: agent.id,
                content: content,
                attachments: chips.map(\.asAttachment)
            )
            let previews = chips.compactMap(\.previewData)
            if !previews.isEmpty {
                localPreviews[user.id] = previews
            }
            messages = OptimisticSend.insert(messages, user)
        }
        generatingChatID = originAgentID
        wantsComposerFocus = true
        stickBump += 1
        newMessagesPlace = NewMessages.clear(newMessagesPlace)
        newMessagesAnchorID = nil
        watchingNewMessages = true
        toolTraces = []

        let watch = SendWatch(beforeIDs: Set(messages.map(\.id)))
        let epoch = streamEpoch
        let work = Task { @MainActor in
            do {
                try await client.sendMessage(
                    agentId: agent.id,
                    content: content,
                    images: [],
                    mentions: mentionIDs,
                    replyTo: agent.isChannel ? originThreadID : nil,
                    channelId: agent.isChannel ? nil : lastExtraChannelID,
                    attachmentIds: chips.map(\.id)
                ) { [weak self] event in
                    watch.observe(event)
                    if watch.streamError != nil, !watch.sawReply, case .error = event {
                        return
                    }
                    Task { @MainActor in
                        guard let self, self.streamEpoch == epoch else { return }
                        self.handle(
                            event,
                            agentId: agent.id,
                            mainTranscript: originThreadID == nil
                        )
                    }
                }
                if Task.isCancelled || self.streamEpoch != epoch { return }
                if FailedSend.isPreReplyFailure(sawReply: watch.sawReply, error: watch.streamError) {
                    var orphan: String?
                    if let listed = try? await client.listMessages(
                        agentId: originAgentID,
                        threadId: originThreadID
                    ) {
                        orphan = FailedSend.orphanUserID(
                            before: watch.beforeIDs,
                            listed: listed,
                            content: content
                        )
                    }
                    noteFailedSend(
                        user: user,
                        agentId: originAgentID,
                        threadId: originThreadID,
                        content: content,
                        chips: chips,
                        mentionIDs: mentionIDs,
                        orphan: orphan
                    )
                    return
                }
                if selectedAgentID == agent.id {
                    let listed = try await client.listMessages(agentId: agent.id, threadId: threadID)
                    messages = showListed(
                        OptimisticSend.reconcile(listed: listed),
                        agentId: agent.id,
                        threadId: threadID
                    )
                    toolTraces = []
                    prunePreviews()
                    if !agent.isChannel {
                        if let channelId = messages.compactMap({ $0.visibleJump(in: self.agents)?.channelId }).last,
                           ChatMute.replyMayMarkUnread(muted: isChatMuted(channelId)) {
                            unreadChannelIDs.insert(channelId)
                        }
                    }
                }
            } catch {
                if StopGenerating.isAbort(error) || Task.isCancelled || self.streamEpoch != epoch {
                    if !StopGenerating.shouldRefetchAfterStop() {
                        messages = StopGenerating.keepPartial(messages)
                    }
                    return
                }
                let status: Int
                if let runtime = error as? RuntimeError, case .http(let code, _) = runtime {
                    status = code
                } else {
                    status = 0
                }
                if status == 0 || OptimisticSend.isHttpSendFailure(status) {
                    var orphan: String?
                    if status == 0 || status >= 500 {
                        if let listed = try? await client.listMessages(
                            agentId: originAgentID,
                            threadId: originThreadID
                        ) {
                            orphan = FailedSend.orphanUserID(
                                before: watch.beforeIDs,
                                listed: listed,
                                content: content
                            )
                        }
                    }
                    noteFailedSend(
                        user: user,
                        agentId: originAgentID,
                        threadId: originThreadID,
                        content: content,
                        chips: chips,
                        mentionIDs: mentionIDs,
                        orphan: orphan
                    )
                } else {
                    errorMessage = error.localizedDescription
                }
            }
        }
        streamTask = work
        await work.value
        streamTask = nil
    }

    func dismissFailedSend(id: String) {
        guard let row = failedSends.first(where: { $0.id == id }) else { return }
        if let orphan = row.orphanServerId {
            hiddenOrphanIDs.insert(orphan)
        }
        failedSends = FailedSend.dismiss(failedSends, id: id)
        messages.removeAll { $0.id == id }
        localPreviews[id] = nil
    }

    func failedSend(id: String) -> FailedSendRecord? {
        failedSends.first { $0.id == id }
    }

    private func showListed(
        _ listed: [Message],
        agentId: String,
        threadId: String?
    ) -> [Message] {
        FailedSend.paint(
            listed: listed,
            failed: FailedSend.forChat(failedSends, agentId: agentId, threadId: threadId),
            hidden: hiddenOrphanIDs
        )
    }

    private func noteFailedSend(
        user: Message,
        agentId: String,
        threadId: String?,
        content: String,
        chips: [PendingChatAttachment],
        mentionIDs: [String],
        orphan: String?
    ) {
        if let orphan {
            hiddenOrphanIDs.insert(orphan)
        }
        let record = FailedSendRecord(
            id: user.id,
            agentId: agentId,
            threadId: threadId,
            content: content,
            attachmentIds: chips.map(\.id),
            mentionIds: mentionIDs,
            message: user,
            orphanServerId: orphan
        )
        failedSends = FailedSend.mark(failedSends, record)
        if selectedAgentID == agentId && self.threadID == threadId {
            if !messages.contains(where: { $0.id == user.id }) {
                messages.append(user)
            }
        }
    }


    func answerWidget(id: String, values: [String]) async {
        await streamAnswer(widgetReply: WidgetReply(id: id, values: values))
    }

    func dismissWidget(id: String) async {
        await streamAnswer(widgetReply: WidgetReply(id: id, dismissed: true))
    }

    func answerApprove(id: String) async {
        await streamAnswer(approveReply: ApproveReply(id: id, approved: true))
    }

    func denyApprove(id: String) async {
        await streamAnswer(approveReply: ApproveReply(id: id, dismissed: true))
    }

    func refreshPlugins() async {
        guard let client else {
            plugins = []
            pluginCatalog = []
            return
        }
        plugins = (try? await client.listPlugins()) ?? []
        pluginCatalog = (try? await client.listPluginCatalog()) ?? []
    }

    func connectPlugin(id: String) async -> Bool {
        guard let client else { return false }
        do {
            let auth = try await client.startPluginAuth(id: id)
            let url = URL(string: auth.authorizationUrl) ?? client.resolve(auth.authorizationUrl)
            guard let url else { return false }
            Task { await PluginBrowser.open(url) }
            let connected = await waitUntilPluginConnected(id: id)
            await refreshPlugins()
            return connected
        } catch {
            composerError = error.localizedDescription
            return false
        }
    }

    func addPlugin(name: String, command: String?, args: String, url: String?) async -> Bool {
        guard let client else { return false }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            composerError = "Plugin name is required."
            return false
        }
        do {
            let body: PluginCreate
            if let command {
                let cmd = command.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cmd.isEmpty else {
                    composerError = "Command is required."
                    return false
                }
                let parts = args.split(whereSeparator: \.isWhitespace).map(String.init)
                body = PluginCreate(
                    name: trimmed,
                    transport: .stdio,
                    command: cmd,
                    args: parts.isEmpty ? nil : parts
                )
            } else if let url {
                let value = url.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !value.isEmpty else {
                    composerError = "URL is required."
                    return false
                }
                body = PluginCreate(name: trimmed, transport: .url, url: value)
            } else {
                composerError = "Command or URL is required."
                return false
            }
            _ = try await client.createPlugin(body)
            await refreshPlugins()
            return true
        } catch {
            composerError = error.localizedDescription
            return false
        }
    }

    func addCatalogPlugin(_ entry: PluginCatalogEntry) async -> Bool {
        guard let client else { return false }
        do {
            let transport: PluginCreate.Transport
            switch entry.transport {
            case .url:
                transport = .url
            case .stdio:
                transport = .stdio
            }
            let body = PluginCreate(
                name: entry.name,
                transport: transport,
                command: entry.command,
                args: entry.args,
                url: entry.url
            )
            _ = try await client.createPlugin(body)
            await refreshPlugins()
            return true
        } catch {
            composerError = error.localizedDescription
            return false
        }
    }

    func removePlugin(id: String) async {
        guard let client else { return }
        do {
            try await client.deletePlugin(id: id)
            await refreshPlugins()
        } catch {
            composerError = error.localizedDescription
        }
    }

    func answerConnect(id: String, pluginId: String) async {
        await streamAnswer(connectReply: ConnectReply(id: id))
        _ = await waitUntilPluginConnected(id: pluginId)
        await refreshPlugins()
        await refreshMessages()
    }

    func dismissConnect(id: String) async {
        await streamAnswer(connectReply: ConnectReply(id: id, dismissed: true))
    }

    func stopSpeaking() {
        speakEpoch += 1
        speakPlayback.stop()
        speakingMessageId = nil
    }

    func toggleSpeak(message: Message) async {
        // User tap only. Do not start playback from SSE, message done, or history load.
        if speakingMessageId == message.id {
            stopSpeaking()
            return
        }
        stopSpeaking()
        guard let client else { return }
        let text = Speak.spokenText(message.content)
        let epoch = speakEpoch
        do {
            let data = try await client.speak(text: text)
            guard epoch == speakEpoch else { return }
            speakPlayback.onEnd = { [weak self] in
                Task { @MainActor in
                    if self?.speakEpoch == epoch {
                        self?.stopSpeaking()
                    }
                }
            }
            try speakPlayback.play(data)
            speakingMessageId = message.id
        } catch {
            if epoch == speakEpoch {
                stopSpeaking()
                if let runtime = error as? RuntimeError, case .http(_, let message) = runtime {
                    composerError = message
                } else {
                    composerError = error.localizedDescription
                }
            }
        }
    }

    func regenerate() async {
        guard let client, let agent = selectedAgent, !agent.isChannel, !isSending else { return }
        composerError = nil
        stickBump += 1
        dropLastAssistantTurn()
        toolTraces = []
        isSending = true
        generatingChatID = agent.id
        defer {
            isSending = false
            generatingChatID = nil
        }
        let epoch = streamEpoch
        let work = Task { @MainActor in
            do {
                try await client.sendMessage(
                    agentId: agent.id,
                    content: "",
                    images: [],
                    replyTo: nil,
                    channelId: lastExtraChannelID,
                    regenerate: true
                ) { [weak self] event in
                    Task { @MainActor in
                        guard let self, self.streamEpoch == epoch else { return }
                        self.handle(event, agentId: agent.id, mainTranscript: true)
                    }
                }
                if Task.isCancelled || self.streamEpoch != epoch { return }
                if selectedAgentID == agent.id {
                    messages = showListed(
                        try await client.listMessages(agentId: agent.id, threadId: threadID),
                        agentId: agent.id,
                        threadId: threadID
                    )
                    toolTraces = []
                    prunePreviews()
                }
            } catch {
                if StopGenerating.isAbort(error) || Task.isCancelled || self.streamEpoch != epoch {
                    if !StopGenerating.shouldRefetchAfterStop() {
                        messages = StopGenerating.keepPartial(messages)
                    }
                    return
                }
                if let runtime = error as? RuntimeError, case .http(_, let message) = runtime {
                    composerError = message
                } else {
                    errorMessage = error.localizedDescription
                }
                await refreshMessages()
            }
        }
        streamTask = work
        await work.value
        streamTask = nil
    }

    private func dropLastAssistantTurn() {
        guard let lastUser = messages.lastIndex(where: { $0.isFromUser && $0.isKindMessage }) else {
            return
        }
        let head = Array(messages[...lastUser])
        let rest = messages[(lastUser + 1)...]
        messages = head + rest.filter { msg in
            if msg.isToolLine { return false }
            if !msg.isFromUser && msg.isKindMessage && !msg.isWidget && !msg.isConnect && !msg.isHandoffRoot {
                return false
            }
            return true
        }
    }

    private func waitUntilPluginConnected(id: String, timeoutNs: UInt64 = 60_000_000_000) async -> Bool {
        guard let client else { return false }
        let start = DispatchTime.now().uptimeNanoseconds
        while DispatchTime.now().uptimeNanoseconds - start < timeoutNs {
            if Task.isCancelled { return false }
            if let rows = try? await client.listPlugins(),
               rows.contains(where: { $0.id == id && $0.status == .connected })
            {
                return true
            }
            try? await Task.sleep(nanoseconds: 400_000_000)
        }
        return false
    }

    private func streamAnswer(widgetReply: WidgetReply? = nil, connectReply: ConnectReply? = nil, approveReply: ApproveReply? = nil) async {
        guard let client, let agent = selectedAgent, !isSending else { return }
        composerError = nil
        toolTraces = []
        isSending = true
        generatingChatID = agent.id
        defer {
            isSending = false
            generatingChatID = nil
        }
        let epoch = streamEpoch
        let mainTranscript = threadID == nil
        let work = Task { @MainActor in
            do {
                try await client.sendMessage(
                    agentId: agent.id,
                    content: "",
                    images: [],
                    replyTo: agent.isChannel ? threadID : nil,
                    channelId: agent.isChannel ? nil : lastExtraChannelID,
                    widgetReply: widgetReply,
                    connectReply: connectReply,
                    approveReply: approveReply
                ) { [weak self] event in
                    Task { @MainActor in
                        guard let self, self.streamEpoch == epoch else { return }
                        self.handle(
                            event,
                            agentId: agent.id,
                            mainTranscript: mainTranscript
                        )
                    }
                }
                if Task.isCancelled || self.streamEpoch != epoch { return }
                if selectedAgentID == agent.id {
                    messages = showListed(
                        try await client.listMessages(agentId: agent.id, threadId: threadID),
                        agentId: agent.id,
                        threadId: threadID
                    )
                    toolTraces = []
                    prunePreviews()
                }
            } catch {
                if StopGenerating.isAbort(error) || Task.isCancelled || self.streamEpoch != epoch {
                    if !StopGenerating.shouldRefetchAfterStop() {
                        messages = StopGenerating.keepPartial(messages)
                    }
                    return
                }
                if let runtime = error as? RuntimeError, case .http(_, let message) = runtime {
                    composerError = message
                } else {
                    errorMessage = error.localizedDescription
                }
                await refreshMessages()
            }
        }
        streamTask = work
        await work.value
        streamTask = nil
    }

    func refreshMessages() async {
        guard let client, let id = selectedAgentID, isConfigured else { return }
        do {
            let rows = try await client.listMessages(agentId: id, threadId: threadID)
            newMessagesReturning = true
            messages = showListed(rows, agentId: id, threadId: threadID)
            newMessagesReturning = false
            prunePreviews()
        } catch {
            newMessagesReturning = false
            errorMessage = error.localizedDescription
        }
    }

    func refreshRosterQuietly() async {
        guard let client, isConfigured else { return }
        do {
            agents = try await client.listAgents()
            retainChatPins(against: agents)
            retainChatMutes(against: agents)
            retainChatArchives(against: agents)
            retainChatNames(against: agents)
            retainChatPreviews()
        } catch {
            /* keep current roster */
        }
    }

    static func isMemoryToolLine(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed == "Remembered" || trimmed == "Forgot"
    }

    /// Open agent pane only. Closed pane does not poll. 1:1 Remembered / Forgot.
    private func refreshOpenMemory(from text: String) {
        guard showProfile,
              let agent = selectedAgent,
              !agent.isChannel,
              Self.isMemoryToolLine(text)
        else { return }
        Task { await loadMemories(for: agent.id) }
    }

    /// Open Settings only. Any Remembered / Forgot — GET /v1/memory is
    /// user-only, so an agent-scope write is a no-op list. Do not
    /// special-case user scope. Closed Settings does not poll.
    private func refreshOpenUserMemory(from text: String) {
        guard showSettings, Self.isMemoryToolLine(text) else { return }
        Task { await loadUserMemories() }
    }

    func handleSceneActive() async {
        guard isConfigured else { return }
        if agents.isEmpty {
            await bootstrap()
        } else {
            await refreshMessages()
        }
    }

    /// v0.70: scene active means the open chat is focused. Inactive marks
    /// a finished reply unread even on the chat that is on screen.
    func setSceneFocused(_ focused: Bool) {
        let was = sceneFocused
        sceneFocused = focused
        guard focused else {
            watchingNewMessages = false
            return
        }
        guard let id = onScreenChatID() else { return }
        clearReplyUnread(id)
        if !was {
            watchingNewMessages = false
            syncNewMessages(returning: true)
        }
    }

    func isChatPinned(_ id: String) -> Bool {
        pinnedChatIDs.contains(id)
    }

    func isChatArchived(_ id: String) -> Bool {
        ChatArchive.contains(archivedChatIDs, id: id)
    }

    func isChatMuted(_ id: String) -> Bool {
        mutedChatIDs.contains(id)
    }

    /// Mute clears the current dot. Later replies do not mark it.
    /// Unmute does not invent a dot. Opening the chat still works.
    func toggleChatMute(_ id: String) {
        guard !id.isEmpty else { return }
        let muting = !isChatMuted(id)
        mutedChatIDs = ChatMute.toggle(mutedChatIDs, id: id)
        if muting {
            _ = chatUnread.clear(id)
            unreadChannelIDs.remove(id)
        }
        publishReplyUnread()
    }

    /// A chat that left the roster loses its mute.
    private func retainChatMutes(against roster: [Agent]) {
        let next = ChatMute.retain(mutedChatIDs, keep: Set(roster.map(\.id)))
        if next != mutedChatIDs {
            mutedChatIDs = next
        }
    }

    /// v1.16: same open/close as the Archived (n) control. A second
    /// delivery of the same chord does not flap. Nothing opens when
    /// no chat is archived and the list is already closed.
    func toggleArchivedListFromChord() {
        let now = Date().timeIntervalSinceReferenceDate
        if now - archiveListChordAt < 0.05 { return }
        archiveListChordAt = now
        showArchivedList = ArchiveListKey.nextOpen(
            open: showArchivedList,
            archivedCount: archivedAgents.count
        )
    }

    /// Archived chats still on the roster, in roster order. Pins are kept but not shown here.
    var archivedAgents: [Agent] {
        visibleAgents.filter { isChatArchived($0.id) }
    }

    /// Archive removes the row now. The open chat moves to the next
    /// visible row (Option+Down order) or the empty state. A new reply
    /// later still marks unread and does not unarchive.
    func archiveChat(_ id: String) {
        guard !id.isEmpty, !isChatArchived(id) else { return }
        let open = onScreenChatID()
        let next = ChatArchive.selectionAfterArchive(
            visibleIds: visibleChatOrder(),
            openId: open,
            archivedId: id
        )
        let updated = ChatArchive.archive(archivedChatIDs, id: id)
        if updated != archivedChatIDs {
            archivedChatIDs = updated
        }
        guard open == id else { return }
        if let next {
            // Move off this chat before the transcript load so a reply
            // that finishes now still marks unread and stays archived.
            selectedAgentID = next
            navigationPath = [next]
            Task {
                await select(next, push: true)
                wantsComposerFocus = true
            }
        } else {
            adoptComposerDraft(agentId: nil, threadId: nil)
            selectedAgentID = nil
            messages = []
            navigationPath = []
            threadID = nil
        }
    }

    /// Unarchive restores pin and recency order. The open chat stays open.
    func unarchiveChat(_ id: String) {
        let updated = ChatArchive.unarchive(archivedChatIDs, id: id)
        if updated != archivedChatIDs {
            archivedChatIDs = updated
        }
    }

    /// A chat that left the roster loses its archive mark.
    private func retainChatArchives(against roster: [Agent]) {
        let next = ChatArchive.retain(archivedChatIDs, keep: Set(roster.map(\.id)))
        if next != archivedChatIDs {
            archivedChatIDs = next
        }
    }

    func toggleChatPin(_ id: String) {
        pinnedChatIDs = ChatPins.toggle(pinnedChatIDs, id: id)
    }

    func chatDisplayName(for agent: Agent) -> String {
        ChatNames.displayName(chatNames, id: agent.id, serverName: agent.name)
    }

    func commitChatName(_ id: String, draft: String, serverName: String) {
        chatNames = ChatNames.commit(chatNames, id: id, draft: draft, serverName: serverName)
    }

    /// v1.11: keyboard rename. The list's inline field is the editor.
    /// A rename already in progress does not start another and does not
    /// reset the draft. On iPhone the list comes forward so that field
    /// is on screen. No HTTP.
    func beginRenameOpenChat(_ id: String) {
        guard !id.isEmpty else { return }
        if renameChatID != nil { return }
        if !isChatArchived(id), chatListFilter == .unread {
            if let agent = agents.first(where: { $0.id == id }) {
                if !showsUnreadDot(agent) {
                    chatListFilter = .all
                }
            } else {
                chatListFilter = .all
            }
        }
        renameChatID = id
        if !navigationPath.isEmpty {
            navigationPath = []
        }
    }

    /// Sidebar Rename. May move the inline field to another row.
    func noteListRename(_ id: String) {
        guard !id.isEmpty else { return }
        renameChatID = id
    }

    /// The inline field committed or cancelled. Another row's rename stays.
    func endRename(_ id: String) {
        guard renameChatID == id else { return }
        renameChatID = nil
    }

    private func dropChatName(_ id: String) {
        let next = ChatNames.clear(chatNames, id: id)
        if next != chatNames {
            chatNames = next
        }
    }

    /// A chat that left the roster loses its display name.
    private func retainChatNames(against roster: [Agent]) {
        let next = ChatNames.retain(chatNames, keep: Set(roster.map(\.id)))
        if next != chatNames {
            chatNames = next
        }
    }

    /// v1.01: true when any reply or handoff unread remains, including archived chats.
    var hasAnyUnreadChat: Bool {
        ChatUnread.anyChatUnread(reply: replyUnreadIDs, handoff: unreadChannelIDs)
    }

    /// Clears every unread dot. Archived chats in the persisted set are
    /// cleared too and stay archived. Channel handoff dots leave as well.
    /// Pins, names, and the All / Unread choice stay. No new storage key.
    func markAllChatsRead() {
        let cleared = chatUnread.clearAll()
        if !unreadChannelIDs.isEmpty {
            unreadChannelIDs = []
        }
        if cleared {
            publishReplyUnread()
        }
    }

    /// v0.90: manual unread uses the same persisted reply-unread set.
    /// Mark as read also drops a channel handoff dot. Pins stay put.
    func toggleChatRead(_ id: String) {
        guard !id.isEmpty else { return }
        let shows: Bool
        if let agent = agents.first(where: { $0.id == id }) {
            shows = showsUnreadDot(agent)
        } else {
            shows = replyUnreadIDs.contains(id) || unreadChannelIDs.contains(id)
        }
        if shows {
            let cleared = chatUnread.clear(id)
            unreadChannelIDs.remove(id)
            if cleared {
                publishReplyUnread()
            }
            return
        }
        guard ChatMute.replyMayMarkUnread(muted: isChatMuted(id)) else { return }
        guard chatUnread.mark(id) else { return }
        publishReplyUnread()
    }

    /// A chat that left the roster loses its pin. Order of the rest stays.
    private func retainChatPins(against roster: [Agent]) {
        let next = ChatPins.retain(pinnedChatIDs, keep: Set(roster.map(\.id)))
        if next != pinnedChatIDs {
            pinnedChatIDs = next
        }
    }

    func showsUnreadDot(_ agent: Agent) -> Bool {
        ChatMute.paintsUnreadAccent(
            muted: isChatMuted(agent.id),
            wouldPaint: ChatUnread.showsDot(
                chatId: agent.id,
                replyUnread: replyUnreadIDs,
                handoffUnread: unreadChannelIDs,
                channel: agent.isChannel
            )
        )
    }

    private func onScreenChatID() -> String? {
        ChatUnread.onScreenChatID(
            pad: UIDevice.current.userInterfaceIdiom == .pad,
            selectedID: selectedAgentID,
            navigationLast: navigationPath.last
        )
    }

    private func clearReplyUnread(_ id: String) {
        guard chatUnread.clear(id) else { return }
        publishReplyUnread()
    }

    /// v0.77: the chat-list title reads this set. The icon badge
    /// follows only when badge permission is already granted.
    private func publishReplyUnread() {
        replyUnreadIDs = chatUnread.snapshot
        replyUnreadIDs = ChatMute.audible(replyUnreadIDs, muted: mutedChatIDs)
        let count = UnreadOutside.count(replyUnreadIDs)
        Task { await UnreadOutside.applyIconBadge(count: count) }
    }

    /// v0.76: open or return computes the line once. Watching advances
    /// last seen and leaves the line where it is. Unfocused or off-screen
    /// freezes last seen, the same condition as the unread dot.
    private func syncNewMessages(returning: Bool) {
        guard let id = onScreenChatID() else {
            watchingNewMessages = false
            return
        }
        guard sceneFocused else {
            watchingNewMessages = false
            return
        }
        let key = ChatLastSeen.token(agentId: id, threadId: threadID)
        if returning || !newMessagesPlace.placed || newMessagesPlace.key != key {
            let agent = selectedAgent
            let rows = messages.map { message in
                NewMessages.Row(
                    id: message.id,
                    anchor: NewMessages.anchors(
                        fromUser: message.isFromUser,
                        kindMessage: message.isKindMessage,
                        hasToken: !message.content.isEmpty || !message.attachments.isEmpty,
                        collapsedTool: message.isToolLine,
                        visible: agent.map { Self.messageVisible($0, message) } ?? true
                    )
                )
            }
            let next = NewMessages.place(
                place: newMessagesPlace,
                key: key,
                rows: rows,
                lastSeenId: chatLastSeen.messageID(agentId: id, threadId: threadID),
                returning: true
            )
            newMessagesPlace = next
            newMessagesAnchorID = next.anchorId
        }
        watchingNewMessages = true
        if let tail = messages.last?.id, !tail.isEmpty {
            chatLastSeen.see(agentId: id, threadId: threadID, messageId: tail)
        }
    }

    private static func messageVisible(_ agent: Agent, _ message: Message) -> Bool {
        if agent.isChannel { return true }
        return message.isFromUser || message.senderId == agent.id
    }

    /// v0.91: last-message preview, or a Draft: hint when this chat is not
    /// the one on screen and its top-level composer draft has visible text.
    /// v0.93: Typing… while this chat's reply is in flight. Draft: still wins.
    func chatListPreview(for agentId: String, lastMessage: String?) -> ChatGenerating.Row? {
        ChatGenerating.line(
            chatId: agentId,
            openChatId: onScreenChatID(),
            draft: chatDrafts.text(agentId: agentId, threadId: nil),
            lastMessage: lastMessage,
            generating: generatingChatID == agentId
        )
    }

    /// v0.80: snapshot the open main transcript. A thread does not replace the channel row.
    private func noteChatPreview() {
        guard let id = selectedAgentID, !id.isEmpty else { return }
        guard LastMessagePreview.snapshotMainTranscript(threadID) else { return }
        guard LastMessagePreview.owns(chatId: id, messages: messages) else { return }
        storeChatPreview(chatId: id, messages: messages)
        storeChatActivity(chatId: id, messages: messages)
    }

    /// A finished message the client already has, even if that chat is no longer open.
    private func noteFinishedPreview(chatId: String, message: Message) {
        guard !chatId.isEmpty else { return }
        guard let line = LastMessagePreview.line(from: [message]) else { return }
        if LastMessagePreview.isPreferred(message.kind) {
            if chatPreviews[chatId] != line {
                chatPreviews[chatId] = line
            }
            return
        }
        if chatPreviews[chatId] == nil {
            chatPreviews[chatId] = line
        }
    }

    private func storeChatPreview(chatId: String, messages: [Message]) {
        if let line = LastMessagePreview.line(from: messages) {
            if chatPreviews[chatId] != line {
                chatPreviews[chatId] = line
            }
        } else if chatPreviews[chatId] != nil {
            chatPreviews.removeValue(forKey: chatId)
        }
    }

    private func retainChatPreviews() {
        let ids = Set(agents.map(\.id))
        chatPreviews = chatPreviews.filter { ids.contains($0.key) }
        chatActivity = chatActivity.filter { ids.contains($0.key) }
    }

    /// Latest message in the open main transcript. A thread does not replace the channel row.
    private func storeChatActivity(chatId: String, messages: [Message]) {
        guard !chatId.isEmpty else { return }
        if let stamp = messages.last?.createdAt {
            if chatActivity[chatId] != stamp {
                chatActivity[chatId] = stamp
            }
        } else if chatActivity[chatId] != nil {
            chatActivity.removeValue(forKey: chatId)
        }
    }

    /// A finished message the client already has, even if that chat is no longer open.
    /// An older stamp does not move the row backward.
    private func noteFinishedActivity(chatId: String, createdAt: Date) {
        guard !chatId.isEmpty else { return }
        if let prev = chatActivity[chatId], prev > createdAt { return }
        if chatActivity[chatId] != createdAt {
            chatActivity[chatId] = createdAt
        }
    }

    private func noteFinishedAssistantReply(chatId: String, message: Message) {
        guard ChatMute.replyMayMarkUnread(muted: isChatMuted(chatId)) else { return }
        let reply = ChatUnread.ReplySnapshot(
            fromUser: message.isFromUser,
            kindMessage: message.isKindMessage,
            hasToken: !message.content.isEmpty || !message.attachments.isEmpty
        )
        guard ChatUnread.isFinishedAssistantReply(reply) else { return }
        guard ChatUnread.replyMarksUnread(
            chatId: chatId,
            openChatId: onScreenChatID(),
            focused: sceneFocused
        ) else { return }
        guard chatUnread.mark(chatId) else { return }
        publishReplyUnread()
    }

    private func handle(_ event: RuntimeClient.StreamEvent, agentId: String, mainTranscript: Bool) {
        if case .done(let message) = event {
            noteFinishedAssistantReply(chatId: agentId, message: message)
            if mainTranscript {
                let channel = agents.first(where: { $0.id == agentId })?.isChannel == true
                if !(channel && message.replyTo != nil) {
                    noteFinishedPreview(chatId: agentId, message: message)
                    noteFinishedActivity(chatId: agentId, createdAt: message.createdAt)
                }
            }
        }
        guard selectedAgentID == agentId else { return }
        let onTimeline = selectedAgent?.isChannel == true && threadID == nil
        switch event {
        case .delta(let id, let text, let senderId, let senderName, let senderAvatar):
            if onTimeline { return }
            if let index = messages.firstIndex(where: { $0.id == id }) {
                messages[index].content += text
            } else {
                if text.isEmpty { return }
                let agent = selectedAgent
                messages.append(.streamingAssistant(
                    id: id,
                    agentId: agentId,
                    content: text,
                    senderId: senderId ?? agent?.id ?? agentId,
                    senderName: senderName ?? agent?.name ?? "Agent",
                    senderAvatar: senderAvatar ?? agent?.avatar
                ))
            }
        case .done(let message):
            if onTimeline, message.replyTo != nil { return }
            if WaitingChrome.isEmptyAssistantReply(
                isUser: message.isFromUser,
                isKindMessage: message.isKindMessage,
                content: message.content,
                attachmentCount: message.attachments.count
            ) {
                messages.removeAll { $0.id == message.id }
                return
            }
            if message.isFromUser {
                messages = OptimisticSend.absorb(messages, incoming: message)
            } else if let index = messages.firstIndex(where: { $0.id == message.id }) {
                messages[index] = message
            } else {
                messages.append(message)
            }
            if message.kind == .tool {
                toolTraces.removeAll { $0.id == message.id }
                refreshOpenMemory(from: message.content)
                refreshOpenUserMemory(from: message.content)
            }
        case .error(let message):
            errorMessage = message
        case .tool(let id, let name, let summary, let done, let senderId, let senderName):
            if onTimeline { return }
            if let index = toolTraces.firstIndex(where: { $0.id == id }) {
                toolTraces[index].summary = summary
                if let senderId { toolTraces[index].senderId = senderId }
                if let senderName { toolTraces[index].senderName = senderName }
            } else {
                toolTraces.append(
                    LiveToolTrace(
                        id: id,
                        summary: summary,
                        senderId: senderId,
                        senderName: senderName
                    )
                )
            }
            if done, name == "create_agent" || name == "create_channel" {
                Task { await refreshRosterQuietly() }
            }
            if done {
                refreshOpenMemory(from: summary)
                refreshOpenUserMemory(from: summary)
            }
        case .connectUrl(let url, _):
            if let resolved = client?.resolve(url) ?? URL(string: url) {
                Task { await PluginBrowser.open(resolved) }
            }
        }
    }

    var pickedMentions: [String: String] = [:]
    var pendingComposerCaret: Int?

    func visibleMessages(for agent: Agent) -> [Message] {
        if agent.isChannel { return messages }
        return messages.filter { $0.isFromUser || $0.senderId == agent.id }
    }

    func mentionTriggerRange() -> Range<String.Index>? {
        let draft = self.draft
        guard let at = draft.lastIndex(of: "@") else { return nil }
        let prefix = draft[..<at]
        if let last = prefix.last, last.isLetter || last.isNumber || last == "_" { return nil }
        let after = draft[draft.index(after: at)...]
        if after.contains(where: { $0.isWhitespace }) { return nil }
        return at..<draft.endIndex
    }

    func mentionIDs(in content: String) -> [String] {
        var ids: [String] = []
        var seen = Set<String>()
        let regex = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9._-]*)")
        let range = NSRange(content.startIndex..., in: content)
        regex?.enumerateMatches(in: content, range: range) { match, _, _ in
            guard let match, let tokenRange = Range(match.range(at: 1), in: content) else { return }
            let token = String(content[tokenRange]).lowercased()
            if let id = pickedMentions[token], !seen.contains(id) {
                seen.insert(id)
                ids.append(id)
            }
        }
        return ids
    }

    func mentionCandidates(query: String) -> [Agent] {
        let q = query.lowercased()
        var people = agents.filter { !$0.isChannel && $0.name.lowercased().hasPrefix(q) }
        if selectedAgent?.isChannel == true, "everyone".hasPrefix(q) {
            let everyone = Agent(
                id: "everyone",
                name: "everyone",
                title: "",
                description: "",
                avatar: nil,
                kind: .agent,
                memberIds: [],
                sharedProject: false,
                createdAt: .distantPast,
                updatedAt: .distantPast
            )
            people.insert(everyone, at: 0)
        }
        return people
    }

    func insertMention(_ agent: Agent) {
        pickedMentions[agent.name.lowercased()] = agent.id
        if let range = mentionTriggerRange() {
            let rest = String(draft[range.upperBound...])
            let pad = rest.first == " " || rest.isEmpty ? "" : " "
            let prefix = String(draft[..<range.lowerBound])
            let chip = "@\(agent.name)\(pad)"
            draft = "\(prefix)\(chip)\(rest)"
            pendingComposerCaret = (prefix + chip).utf16.count
        } else {
            draft += "@\(agent.name) "
            pendingComposerCaret = draft.utf16.count
        }
    }

    func skillQuery() -> String? {
        SkillPicker.query(in: draft)
    }

    func skillCandidates() -> [Skill] {
        guard let query = skillQuery() else { return [] }
        return SkillPicker.filter(composerSkills, query: query)
    }

    func skillMenuOpen() -> Bool {
        !skillPickerDismissed &&
            SkillPicker.popupOpen(
                skills: composerSkills,
                query: skillQuery(),
                isChannel: selectedAgent?.isChannel == true
            )
    }

    func dismissSkillPicker() {
        skillPickerDismissed = true
    }

    func insertSkill(_ skill: Skill) {
        skillPickerDismissed = false
        if let range = SkillPicker.triggerRange(in: draft) {
            let rest = String(draft[range.upperBound...])
            let pad = rest.first == " " ? "" : " "
            let prefix = String(draft[..<range.lowerBound])
            let token = "/\(skill.name)\(pad)"
            draft = "\(prefix)\(token)\(rest)"
            pendingComposerCaret = (prefix + token).utf16.count
        } else {
            draft += "/\(skill.name) "
            pendingComposerCaret = draft.utf16.count
        }
        skillPickerDismissed = true
    }

    var composerChipNames: [String] {
        Array(pickedMentions.keys)
    }

    func addPendingFile(name: String, mime: String, data: Data) async {
        guard let client, let agent = selectedAgent else { return }
        if let err = ChatAttachment.clientError(name: name, mime: mime, size: data.count) {
            attachError = err
            return
        }
        attachError = nil
        attachInFlight += 1
        defer { attachInFlight = max(0, attachInFlight - 1) }
        do {
            let row = try await client.uploadAttachment(
                agentId: agent.id,
                fileName: name,
                mime: mime,
                data: data
            )
            let preview = row.kind == .image ? data : nil
            let poster = row.kind == .video ? VideoPoster.image(from: data) : nil
            pendingAttachments.append(
                PendingChatAttachment(
                    id: row.id,
                    kind: row.kind,
                    name: row.name,
                    url: row.url,
                    size: row.size,
                    previewData: preview,
                    posterImage: poster
                )
            )
        } catch {
            if let runtime = error as? RuntimeError, case .http(_, let message) = runtime {
                attachError = message
            } else {
                attachError = error.localizedDescription
            }
        }
    }

    func removePending(id: String) {
        pendingAttachments.removeAll { $0.id == id }
        attachError = nil
    }

    /// v1.07: ⌘⇧⌫ / ⌃⇧⌫ clears this chat's unsent text and pending chips.
    /// Nothing is sent. An already empty composer is a no-op. The stored
    /// draft for the open chat is dropped so a later switch does not
    /// bring the text back. Recall disarms because the field is empty.
    func clearComposerDraftFromChord() {
        let agentId = composerAgentID ?? selectedAgentID
        guard let agentId, !agentId.isEmpty else { return }
        guard !ClearComposerDraft.alreadyEmpty(text: draft, chipCount: pendingAttachments.count) else {
            return
        }
        pendingAttachments = []
        attachError = nil
        if draft.isEmpty { return }
        pendingComposerCaret = 0
        draft = ""
    }

    /// v0.87: hardware or on-screen Delete in an empty composer.
    /// One chip, the last one. Focus stays in the composer. No send.
    @discardableResult
    func removeLastPendingChipFromBackspace() -> Bool {
        guard !computerTakeoverOpen else { return false }
        guard BackspaceChip.removesLast(
            composerText: draft,
            chipCount: pendingAttachments.count,
            composing: false,
            chord: false
        ) else { return false }
        let next = BackspaceChip.withoutLast(pendingAttachments)
        guard next.count < pendingAttachments.count, let last = pendingAttachments.last else {
            return false
        }
        removePending(id: last.id)
        wantsComposerFocus = true
        return true
    }

    func openAttachment(_ att: Attachment) async -> URL? {
        guard let client, let url = client.resolve(att.url) else { return nil }
        do {
            let data = try await client.data(from: url)
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(att.name)
            try data.write(to: tmp, options: .atomic)
            return tmp
        } catch {
            composerError = error.localizedDescription
            return nil
        }
    }

    private func prunePreviews() {
        let ids = Set(messages.map(\.id))
        localPreviews = localPreviews.filter { ids.contains($0.key) }
    }
}
