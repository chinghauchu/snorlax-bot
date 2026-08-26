// SPDX-License-Identifier: Apache-2.0
import Foundation
import Observation
import SwiftUI

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
    var selectedAgentID: String?
    var navigationPath: [String] = []
    var messages: [Message] = []
    var threadID: String?
    var unreadChannelIDs: Set<String> = []
    var lastExtraChannelID: String?
    var localPreviews: [String: [Data]] = [:]
    var draft = ""
    var pendingImage: PendingImage?
    var isSending = false
    var errorMessage: String?
    var composerError: String?
    var wantsComposerFocus = false
    var showSettings = false
    var showProfile = false

    init() {
        runtimeURL = UserDefaults.standard.string(forKey: Keys.runtimeURL) ?? ""
        token = KeychainStore.load()
        theme = AppTheme(rawValue: UserDefaults.standard.string(forKey: Keys.theme) ?? "") ?? .system
        accent = AccentChoice(rawValue: UserDefaults.standard.string(forKey: Keys.accent) ?? "") ?? .teal
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

    var canCompose: Bool { client != nil && !isSending && selectedAgent != nil }

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
            if let next = Agent.fallbackRosterSelection(in: roster) {
                await select(next.id, push: true)
                wantsComposerFocus = true
            } else {
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

    func loadConversation(_ id: String, thread: String?, push: Bool) async {
        if selectedAgentID != id || threadID != thread {
            showProfile = false
        }
        selectedAgentID = id
        threadID = thread
        if push, navigationPath.last != id {
            navigationPath = [id]
        }
        if visibleAgents.first(where: { $0.id == id })?.isChannel == true {
            unreadChannelIDs.remove(id)
            if id != Agent.channelID {
                lastExtraChannelID = id
            }
        }
        guard isConfigured, let client else {
            messages = []
            localPreviews = [:]
            return
        }
        do {
            messages = try await client.listMessages(agentId: id, threadId: thread)
            prunePreviews()
        } catch {
            errorMessage = error.localizedDescription
            messages = []
        }
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

    func delete(_ agent: Agent) async {
        guard let client else { return }
        do {
            try await client.deleteAgent(id: agent.id)
            agents.removeAll { $0.id == agent.id }
            unreadChannelIDs.remove(agent.id)
            if lastExtraChannelID == agent.id {
                lastExtraChannelID = nil
            }
            for index in agents.indices where agents[index].isChannel {
                agents[index].memberIds.removeAll { $0 == agent.id }
            }
            if selectedAgentID == agent.id {
                if let next = Agent.nextRosterSelection(
                    in: agents,
                    removedId: agent.id,
                    currentId: selectedAgentID
                ) {
                    await select(next.id, push: true)
                } else {
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

    func saveProfile(_ draft: Agent) async {
        guard let client else { return }
        do {
            let updated = try await client.patchAgent(
                draft.isChannel
                    ? AgentPatch(name: draft.name, memberIds: draft.memberIds)
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func send() async {
        guard let client, let agent = selectedAgent else { return }
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        let image = pendingImage
        let mentionIDs = mentionIDs(in: content)
        draft = ""
        pendingComposerCaret = 0
        pickedMentions = [:]
        pendingImage = nil
        composerError = nil

        let user = Message.optimisticUser(agentId: agent.id, content: content)
        if let data = image?.data {
            localPreviews[user.id] = [data]
        }
        messages.append(user)
        isSending = true
        defer { isSending = false }

        do {
            try await client.sendMessage(
                agentId: agent.id,
                content: content,
                images: image.map { [$0.asInput] } ?? [],
                mentions: mentionIDs,
                replyTo: agent.isChannel ? threadID : nil,
                channelId: agent.isChannel ? nil : lastExtraChannelID
            ) { [weak self] event in
                Task { @MainActor in
                    self?.handle(event, agentId: agent.id)
                }
            }
            if !Task.isCancelled, selectedAgentID == agent.id {
                messages = try await client.listMessages(agentId: agent.id, threadId: threadID)
                prunePreviews()
                if !agent.isChannel {
                    if let channelId = messages.compactMap({ $0.visibleJump(in: self.agents)?.channelId }).last {
                        unreadChannelIDs.insert(channelId)
                    }
                }
            }
        } catch is CancellationError {
            await refreshMessages()
        } catch {
            if let runtime = error as? RuntimeError, case .http(let status, let message) = runtime, status == 422 {
                composerError = message
                messages.removeAll { $0.id == user.id }
                draft = content
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    func refreshMessages() async {
        guard let client, let id = selectedAgentID, isConfigured else { return }
        do {
            messages = try await client.listMessages(agentId: id, threadId: threadID)
            prunePreviews()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handleSceneActive() async {
        guard isConfigured else { return }
        if agents.isEmpty {
            await bootstrap()
        } else {
            await refreshMessages()
        }
    }

    private func handle(_ event: RuntimeClient.StreamEvent, agentId: String) {
        guard selectedAgentID == agentId else { return }
        let onTimeline = selectedAgent?.isChannel == true && threadID == nil
        switch event {
        case .delta(let id, let text, let senderId, let senderName, let senderAvatar):
            if onTimeline { return }
            if let index = messages.firstIndex(where: { $0.id == id }) {
                messages[index].content += text
            } else {
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
            if let index = messages.firstIndex(where: { $0.id == message.id }) {
                messages[index] = message
            } else {
                messages.append(message)
            }
        case .error(let message):
            errorMessage = message
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

    var composerChipNames: [String] {
        Array(pickedMentions.keys)
    }

    private func prunePreviews() {
        let ids = Set(messages.map(\.id))
        localPreviews = localPreviews.filter { ids.contains($0.key) }
    }
}
