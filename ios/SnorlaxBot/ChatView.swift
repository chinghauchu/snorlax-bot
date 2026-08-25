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
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button {
                    model.showProfile = true
                } label: {
                    Text(agent.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.primary)
                }
                .accessibilityHint("Opens profile")
            }
        }
        .sheet(isPresented: $model.showProfile) {
            ProfileSheet(agent: agent)
        }
        .task(id: agentID) {
            await model.select(agentID, push: false)
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
                        ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, message in
                            MessageBubble(
                                message: message,
                                agents: model.visibleAgents,
                                localPreviews: model.localPreviews[message.id] ?? [],
                                sameSender: sameSender(at: index)
                            )
                            .padding(.top, turnSpacing(at: index))
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

    private func senderKey(_ message: Message) -> String {
        message.senderId.isEmpty ? (message.role == .user ? "user" : message.agentId) : message.senderId
    }

    private func sameSender(at index: Int) -> Bool {
        guard index > 0 else { return false }
        return senderKey(model.messages[index - 1]) == senderKey(model.messages[index])
    }

    /// 4pt inside a streak (same sender), 16pt when the sender changes.
    private func turnSpacing(at index: Int) -> CGFloat {
        guard index > 0 else { return 0 }
        return sameSender(at: index) ? 4 : 16
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

                TextField("Message \(agentName)", text: $model.draft, axis: .vertical)
                    .font(.system(size: 14))
                    .lineLimit(1...6)
                    .focused(focused)
                    .disabled(!model.canCompose)

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
                if !isUser { Spacer(minLength: 48) }
            }
            .padding(.horizontal, 12)
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
