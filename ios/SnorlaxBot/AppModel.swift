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

    var canCompose: Bool { client != nil && !isSending }

    var visibleAgents: [Agent] {
        agents.isEmpty ? [.placeholderChannel, .placeholder] : agents
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
            return
        }
        do {
            let roster = try await client.listAgents()
            agents = roster
            let channel = roster.first(where: \.isChannel)
            let seed = channel ?? roster.first(where: \.isSeed) ?? roster.first
            if let seed {
                await select(seed.id, push: true)
                wantsComposerFocus = true
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func select(_ id: String, push: Bool) async {
        selectedAgentID = id
        if push, navigationPath.last != id {
            navigationPath = [id]
        }
        guard isConfigured, let client else {
            messages = []
            localPreviews = [:]
            return
        }
        do {
            messages = try await client.listMessages(agentId: id)
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

    func delete(_ agent: Agent) async {
        guard !agent.isProtected, let client else { return }
        do {
            try await client.deleteAgent(id: agent.id)
            agents.removeAll { $0.id == agent.id }
            if selectedAgentID == agent.id {
                let next = agents.first(where: \.isChannel) ?? agents.first(where: \.isSeed) ?? agents.first
                if let next {
                    await select(next.id, push: true)
                } else {
                    selectedAgentID = Agent.channelID
                    messages = []
                    navigationPath = []
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveProfile(_ draft: Agent) async {
        guard let client else { return }
        do {
            let updated = try await client.patchAgent(
                AgentPatch(
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
                mentions: mentionIDs
            ) { [weak self] event in
                Task { @MainActor in
                    self?.handle(event, agentId: agent.id)
                }
            }
            if !Task.isCancelled, selectedAgentID == agent.id {
                messages = try await client.listMessages(agentId: agent.id)
                prunePreviews()
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
            messages = try await client.listMessages(agentId: id)
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
        switch event {
        case .delta(let id, let text, let senderId, let senderName, let senderAvatar):
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
        if let at = draft.lastIndex(of: "@") {
            let prefix = draft[..<at]
            let afterAt = draft[draft.index(after: at)...]
            let token = afterAt.prefix { ch in
                ch.isLetter || ch.isNumber || ch == "." || ch == "_" || ch == "-"
            }
            let rest = afterAt.dropFirst(token.count)
            draft = "\(prefix)@\(agent.name) \(rest)"
        } else {
            draft += "@\(agent.name) "
        }
    }

    private func prunePreviews() {
        let ids = Set(messages.map(\.id))
        localPreviews = localPreviews.filter { ids.contains($0.key) }
    }
}
