// SPDX-License-Identifier: Apache-2.0
import PhotosUI
import SwiftUI

struct ProfileSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let agent: Agent
    @State private var editing = false
    @State private var draft: Agent
    @State private var pickerItem: PhotosPickerItem?

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
                if live.isChannel {
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
                    if !live.isChannel, !editing {
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
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
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
