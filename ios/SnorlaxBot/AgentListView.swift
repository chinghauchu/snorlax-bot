// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct AgentListView: View {
    @Environment(AppModel.self) private var model
    @State private var pendingDelete: Agent?

    var body: some View {
        styledList
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await model.createAgent() }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .disabled(!model.isConfigured)
                    .accessibilityLabel("New agent")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                AccountChip {
                    model.showSettings = true
                }
            }
            .confirmationDialog(
                pendingDelete.map { "Delete \($0.name)? This removes the agent and its chat." } ?? "",
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
        ForEach(model.visibleAgents) { agent in
            row(for: agent)
                .tag(agent.id)
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    if !agent.isProtected {
                        Button("Delete", role: .destructive) {
                            pendingDelete = agent
                        }
                    }
                }
                .modifier(UserAgentDeleteMenu(enabled: !agent.isProtected) {
                    pendingDelete = agent
                })
                .deleteDisabled(agent.isProtected)
        }
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
            }
            Spacer(minLength: 0)
            if agent.isChannel, model.channelUnread {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 6, height: 6)
                    .accessibilityLabel("Unread")
            }
        }
        .frame(height: 44)
        .contentShape(Rectangle())
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
    var onDelete: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content.contextMenu {
                Button("Delete", role: .destructive, action: onDelete)
            }
        } else {
            content
        }
    }
}
