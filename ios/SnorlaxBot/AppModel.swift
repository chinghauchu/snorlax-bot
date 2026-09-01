// SPDX-License-Identifier: Apache-2.0
import Foundation
import Observation
import SwiftUI
import UIKit

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
    var toolTraces: [LiveToolTrace] = []
    var threadID: String?
    var unreadChannelIDs: Set<String> = []
    var lastExtraChannelID: String?
    var localPreviews: [String: [Data]] = [:]
    var draft = "" {
        didSet {
            if SkillPicker.query(in: draft) == nil {
                skillPickerDismissed = false
            }
        }
    }
    var pendingAttachments: [PendingChatAttachment] = []
    var attachError: String?
    var isSending = false
    var errorMessage: String?
    var composerError: String?
    var wantsComposerFocus = false
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

    var canCompose: Bool {
        client != nil && !isSending && selectedAgent != nil && !computerTakeoverOpen
    }

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
            plugins = []
            pluginCatalog = []
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
            plugins = (try? await client.listPlugins()) ?? []
            pluginCatalog = (try? await client.listPluginCatalog()) ?? []
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
        attachError = nil
        pendingAttachments = []
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
            composerSkills = []
            return
        }
        do {
            messages = try await client.listMessages(agentId: id, threadId: thread)
            prunePreviews()
        } catch {
            errorMessage = error.localizedDescription
            messages = []
        }
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

    func send() async {
        guard let client, let agent = selectedAgent else { return }
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let chips = pendingAttachments
        guard !content.isEmpty || !chips.isEmpty else { return }
        guard attachError == nil else { return }
        let mentionIDs = mentionIDs(in: content)
        draft = ""
        pendingComposerCaret = 0
        pickedMentions = [:]
        pendingAttachments = []
        attachError = nil
        composerError = nil

        let user = Message.optimisticUser(
            agentId: agent.id,
            content: content,
            attachments: chips.map(\.asAttachment)
        )
        let previews = chips.compactMap(\.previewData)
        if !previews.isEmpty {
            localPreviews[user.id] = previews
        }
        messages.append(user)
        toolTraces = []
        isSending = true
        defer { isSending = false }

        do {
            try await client.sendMessage(
                agentId: agent.id,
                content: content,
                images: [],
                mentions: mentionIDs,
                replyTo: agent.isChannel ? threadID : nil,
                channelId: agent.isChannel ? nil : lastExtraChannelID,
                attachmentIds: chips.map(\.id)
            ) { [weak self] event in
                Task { @MainActor in
                    self?.handle(event, agentId: agent.id)
                }
            }
            if !Task.isCancelled, selectedAgentID == agent.id {
                messages = try await client.listMessages(agentId: agent.id, threadId: threadID)
                toolTraces = []
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
            if let runtime = error as? RuntimeError, case .http(let status, let message) = runtime, status == 422 || status == 409 {
                composerError = message
                messages.removeAll { $0.id == user.id }
                draft = content
                pendingAttachments = chips
            } else {
                errorMessage = error.localizedDescription
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

    func regenerate() async {
        guard let client, let agent = selectedAgent, !agent.isChannel, !isSending else { return }
        composerError = nil
        dropLastAssistantTurn()
        toolTraces = []
        isSending = true
        defer { isSending = false }
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
                    self?.handle(event, agentId: agent.id)
                }
            }
            if !Task.isCancelled, selectedAgentID == agent.id {
                messages = try await client.listMessages(agentId: agent.id, threadId: threadID)
                toolTraces = []
                prunePreviews()
            }
        } catch is CancellationError {
            await refreshMessages()
        } catch {
            if let runtime = error as? RuntimeError, case .http(_, let message) = runtime {
                composerError = message
            } else {
                errorMessage = error.localizedDescription
            }
            await refreshMessages()
        }
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
        defer { isSending = false }
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
                    self?.handle(event, agentId: agent.id)
                }
            }
            if !Task.isCancelled, selectedAgentID == agent.id {
                messages = try await client.listMessages(agentId: agent.id, threadId: threadID)
                toolTraces = []
                prunePreviews()
            }
        } catch is CancellationError {
            await refreshMessages()
        } catch {
            if let runtime = error as? RuntimeError, case .http(_, let message) = runtime {
                composerError = message
            } else {
                errorMessage = error.localizedDescription
            }
            await refreshMessages()
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

    func refreshRosterQuietly() async {
        guard let client, isConfigured else { return }
        do {
            agents = try await client.listAgents()
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
