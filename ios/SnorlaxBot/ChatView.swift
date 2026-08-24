// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import PhotosUI

struct ChatView: View {
    let agentID: String
    @Environment(AppModel.self) private var model
    @FocusState private var composerFocused: Bool

    private var agent: Agent {
        model.visibleAgents.first(where: { $0.id == agentID }) ?? .placeholder
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
                LazyVStack(alignment: .leading, spacing: 10) {
                    if model.messages.isEmpty, !model.isConfigured {
                        Text("Paste your Spark URL and token in Settings to start.")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    } else {
                        ForEach(model.messages) { message in
                            MessageBubble(message: message, agent: agent)
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
}

private struct ComposerBar: View {
    let agentName: String
    var focused: FocusState<Bool>.Binding
    @Environment(AppModel.self) private var model
    @State private var pickerItem: PhotosPickerItem?

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
    let agent: Agent

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 48) }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 6) {
                ForEach(Array(message.localPreviews.enumerated()), id: \.offset) { _, data in
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
                    Text(message.content)
                        .font(.system(size: 14))
                        .textSelection(.enabled)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleColor, in: RoundedRectangle(cornerRadius: 16))
            if message.role == .assistant { Spacer(minLength: 48) }
        }
        .padding(.horizontal, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(message.role == .user ? "You" : agent.name)
    }

    private var bubbleColor: Color {
        message.role == .user
            ? Color.accentColor.opacity(0.22)
            : Color(uiColor: .secondarySystemFill)
    }
}
