// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UIKit

struct ChatView: View {
    let agentID: String
    @Environment(AppModel.self) private var model
    @FocusState private var composerFocused: Bool

    private var agent: Agent {
        model.visibleAgents.first(where: { $0.id == agentID })
            ?? (model.isConfigured ? .chrome : .placeholderChannel)
    }

    private var hasRealAgent: Bool { !agent.id.isEmpty }

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            transcript
            Divider()
            ComposerBar(agentName: agent.name, isChannel: agent.isChannel, focused: $composerFocused)
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
                if hasRealAgent {
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
                } else {
                    Text(agent.name)
                        .font(.system(size: 14, weight: .semibold))
                }
            }
        }
        .sheet(isPresented: $model.showProfile) {
            if hasRealAgent {
                ProfileSheet(agent: agent)
            }
        }
        .task(id: agentID) {
            guard hasRealAgent || !model.isConfigured else { return }
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
                        let showThinking = ThinkingChrome.shouldShow(
                            busy: model.isSending,
                            hasLiveAssistant: liveAssistantIdx != nil,
                            hasLiveTool: !liveTraces.isEmpty || toolThisTurn
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
                        ForEach(Array(visible.enumerated()), id: \.element.id) { index, message in
                            transcriptItem(
                                message,
                                index: index,
                                in: visible,
                                agent: agent,
                                toolTraces: index == liveAssistantIdx ? liveTraces : [],
                                showCopy: Self.showsCopy(
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
                                )
                            )
                            .padding(.top, turnSpacing(at: index, in: visible, message: message))
                            .id(message.id)
                        }
                        if liveAssistantIdx == nil, !liveTraces.isEmpty {
                            liveToolStreak(agent: agent, traces: liveTraces)
                        }
                        if showThinking {
                            thinkingStreak(agent: agent)
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
            .onChange(of: model.toolTraces.count) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: model.isSending) { _, _ in
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .simultaneousGesture(TapGesture().onEnded { model.dismissSkillPicker() })
        }
    }

    @ViewBuilder
    private func liveToolStreak(agent: Agent, traces: [LiveToolTrace]) -> some View {
        let speaker = liveToolSpeaker(agent: agent, traces: traces)
        let speakerName = traces.first?.senderName.flatMap { $0.isEmpty ? nil : $0 }
            ?? speaker.name
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                AgentAvatar(agent: speaker, size: 20)
                Text(speakerName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            ForEach(traces) { trace in
                Text(trace.summary)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .id("live-tools")
    }

    @ViewBuilder
    private func thinkingStreak(agent: Agent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                AgentAvatar(agent: agent, size: 20)
                Text(agent.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            ThinkingLabel()
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .id("thinking")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(agent.name), \(ThinkingChrome.label)")
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
        showCopy: Bool = false,
        showRegenerate: Bool = false
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
                agents: model.visibleAgents,
                localPreviews: model.localPreviews[message.id] ?? [],
                sameSender: !message.isHandoffRoot && !message.hasRoutineKicker && sameSender(at: index, in: messages),
                threadRoot: agent.isChannel && model.threadID != nil && message.isHandoffRoot,
                toolTraces: toolTraces,
                showCopy: showCopy,
                showRegenerate: showRegenerate
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
        if messages[index].hasRoutineKicker { return false }
        return senderKey(messages[index - 1]) == senderKey(messages[index])
    }

    /// 4pt inside a streak (same sender), 16pt when the sender changes.
    private func turnSpacing(at index: Int, in messages: [Message], message: Message? = nil) -> CGFloat {
        if message?.isHandoffRoot == true { return index == 0 ? 0 : 16 }
        guard index > 0 else { return 0 }
        return sameSender(at: index, in: messages) ? 4 : 16
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
}

private struct ComposerBar: View {
    let agentName: String
    var isChannel: Bool
    var focused: FocusState<Bool>.Binding
    @Environment(AppModel.self) private var model
    @State private var pickerItem: PhotosPickerItem?
    @State private var attachMenu = false
    @State private var showPhotos = false
    @State private var showFiles = false

    private var mentionQuery: String? {
        let draft = model.draft
        guard let at = draft.lastIndex(of: "@") else { return nil }
        let prefix = draft[..<at]
        if let last = prefix.last, last.isLetter || last.isNumber || last == "_" { return nil }
        let after = draft[draft.index(after: at)...]
        if after.contains(where: { $0.isWhitespace }) { return nil }
        return String(after)
    }

    private var canSend: Bool {
        let trimmed = model.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return model.canCompose
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
                    disabled: !model.canCompose,
                    pendingCaret: $model.pendingComposerCaret,
                    focused: focused,
                    onReturnSend: { Task { await model.send() } },
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
                    }
                )
                .frame(minHeight: 22, maxHeight: 120)

                Button {
                    Task { await model.send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                }
                .disabled(!canSend)
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
    let agents: [Agent]
    var localPreviews: [Data] = []
    var sameSender = false
    var threadRoot = false
    var toolTraces: [LiveToolTrace] = []
    var showCopy = false
    var showRegenerate = false
    var onJump: ((HandoffRef) -> Void)?
    @Environment(AppModel.self) private var model
    @State private var shareURL: URL?
    @State private var copied = false

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
            ForEach(toolTraces) { trace in
                Text(trace.summary)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
            }
            if message.isToolLine {
                Text(message.content)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
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
                    Spacer(minLength: 48)
                }
                .padding(.horizontal, 12)
            } else if isUser {
                HStack(alignment: .top, spacing: 0) {
                    Spacer(minLength: 48)
                    VStack(alignment: .leading, spacing: 6) {
                        userAttachments
                        if !message.content.isEmpty {
                            MentionLabel(text: message.displayContent, names: agents.filter { !$0.isChannel }.map(\.name), links: true)
                                .font(.system(size: 14))
                                .textSelection(.enabled)
                                .frame(minWidth: 0, alignment: .leading)
                        }
                    }
                    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.accentColor.opacity(0.22), in: RoundedRectangle(cornerRadius: 16))
                }
                .padding(.horizontal, 12)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    userAttachments
                    if !message.content.isEmpty {
                        AssistantMarkdown(
                            text: message.displayContent,
                            names: agents.filter { !$0.isChannel }.map(\.name)
                        )
                    }
                    if showCopy {
                        HStack(spacing: 12) {
                            Button(copied ? "Copied" : "Copy") {
                                UIPasteboard.general.string = message.content
                                copied = true
                                Task {
                                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                                    copied = false
                                }
                            }
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .buttonStyle(.plain)
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
        let images = atts.filter { $0.kind == .image }
        let videos = atts.filter { $0.kind == .video }
        let files = atts.filter { $0.kind == .file }
        if images.isEmpty && videos.isEmpty && files.isEmpty && localPreviews.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(images) { image in
                    RemoteImage(urlString: image.url, mime: "image/*")
                        .frame(maxWidth: 220, maxHeight: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                ForEach(videos) { video in
                    RemoteVideo(urlString: video.url)
                        .frame(width: 220, height: 160)
                }
                if images.isEmpty && videos.isEmpty {
                    ForEach(Array(localPreviews.enumerated()), id: \.offset) { _, data in
                        if let image = UIImage(data: data) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: 220, maxHeight: 160)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
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
