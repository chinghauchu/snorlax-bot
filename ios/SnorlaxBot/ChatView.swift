// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import PhotosUI

struct ChatView: View {
    let agentID: String
    @Environment(AppModel.self) private var model
    @FocusState private var composerFocused: Bool

    private var agent: Agent {
        model.visibleAgents.first(where: { $0.id == agentID }) ?? .placeholderChannel
    }

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            transcript
            Divider()
            ComposerBar(agentName: agent.name, focused: $composerFocused)
        }
        .navigationTitle(agent.name)
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
            ToolbarItem(placement: .principal) {
                Button {
                    model.showProfile = true
                } label: {
                    HStack(spacing: 8) {
                        AgentAvatar(agent: agent, size: 24)
                        Text(agent.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                    }
                }
                .accessibilityLabel(agent.name)
                .accessibilityHint("Opens info")
            }
        }
        .sheet(isPresented: $model.showProfile) {
            ProfileSheet(agent: agent)
        }
        .task(id: agentID) {
            if !(model.selectedAgentID == agentID && model.threadID != nil) {
                await model.select(agentID, push: false)
            }
            if model.canCompose {
                composerFocused = true
                model.wantsComposerFocus = false
            }
        }
        .onChange(of: model.wantsComposerFocus) { _, wants in
            guard wants, model.canCompose else { return }
            composerFocused = true
            model.wantsComposerFocus = false
        }
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if model.messages.isEmpty, !model.isConfigured {
                        Text("Paste your Spark URL and token in Settings to start.")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    } else {
                        let visible = model.visibleMessages(for: agent)
                        ForEach(Array(visible.enumerated()), id: \.element.id) { index, message in
                            transcriptItem(message, index: index, in: visible, agent: agent)
                            .padding(.top, turnSpacing(at: index, in: visible, message: message))
                            .id(message.id)
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.vertical, 8)
            }
            .onChange(of: model.messages.count) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: model.messages.last?.content) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    @ViewBuilder
    private func transcriptItem(_ message: Message, index: Int, in messages: [Message], agent: Agent) -> some View {
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
                agents: model.visibleAgents,
                localPreviews: model.localPreviews[message.id] ?? [],
                sameSender: !message.isHandoffRoot && sameSender(at: index, in: messages),
                threadRoot: agent.isChannel && model.threadID != nil && message.isHandoffRoot
            ) { jump in
                Task { await model.openJump(channelId: jump.channelId, threadId: jump.threadId) }
            }
        }
    }

    private func senderKey(_ message: Message) -> String {
        message.senderId.isEmpty ? (message.role == .user ? "user" : message.agentId) : message.senderId
    }

    private func sameSender(at index: Int, in messages: [Message]) -> Bool {
        guard index > 0 else { return false }
        return senderKey(messages[index - 1]) == senderKey(messages[index])
    }

    /// 4pt inside a streak (same sender), 16pt when the sender changes.
    private func turnSpacing(at index: Int, in messages: [Message], message: Message? = nil) -> CGFloat {
        if message?.isHandoffRoot == true { return index == 0 ? 0 : 16 }
        guard index > 0 else { return 0 }
        return sameSender(at: index, in: messages) ? 4 : 16
    }
}

private struct ComposerBar: View {
    let agentName: String
    var focused: FocusState<Bool>.Binding
    @Environment(AppModel.self) private var model
    @State private var pickerItem: PhotosPickerItem?

    private var mentionQuery: String? {
        let draft = model.draft
        guard let at = draft.lastIndex(of: "@") else { return nil }
        let prefix = draft[..<at]
        if let last = prefix.last, last.isLetter || last.isNumber || last == "_" { return nil }
        let after = draft[draft.index(after: at)...]
        if after.contains(where: { $0.isWhitespace }) { return nil }
        return String(after)
    }

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 8) {
            if let pending = model.pendingImage, let uiImage = UIImage(data: pending.data) {
                HStack {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Spacer()
                    Button {
                        model.pendingImage = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Remove image")
                }
            }
            if let query = mentionQuery {
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
            HStack(alignment: .bottom, spacing: 8) {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Image(systemName: "photo")
                        .font(.system(size: 18))
                        .frame(width: 36, height: 36)
                }
                .disabled(!model.canCompose)
                .accessibilityLabel("Attach image")

                ComposerTextView(
                    text: $model.draft,
                    chipNames: model.composerChipNames,
                    placeholder: "Message \(agentName)",
                    disabled: !model.canCompose,
                    pendingCaret: $model.pendingComposerCaret,
                    focused: focused
                )
                .frame(minHeight: 22, maxHeight: 120)

                Button {
                    Task { await model.send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                }
                .disabled(!model.canCompose || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send")
            }
            if let error = model.composerError, !error.isEmpty {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await load(item) }
        }
    }

    private func load(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        await MainActor.run {
            model.pendingImage = PendingImage(mime: data.sniffedImageMIME, data: data)
            pickerItem = nil
        }
    }
}

private struct MessageBubble: View {
    let message: Message
    let agents: [Agent]
    var localPreviews: [Data] = []
    var sameSender = false
    var threadRoot = false
    var onJump: ((HandoffRef) -> Void)?

    private var isUser: Bool { message.isFromUser }

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
                            createdAt: .distantPast,
                            updatedAt: .distantPast
                        ),
                        size: 20
                    )
                    Text(message.senderName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)
            }
            HStack(alignment: .top, spacing: 0) {
                if isUser { Spacer(minLength: 48) }
                if threadRoot {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("from \(message.senderName)")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        Text(message.userAsk ?? message.content)
                            .font(.system(size: 14))
                            .textSelection(.enabled)
                        if let brief = message.brief, !brief.isEmpty {
                            DisclosureGroup("Context") {
                                Text(brief)
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                            }
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 16))
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(localPreviews.enumerated()), id: \.offset) { _, data in
                            if let image = UIImage(data: data) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(maxWidth: 220, maxHeight: 220)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        ForEach(message.images) { image in
                            RemoteImage(urlString: image.url, mime: image.mime)
                                .frame(maxWidth: 220, maxHeight: 220)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        if !message.content.isEmpty {
                            MentionLabel(text: message.content, names: agents.filter { !$0.isChannel }.map(\.name))
                                .font(.system(size: 14))
                                .textSelection(.enabled)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(bubbleColor, in: RoundedRectangle(cornerRadius: 16))
                }
                if !isUser { Spacer(minLength: 48) }
            }
            .padding(.horizontal, 12)
            if isUser, let jump = message.jump {
                Button {
                    onJump?(jump)
                } label: {
                    HStack(spacing: 0) {
                        Text("Also in ")
                            .foregroundStyle(.secondary)
                        Text("Snorlax-Bot")
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
    }

    private var bubbleColor: Color {
        isUser
            ? Color.accentColor.opacity(0.22)
            : Color(uiColor: .secondarySystemFill)
    }
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
                Text(message.userAsk ?? message.content)
                    .font(.system(size: 13))
                    .lineLimit(1)
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
}
