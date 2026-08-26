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
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .task(id: live.id) {
            await model.loadRoutines(for: live.id)
            await model.loadComputer(for: live.id)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                await model.loadComputer(for: live.id)
            }
        }
    }

    private var computerBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Computer")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
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
                .allowsHitTesting(false)
            } else {
                Text("No computer yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var paneRoutines: [Routine] {
        model.routines.filter { $0.visibleOnPane(plugins: model.plugins) }
    }

    private var routinesList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Routines")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
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
