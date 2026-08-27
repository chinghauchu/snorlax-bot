// SPDX-License-Identifier: Apache-2.0
import PhotosUI
import SwiftUI
import UIKit

struct ProfileSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let agent: Agent
    @State private var editing = false
    @State private var draft: Agent
    @State private var pickerItem: PhotosPickerItem?
    @State private var copiedRoutineId: String?
    @State private var showAddRoutine = false
    @State private var showAddSkill = false
    @State private var pendingRemove: PendingRemove?
    @State private var editingSkill: Skill?

    private enum PendingRemove {
        case routine(Routine)
        case skill(Skill)

        var name: String {
            switch self {
            case .routine(let row): return row.name
            case .skill(let row): return row.name
            }
        }
    }

    init(agent: Agent) {
        self.agent = agent
        _draft = State(initialValue: agent)
    }

    private var live: Agent {
        model.visibleAgents.first(where: { $0.id == agent.id }) ?? agent
    }

    private var members: [Agent] {
        live.memberIds.compactMap { id in
            model.visibleAgents.first { $0.id == id && !$0.isChannel }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if live.isChannel, editing, live.canEditChannel {
                    channelEditForm
                } else if live.isChannel {
                    channelPane
                } else if editing {
                    editForm
                } else {
                    agentPane
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if (!live.isChannel || live.canEditChannel), !editing {
                        Button {
                            draft = live
                            editing = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                        .accessibilityLabel("Edit")
                    }
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task { await loadAvatar(item) }
            }
        }
    }

    private var agentPane: some View {
        VStack(alignment: .leading, spacing: 8) {
            AgentAvatar(agent: live, size: 72)
            Text(live.name)
                .font(.system(size: 16, weight: .semibold))
            if !live.title.isEmpty {
                Text(live.title)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            if !live.description.isEmpty {
                Text(live.description)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            computerBlock
            routinesList
            skillsList
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .task(id: live.id) {
            await model.loadRoutines(for: live.id)
            await model.loadSkillsList(for: live.id)
            await model.loadComputer(for: live.id)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                await model.loadComputer(for: live.id)
            }
        }
        .sheet(isPresented: $showAddRoutine) {
            AddRoutineSheet(agentId: live.id)
        }
        .sheet(isPresented: $showAddSkill) {
            AddSkillSheet(agentId: live.id)
        }
        .sheet(item: $editingSkill) { skill in
            EditSkillSheet(agentId: live.id, skill: skill)
        }
        .confirmationDialog(
            pendingRemove.map { "Remove \($0.name)?" } ?? "",
            isPresented: Binding(
                get: { pendingRemove != nil },
                set: { if !$0 { pendingRemove = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                switch pendingRemove {
                case .routine(let routine):
                    Task {
                        await model.removeRoutine(agentId: live.id, id: routine.id)
                    }
                case .skill(let skill):
                    Task {
                        await model.removeSkill(agentId: live.id, id: skill.id)
                    }
                case nil:
                    break
                }
                pendingRemove = nil
            }
            Button("Cancel", role: .cancel) { pendingRemove = nil }
        }
    }

    private var computerBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(ComputerTakeoverChrome.computerLabel)
                    .font(.system(size: ComputerTakeoverChrome.labelSize))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                if ComputerTakeoverChrome.canOpen(hasSandbox: model.computerPreview?.hasSandbox) {
                    Button(ComputerTakeoverChrome.openLabel) {
                        Task { await model.openComputer(for: live.id) }
                    }
                    .font(.system(size: ComputerTakeoverChrome.labelSize))
                    .disabled(!model.isConfigured)
                    .accessibilityLabel(ComputerTakeoverChrome.openLabel)
                }
            }
            .padding(.top, 12)
            if model.computerPreview?.hasSandbox == true {
                ZStack {
                    Color.black
                    if let image = model.computerImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                    }
                }
                .aspectRatio(16 / 10, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    Task { await model.openComputer(for: live.id) }
                }
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel(ComputerTakeoverChrome.openLabel)
            } else {
                Text(ComputerTakeoverChrome.noComputerYet)
                    .font(.system(size: ComputerTakeoverChrome.labelSize))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var paneRoutines: [Routine] {
        model.routines.filter { $0.visibleOnPane(plugins: model.plugins) }
    }

    private var routinesList: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Routines")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Button("Add") { showAddRoutine = true }
                    .font(.system(size: 12))
                    .disabled(!model.isConfigured)
            }
            .padding(.top, 12)
            .padding(.bottom, 8)
            if paneRoutines.isEmpty {
                Text("No routines yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                ForEach(paneRoutines) { routine in
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(routine.name)
                                .font(.system(size: 14, weight: .medium))
                                .opacity(routine.enabled ? 1 : 0.5)
                            Text(routine.mutedLine)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        if routine.showsWebhookCopy {
                            Button(copiedRoutineId == routine.id ? "Copied" : "Copy") {
                                UIPasteboard.general.string = routine.copyPayload
                                copiedRoutineId = routine.id
                                Task {
                                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                                    if copiedRoutineId == routine.id {
                                        copiedRoutineId = nil
                                    }
                                }
                            }
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.secondary)
                            .buttonStyle(.plain)
                            .accessibilityLabel("Copy webhook URL")
                        }
                        Button("Remove") {
                            pendingRemove = .routine(routine)
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(routine.name)")
                        Toggle(isOn: Binding(
                            get: { routine.enabled },
                            set: { on in
                                Task {
                                    await model.setRoutineEnabled(
                                        agentId: live.id,
                                        id: routine.id,
                                        enabled: on
                                    )
                                }
                            }
                        )) {
                            EmptyView()
                        }
                        .labelsHidden()
                        .disabled(!model.isConfigured)
                        .accessibilityLabel(routine.enabled ? "Pause \(routine.name)" : "Enable \(routine.name)")
                    }
                    .frame(minHeight: 44)
                }
            }
        }
    }

    private var skillsList: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Skills")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Button("Add") { showAddSkill = true }
                    .font(.system(size: 12))
                    .disabled(!model.isConfigured)
            }
            .padding(.top, 12)
            .padding(.bottom, 8)
            if model.skills.isEmpty {
                Text("No skills yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                ForEach(model.skills) { skill in
                    HStack(spacing: 8) {
                        Text(skill.name)
                            .font(.system(size: 14, weight: .medium))
                        Spacer(minLength: 0)
                        Button("Edit") {
                            editingSkill = skill
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .buttonStyle(.plain)
                        .accessibilityLabel("Edit \(skill.name)")
                        Button("Remove") {
                            pendingRemove = .skill(skill)
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(skill.name)")
                    }
                    .frame(minHeight: 44)
                }
            }
        }
    }

    private var channelPane: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(live.name)
                    .font(.system(size: 16, weight: .semibold))
                Text("Channel")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)

            Toggle(isOn: Binding(
                get: { live.sharedProject },
                set: { on in
                    Task { await model.setSharedProject(id: live.id, on: on) }
                }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Shared project")
                        .font(.system(size: 14, weight: .medium))
                    Text("On: channel threads share a sandbox. Off: each agent’s workspace. Not a folder on this Mac.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .disabled(!model.isConfigured)

            VStack(spacing: 0) {
                ForEach(members) { member in
                    HStack(spacing: 10) {
                        AgentAvatar(agent: member, size: 28)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(member.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            if !member.title.isEmpty {
                                Text(member.title)
                                    .font(.system(size: 13))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(height: 44)
                    .padding(.horizontal, 16)
                    .contentShape(Rectangle())
                    .allowsHitTesting(false)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var channelEditForm: some View {
        Form {
            Section {
                TextField("Name", text: $draft.name)
            }
            Section("Members") {
                ForEach(model.visibleAgents.filter { !$0.isChannel }) { agent in
                    Button {
                        if draft.memberIds.contains(agent.id) {
                            draft.memberIds.removeAll { $0 == agent.id }
                        } else {
                            draft.memberIds.append(agent.id)
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
                            Image(systemName: draft.memberIds.contains(agent.id) ? "checkmark.square.fill" : "square")
                                .foregroundStyle(draft.memberIds.contains(agent.id) ? Color.accentColor : .secondary)
                        }
                        .frame(height: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Section {
                Toggle(isOn: $draft.sharedProject) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Shared project")
                        Text("On: channel threads share a sandbox. Off: each agent’s workspace. Not a folder on this Mac.")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Section {
                Button("Save") {
                    Task {
                        await model.saveProfile(draft)
                        editing = false
                    }
                }
                .disabled(draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.isConfigured)
            }
        }
    }

    private var editForm: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    AgentAvatar(agent: draft, size: 72)
                    Spacer()
                }
                PhotosPicker("Choose avatar", selection: $pickerItem, matching: .images)
                    .font(.system(size: 14))
                if draft.avatar != nil {
                    Button("Remove avatar", role: .destructive) {
                        draft.avatar = nil
                    }
                    .font(.system(size: 14))
                }
            }

            Section {
                TextField("Name", text: $draft.name)
                TextField("Title", text: $draft.title)
                TextField("Description", text: $draft.description, axis: .vertical)
                    .lineLimit(3...8)
            }
            .font(.system(size: 14))

            Section {
                Button("Save") {
                    Task {
                        await model.saveProfile(draft)
                        editing = false
                    }
                }
                .disabled(draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.isConfigured)
            }
        }
    }

    private func loadAvatar(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        let mime = data.sniffedImageMIME
        let encoded = data.base64EncodedString()
        await MainActor.run {
            draft.avatar = "data:\(mime);base64,\(encoded)"
            pickerItem = nil
        }
    }
}

private struct AddRoutineSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let agentId: String
    @State private var name = ""
    @State private var skill = ""
    @State private var mode = Mode.schedule
    @State private var cron = ""
    @State private var skills: [Skill] = []
    @State private var saving = false

    private enum Mode: String, CaseIterable, Identifiable {
        case schedule = "Schedule"
        case webhook = "Webhook"
        var id: String { rawValue }
    }

    private var canAdd: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !skill.isEmpty else { return false }
        if mode == .schedule {
            return !cron.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .font(.system(size: 14))
                if skills.isEmpty {
                    Text("No skills yet.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(skills) { row in
                        Button {
                            skill = row.id
                        } label: {
                            HStack {
                                Text(row.name)
                                    .font(.system(size: 14, weight: skill == row.id ? .medium : .regular))
                                    .foregroundStyle(.primary)
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                Picker("When", selection: $mode) {
                    ForEach(Mode.allCases) { item in
                        Text(item.rawValue).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                if mode == .schedule {
                    TextField("Cron", text: $cron, prompt: Text("0 9 * * 1-5"))
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Taipei. Weekdays 9:00 is 0 9 * * 1-5.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                Button("Add") {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(saving || !model.isConfigured || !canAdd)
            }
            .navigationTitle("Add routine")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
            .task {
                skills = await model.loadSkills(for: agentId)
            }
        }
    }

    private func save() async {
        guard canAdd else { return }
        saving = true
        defer { saving = false }
        let ok = await model.addRoutine(
            agentId: agentId,
            name: name,
            skill: skill,
            schedule: mode == .schedule ? cron : nil,
            webhook: mode == .webhook
        )
        if ok { dismiss() }
    }
}

private struct AddSkillSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let agentId: String
    @State private var name = ""
    @State private var source = ""
    @State private var saving = false

    private var canAdd: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .font(.system(size: 14))
                TextEditor(text: $source)
                    .font(.system(size: 12, design: .monospaced))
                    .lineSpacing(12 * 0.45) // 12pt / 1.45
                    .frame(minHeight: 200)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityLabel("Skill source")
                Button("Add") {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(saving || !model.isConfigured || !canAdd)
            }
            .navigationTitle("New skill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
        }
    }

    private func save() async {
        guard canAdd else { return }
        saving = true
        defer { saving = false }
        let ok = await model.addSkill(agentId: agentId, name: name, body: source)
        if ok { dismiss() }
    }
}

private struct EditSkillSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let agentId: String
    let skill: Skill
    @State private var name = ""
    @State private var source = ""
    @State private var saving = false

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .font(.system(size: 14))
                TextEditor(text: $source)
                    .font(.system(size: 12, design: .monospaced))
                    .lineSpacing(12 * 0.45) // 12pt / 1.45
                    .frame(minHeight: 200)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityLabel("Skill source")
                Button("Save") {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(saving || !model.isConfigured || !canSave)
            }
            .navigationTitle("Edit skill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
            .task {
                if let row = await model.loadSkill(agentId: agentId, id: skill.id) {
                    name = row.name
                    source = row.body
                } else {
                    name = skill.name
                }
            }
        }
    }

    private func save() async {
        guard canSave else { return }
        saving = true
        defer { saving = false }
        let ok = await model.saveSkill(
            agentId: agentId,
            id: skill.id,
            name: name,
            body: source
        )
        if ok { dismiss() }
    }
}
