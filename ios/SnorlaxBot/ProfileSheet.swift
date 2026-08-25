// SPDX-License-Identifier: Apache-2.0
import PhotosUI
import SwiftUI

struct ProfileSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Agent
    @State private var pickerItem: PhotosPickerItem?

    init(agent: Agent) {
        _draft = State(initialValue: agent)
    }

    var body: some View {
        NavigationStack {
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
            }
            .navigationTitle(draft.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await model.saveProfile(draft)
                            dismiss()
                        }
                    }
                    .disabled(draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.isConfigured)
                }
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task { await loadAvatar(item) }
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
