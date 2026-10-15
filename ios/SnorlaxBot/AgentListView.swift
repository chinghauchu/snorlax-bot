// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct AgentListView: View {
    @Environment(AppModel.self) private var model
    @State private var pendingDelete: Agent?
    @State private var showCreateChannel = false
    @State private var showArchived = false
    @State private var chatQuery = ""

    /// v0.95 / v1.11: the list inline field. Sidebar Rename and the
    /// keyboard chord both write `renameChatID`.
    private var renamingID: String? { model.renameChatID }

    /// Chats still in the main list. Archived chats live in the Archived list.
    private var mainAgents: [Agent] {
        model.visibleAgents.filter { !model.isChatArchived($0.id) }
    }

    /// Chats that currently paint the accent dot, before the name search.
    /// Archived unread stays out of this count so the empty state can show.
    private var unreadAgents: [Agent] {
        mainAgents.filter { model.showsUnreadDot($0) }
    }

    private var filteredAgents: [Agent] {
        mainAgents.filter {
            ChatListFilter.includes(
                filter: model.chatListFilter,
                hasUnreadDot: model.showsUnreadDot($0)
            )
        }
    }

    /// Name search still finds archived chats. An empty query stays on the main list.
    private var searchPool: [Agent] {
        let base = filteredAgents.map { $0 }
        guard ChatSwitcher.queryActive(chatQuery) else { return base }
        var seen = Set(base.map(\.id))
        let archived = model.archivedAgents.filter { seen.insert($0.id).inserted }
        return base + archived
    }

    private var listedAgents: [Agent] {
        let chats = searchPool.map {
            ChatSwitcher.Chat(id: $0.id, name: model.chatDisplayName(for: $0))
        }
        let ids = ChatSwitcher.filter(chats, query: chatQuery).map(\.id)
        let byID = Dictionary(uniqueKeysWithValues: searchPool.map { ($0.id, $0) })
        return ids.compactMap { byID[$0] }
    }

    /// Search still covers every chat in the All / Unread set, then pins group.
    private var groupedListed: (pinned: [Agent], rest: [Agent]) {
        ChatPins.grouped(listedAgents, pinned: model.pinnedChatIDs) { $0.id }
    }

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            if showArchived {
                Button {
                    showArchived = false
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Chats")
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .accessibilityLabel("Back to chats")
            } else {
                Picker(ChatListFilter.groupLabel, selection: $model.chatListFilter) {
                    Text(ChatListFilter.allLabel).tag(ChatListFilter.Mode.all)
                    Text(ChatListFilter.unreadLabel).tag(ChatListFilter.Mode.unread)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityLabel(ChatListFilter.groupLabel)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            styledList
        }
            .searchable(text: $chatQuery, prompt: ChatSwitcher.placeholder)
            .accessibilityInputLabels([ChatSwitcher.inputLabel])
            .onAppear {
                model.archiveListShowing = showArchived
            }
            .onDisappear {
                model.archiveListShowing = false
            }
            .onChange(of: showArchived) { _, showing in
                model.archiveListShowing = showing
            }
            .onChange(of: model.renameChatID) { _, id in
                guard let id, model.isChatArchived(id) else { return }
                showArchived = true
            }
            .onKeyPress(phases: .down) { press in
                if jumpChatKey(press) == .handled {
                    return .handled
                }
                return newChatKey(press)
            }
            .toolbar {
                if model.hasAnyUnreadChat {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(ChatUnread.markAllReadLabel) {
                            model.markAllChatsRead()
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(ChatUnread.markAllReadLabel)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("New agent") {
                            Task { await model.createAgent() }
                        }
                        Button("New channel") {
                            showCreateChannel = true
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .disabled(!model.isConfigured)
                    .accessibilityLabel("Create")
                }
            }
            .sheet(isPresented: $showCreateChannel) {
                CreateChannelSheet()
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                AccountChip {
                    model.showSettings = true
                }
            }
            .confirmationDialog(
                pendingDelete.map {
                    let kind = $0.isChannel ? "channel" : "agent"
                    let label = model.chatDisplayName(for: $0)
                    return "Delete \(label)? This removes the \(kind) and its chat."
                } ?? "",
                isPresented: deletePresented,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    if let agent = pendingDelete {
                        Task { await model.delete(agent) }
                    }
                    pendingDelete = nil
                }
                Button("Cancel", role: .cancel) { pendingDelete = nil }
            }
    }

    /// Hardware ⌘1–⌘9 / ⌃1–⌃9 from the chat list. The order is the
    /// list on screen: the main roster, or the Archived list when
    /// that screen is showing. Search, rename, and the channel sheet
    /// own the key. ⌘9 opens the last row.
    private func jumpChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard let slot = ChatJump.slot(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if renamingID != nil || showCreateChannel { return .ignored }
        if model.showSettings || model.showProfile || model.computerTakeoverOpen {
            return .ignored
        }
        if ChatJump.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        model.openChatAtJumpSlot(slot)
        return .handled
    }

    /// Hardware ⌘N / ⌃N from the chat list. The New agent item is the
    /// same path. Search, rename, and the channel sheet own the key.
    private func newChatKey(_ press: KeyPress) -> KeyPress.Result {
        guard NewChat.isChord(
            key: press.key.character,
            characters: press.characters,
            command: press.modifiers.contains(.command),
            control: press.modifiers.contains(.control),
            option: press.modifiers.contains(.option),
            shift: press.modifiers.contains(.shift)
        ) else { return .ignored }
        if renamingID != nil || showCreateChannel { return .ignored }
        if model.showSettings || model.showProfile || model.computerTakeoverOpen {
            return .ignored
        }
        if NewChat.overlayTextFieldOwnsChord(
            textFieldFocused: TranscriptScroll.textInputIsFirstResponder(),
            composerFocused: false
        ) {
            return .ignored
        }
        model.createAgentFromChord()
        return .handled
    }

    @ViewBuilder
    private var styledList: some View {
        if UIDevice.current.userInterfaceIdiom == .pad {
            List(selection: Bindable(model).selectedAgentID) {
                listBody
            }
            .listStyle(.sidebar)
        } else {
            List {
                listBody
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder
    private var listBody: some View {
        if showArchived {
            archivedRows
        } else {
            rows
        }
    }

    @ViewBuilder
    private var archivedRows: some View {
        if model.archivedAgents.isEmpty {
            Text(ChatArchive.sectionLabel)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(ChatArchive.sectionLabel)
        } else {
            Section {
                ForEach(model.archivedAgents) { agent in
                    chatRow(agent, archived: true)
                }
            } header: {
                Text(ChatArchive.sectionLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .textCase(nil)
            }
        }
    }

    @ViewBuilder
    private var rows: some View {
        if ChatListFilter.showEmpty(
            filter: model.chatListFilter,
            unreadCount: unreadAgents.count
        ) {
            Text(ChatListFilter.emptyLabel)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(ChatListFilter.emptyLabel)
        } else if ChatSwitcher.queryActive(chatQuery), listedAgents.isEmpty {
            Text(ChatSwitcher.emptyLabel)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(ChatSwitcher.emptyLabel)
        } else {
            let grouped = groupedListed
            let headers = ChatSections.labels(
                pinnedCount: grouped.pinned.count,
                restCount: grouped.rest.count
            )
            if headers.contains(ChatPins.groupLabel) {
                Section {
                    ForEach(grouped.pinned) { agent in
                        chatRow(agent, archived: model.isChatArchived(agent.id))
                    }
                } header: {
                    Text(ChatPins.groupLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                }
            }
            if headers.contains(ChatSections.chatsLabel) {
                Section {
                    ForEach(grouped.rest) { agent in
                        chatRow(agent, archived: model.isChatArchived(agent.id))
                    }
                } header: {
                    Text(ChatSections.chatsLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                }
            }
        }
        if !showArchived,
           !ChatSwitcher.queryActive(chatQuery),
           !model.archivedAgents.isEmpty {
            Section {
                Button {
                    showArchived = true
                } label: {
                    Text(ChatArchive.sectionTitle(count: model.archivedAgents.count))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ChatArchive.sectionTitle(count: model.archivedAgents.count))
            }
        }
    }

    private func chatRow(_ agent: Agent, archived: Bool = false) -> some View {
        row(for: agent, showsPinGlyph: !archived)
            .tag(agent.id)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button {
                    model.toggleChatMute(agent.id)
                } label: {
                    Label(
                        ChatMute.label(muted: model.isChatMuted(agent.id)),
                        systemImage: "bell.slash"
                    )
                }
                .tint(Color.accentColor)
                if archived {
                    Button {
                        model.unarchiveChat(agent.id)
                    } label: {
                        Label(ChatArchive.unarchiveLabel, systemImage: "archivebox")
                    }
                    .tint(Color.accentColor)
                } else {
                    Button {
                        model.toggleChatPin(agent.id)
                    } label: {
                        Label(ChatPins.label(pinned: model.isChatPinned(agent.id)), systemImage: "pin")
                    }
                    .tint(Color.accentColor)
                }
                Button {
                    beginRename(agent)
                } label: {
                    Label(ChatNames.renameLabel, systemImage: "pencil")
                }
                .tint(Color.accentColor)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if model.isConfigured {
                    Button("Delete", role: .destructive) {
                        pendingDelete = agent
                    }
                }
                Button {
                    model.toggleChatRead(agent.id)
                } label: {
                    Label(
                        ChatUnread.actionLabel(showsDot: model.showsUnreadDot(agent)),
                        systemImage: "envelope.badge"
                    )
                }
                .tint(Color.accentColor)
                if archived {
                    Button {
                        model.unarchiveChat(agent.id)
                    } label: {
                        Label(ChatArchive.unarchiveLabel, systemImage: "archivebox")
                    }
                    .tint(Color.accentColor)
                } else {
                    Button {
                        model.archiveChat(agent.id)
                    } label: {
                        Label(ChatArchive.archiveLabel, systemImage: "archivebox")
                    }
                    .tint(Color.accentColor)
                }
            }
            .modifier(
                UserAgentDeleteMenu(
                    enabled: model.isConfigured,
                    archived: archived,
                    pinned: model.isChatPinned(agent.id),
                    muted: model.isChatMuted(agent.id),
                    unread: model.showsUnreadDot(agent),
                    onRename: { beginRename(agent) },
                    onPin: { model.toggleChatPin(agent.id) },
                    onMute: { model.toggleChatMute(agent.id) },
                    onArchive: { model.archiveChat(agent.id) },
                    onUnarchive: { model.unarchiveChat(agent.id) },
                    onRead: { model.toggleChatRead(agent.id) },
                    onDelete: { pendingDelete = agent }
                )
            )
    }

    @ViewBuilder
    private func row(for agent: Agent, showsPinGlyph: Bool = true) -> some View {
        let content = AgentRow(
            agent: agent,
            renaming: renamingID == agent.id,
            showsPinGlyph: showsPinGlyph,
            onCommit: { draft in
                model.commitChatName(agent.id, draft: draft, serverName: agent.name)
                model.endRename(agent.id)
            },
            onCancel: {
                model.endRename(agent.id)
            }
        )
        if UIDevice.current.userInterfaceIdiom == .pad || renamingID == agent.id {
            content
        } else {
            NavigationLink(value: agent.id) {
                content
            }
        }
    }

    private func beginRename(_ agent: Agent) {
        model.noteListRename(agent.id)
    }

    private var deletePresented: Binding<Bool> {
        Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        )
    }
}

private struct AgentRow: View {
    let agent: Agent
    var renaming: Bool = false
    var showsPinGlyph: Bool = true
    var onCommit: (String) -> Void = { _ in }
    var onCancel: () -> Void = {}
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 10) {
            AgentAvatar(agent: agent, size: 28)
            VStack(alignment: .leading, spacing: 1) {
                if renaming {
                    ChatRenameField(
                        initial: model.chatDisplayName(for: agent),
                        onCommit: onCommit,
                        onCancel: onCancel
                    )
                } else {
                    Text(model.chatDisplayName(for: agent))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                if !agent.rosterSubtitle.isEmpty {
                    Text(agent.rosterSubtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                let preview = model.chatListPreview(
                    for: agent.id,
                    lastMessage: model.chatPreviews[agent.id]
                )
                let generating = model.generatingChatID == agent.id
                if preview != nil || model.chatActivity[agent.id] != nil || generating {
                    chatMeta(preview: preview, agentId: agent.id)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if model.isChatMuted(agent.id) {
                Image(systemName: "bell.slash")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(ChatMute.glyphLabel)
            }
            if showsPinGlyph, model.isChatPinned(agent.id) {
                Image(systemName: "pin.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(ChatPins.glyphLabel)
            }
            if model.showsUnreadDot(agent) {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 6, height: 6)
                    .accessibilityLabel("Unread")
            }
        }
        .frame(minHeight: 44, alignment: .center)
        .contentShape(Rectangle())
    }

    /// v0.83: preview and compact relative time share one row. The time
    /// follows the latest message and refreshes on a light timer.
    /// v0.91: a non-open chat with a saved draft shows a muted-accent
    /// Draft: prefix and that text instead of the last message.
    /// v0.93: while a reply is in flight, muted ··· replace the time
    /// and the preview may read Typing…. Draft: still wins that line.
    @ViewBuilder
    private func chatMeta(preview: ChatGenerating.Row?, agentId: String) -> some View {
        let generating = ChatGenerating.showsDots(generating: model.generatingChatID == agentId)
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let preview {
                previewLine(preview)
            }
            Spacer(minLength: 0)
            if generating {
                GeneratingDots()
                    .layoutPriority(1)
            } else if model.chatActivity[agentId] != nil {
                TimelineView(.periodic(from: .now, by: ChatListTime.tickSeconds)) { context in
                    if let stamp = model.chatActivity[agentId],
                       let label = ChatListTime.label(createdAt: stamp, now: context.date) {
                        Text(label)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .layoutPriority(1)
                            .accessibilityLabel(label)
                    }
                }
            }
        }
    }

    /// One truncated line. A draft paints "Draft:" in a muted accent
    /// and the rest in the same secondary color as a last-message preview.
    /// Typing… is muted, the same secondary color as a last message.
    private func previewLine(_ preview: ChatGenerating.Row) -> some View {
        let line: Text = {
            if preview.kind == .draft {
                return Text(ChatDraftPreview.prefix + " ")
                    .foregroundStyle(Color.accentColor.opacity(0.72))
                    + Text(preview.text).foregroundStyle(.secondary)
            }
            if preview.kind == .typing {
                return Text(ChatGenerating.hint).foregroundStyle(.secondary)
            }
            return Text(preview.text).foregroundStyle(.secondary)
        }()
        return line
            .font(.system(size: 12))
            .lineLimit(1)
            .truncationMode(.tail)
            .accessibilityLabel(
                preview.kind == .draft
                    ? "\(ChatDraftPreview.prefix) \(preview.text)"
                    : preview.kind == .typing
                        ? ChatGenerating.hint
                        : preview.text
            )
            .accessibilityHidden(preview.kind == .typing)
    }
}

struct AccountChip: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.secondary)
                Text("Local")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .frame(height: 44)
        }
        .buttonStyle(.plain)
        .background(.bar)
        .accessibilityLabel("Local account, Settings")
    }
}

private struct UserAgentDeleteMenu: ViewModifier {
    let enabled: Bool
    let archived: Bool
    let pinned: Bool
    let muted: Bool
    let unread: Bool
    var onRename: () -> Void
    var onPin: () -> Void
    var onMute: () -> Void
    var onArchive: () -> Void
    var onUnarchive: () -> Void
    var onRead: () -> Void
    var onDelete: () -> Void

    func body(content: Content) -> some View {
        content.contextMenu {
            Button(ChatNames.renameLabel, action: onRename)
            if archived {
                Button(ChatArchive.unarchiveLabel, action: onUnarchive)
            } else {
                Button(ChatPins.label(pinned: pinned), action: onPin)
                Button(ChatArchive.archiveLabel, action: onArchive)
            }
            Button(ChatMute.label(muted: muted), action: onMute)
            Button(ChatUnread.actionLabel(showsDot: unread), action: onRead)
            if enabled {
                Button("Delete", role: .destructive, action: onDelete)
            }
        }
    }
}

/// Inline name field. Return or leaving the field commits. Escape cancels.
/// A second finish is ignored so blur after Return does not commit twice.
private struct ChatRenameField: View {
    let initial: String
    var onCommit: (String) -> Void
    var onCancel: () -> Void
    @FocusState private var focused: Bool
    @State private var draft: String
    @State private var settled = false
    @State private var didFocus = false

    init(initial: String, onCommit: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.initial = initial
        self.onCommit = onCommit
        self.onCancel = onCancel
        _draft = State(initialValue: initial)
    }

    var body: some View {
        TextField(ChatNames.fieldLabel, text: $draft)
            .font(.system(size: 14, weight: .medium))
            .textFieldStyle(.plain)
            .submitLabel(.done)
            .focused($focused)
            .onSubmit { finish(commit: true) }
            .onKeyPress(.escape) {
                finish(commit: false)
                return .handled
            }
            .onChange(of: focused) { _, isFocused in
                if isFocused {
                    didFocus = true
                    return
                }
                if didFocus {
                    finish(commit: true)
                }
            }
            .onDisappear {
                if didFocus {
                    finish(commit: true)
                }
            }
            .onAppear {
                DispatchQueue.main.async {
                    focused = true
                }
            }
    }

    private func finish(commit: Bool) {
        guard !settled else { return }
        settled = true
        if commit {
            onCommit(draft)
        } else {
            onCancel()
        }
    }
}

private struct CreateChannelSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = "New channel"
    @State private var memberIds: Set<String> = []

    private var people: [Agent] {
        model.visibleAgents.filter { !$0.isChannel }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                }
                Section("Members") {
                    ForEach(people) { agent in
                        Button {
                            if memberIds.contains(agent.id) {
                                memberIds.remove(agent.id)
                            } else {
                                memberIds.insert(agent.id)
                            }
                        } label: {
                            HStack(spacing: 10) {
                                AgentAvatar(agent: agent, size: 28)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(agent.name)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(.primary)
                                    if !agent.title.isEmpty {
                                        Text(agent.title)
                                            .font(.system(size: 13))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: memberIds.contains(agent.id) ? "checkmark.square.fill" : "square")
                                    .foregroundStyle(memberIds.contains(agent.id) ? Color.accentColor : .secondary)
                            }
                            .frame(height: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("New channel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let ids = people.map(\.id).filter { memberIds.contains($0) }
                        Task {
                            await model.createChannel(name: name, memberIds: ids)
                            dismiss()
                        }
                    }
                    .disabled(
                        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || memberIds.isEmpty
                    )
                }
            }
            .onAppear {
                memberIds = Set(people.map(\.id))
            }
        }
        .presentationDetents([.medium, .large])
    }
}
