// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct AgentListView: View {
    @Environment(AppModel.self) private var model
    @State private var pendingDelete: Agent?
    @State private var showCreateChannel = false
    @State private var chatQuery = ""

    /// Chats that currently paint the accent dot, before the name search.
    private var unreadAgents: [Agent] {
        model.visibleAgents.filter { model.showsUnreadDot($0) }
    }

    private var filteredAgents: [Agent] {
        model.visibleAgents.filter {
            ChatListFilter.includes(
                filter: model.chatListFilter,
                hasUnreadDot: model.showsUnreadDot($0)
            )
        }
    }

    private var listedAgents: [Agent] {
        let chats = filteredAgents.map {
            ChatSwitcher.Chat(id: $0.id, name: $0.name)
        }
        let ids = ChatSwitcher.filter(chats, query: chatQuery).map(\.id)
        let byID = Dictionary(uniqueKeysWithValues: filteredAgents.map { ($0.id, $0) })
        return ids.compactMap { byID[$0] }
    }

    /// Search still covers every chat in the All / Unread set, then pins group.
    private var groupedListed: (pinned: [Agent], rest: [Agent]) {
        ChatPins.grouped(listedAgents, pinned: model.pinnedChatIDs) { $0.id }
    }

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            Picker(ChatListFilter.groupLabel, selection: $model.chatListFilter) {
                Text(ChatListFilter.allLabel).tag(ChatListFilter.Mode.all)
                Text(ChatListFilter.unreadLabel).tag(ChatListFilter.Mode.unread)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityLabel(ChatListFilter.groupLabel)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            styledList
        }
            .searchable(text: $chatQuery, prompt: ChatSwitcher.placeholder)
            .accessibilityInputLabels([ChatSwitcher.inputLabel])
            .toolbar {
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
                    return "Delete \($0.name)? This removes the \(kind) and its chat."
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

    @ViewBuilder
    private var styledList: some View {
        if UIDevice.current.userInterfaceIdiom == .pad {
            List(selection: Bindable(model).selectedAgentID) {
                rows
            }
            .listStyle(.sidebar)
        } else {
            List {
                rows
            }
            .listStyle(.insetGrouped)
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
            if !grouped.pinned.isEmpty {
                Section {
                    ForEach(grouped.pinned) { agent in
                        chatRow(agent)
                    }
                } header: {
                    Text(ChatPins.groupLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                }
            }
            if !grouped.rest.isEmpty {
                Section {
                    ForEach(grouped.rest) { agent in
                        chatRow(agent)
                    }
                }
            }
        }
    }

    private func chatRow(_ agent: Agent) -> some View {
        row(for: agent)
            .tag(agent.id)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button {
                    model.toggleChatPin(agent.id)
                } label: {
                    Label(ChatPins.label(pinned: model.isChatPinned(agent.id)), systemImage: "pin")
                }
                .tint(Color.accentColor)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if model.isConfigured {
                    Button("Delete", role: .destructive) {
                        pendingDelete = agent
                    }
                }
            }
            .modifier(
                UserAgentDeleteMenu(
                    enabled: model.isConfigured,
                    pinned: model.isChatPinned(agent.id),
                    onPin: { model.toggleChatPin(agent.id) },
                    onDelete: { pendingDelete = agent }
                )
            )
    }

    @ViewBuilder
    private func row(for agent: Agent) -> some View {
        if UIDevice.current.userInterfaceIdiom == .pad {
            AgentRow(agent: agent)
        } else {
            NavigationLink(value: agent.id) {
                AgentRow(agent: agent)
            }
        }
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
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 10) {
            AgentAvatar(agent: agent, size: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(agent.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if !agent.rosterSubtitle.isEmpty {
                    Text(agent.rosterSubtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let preview = model.chatPreviews[agent.id], !preview.isEmpty {
                    chatMeta(preview: preview, agentId: agent.id)
                } else if model.chatActivity[agent.id] != nil {
                    chatMeta(preview: nil, agentId: agent.id)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if model.isChatPinned(agent.id) {
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
    @ViewBuilder
    private func chatMeta(preview: String?, agentId: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let preview, !preview.isEmpty {
                Text(preview)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 0)
            if model.chatActivity[agentId] != nil {
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
    let pinned: Bool
    var onPin: () -> Void
    var onDelete: () -> Void

    func body(content: Content) -> some View {
        content.contextMenu {
            Button(ChatPins.label(pinned: pinned), action: onPin)
            if enabled {
                Button("Delete", role: .destructive, action: onDelete)
            }
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
