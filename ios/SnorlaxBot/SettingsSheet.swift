// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var showToken = false

    var body: some View {
        @Bindable var model = model
        NavigationStack {
            Form {
                Section("Appearance") {
                    Picker("Theme", selection: $model.theme) {
                        ForEach(AppTheme.allCases) { theme in
                            Text(theme.label).tag(theme)
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Accent")
                            .font(.system(size: 14))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(AccentChoice.allCases) { choice in
                                    Button {
                                        model.accent = choice
                                    } label: {
                                        Circle()
                                            .fill(choice.color)
                                            .frame(width: 28, height: 28)
                                            .overlay {
                                                if model.accent == choice {
                                                    Image(systemName: "checkmark")
                                                        .font(.system(size: 11, weight: .bold))
                                                        .foregroundStyle(.white)
                                                }
                                            }
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(choice.rawValue)
                                }
                            }
                        }
                    }
                    .font(.system(size: 14))
                }

                Section("Runtime") {
                    TextField("Runtime URL", text: $model.runtimeURL, prompt: Text("http://<spark-lan>:8787"))
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textContentType(.URL)
                    Text("Mac-local: http://127.0.0.1:8787 or http://localhost:8787. Spark: LAN hostname. Never the model port.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    HStack {
                        Group {
                            if showToken {
                                TextField("Token", text: $model.token)
                            } else {
                                SecureField("Token", text: $model.token)
                            }
                        }
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.password)

                        Button {
                            showToken.toggle()
                        } label: {
                            Image(systemName: showToken ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel(showToken ? "Hide token" : "Show token")
                    }
                }

                Section {
                    if model.plugins.isEmpty {
                        Text("No plugins yet.")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(model.plugins) { plugin in
                            HStack {
                                Text(plugin.name)
                                    .font(.system(size: 14))
                                Spacer()
                                Text(plugin.status == .connected ? "Connected" : "Needs sign-in")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                                if plugin.status != .connected {
                                    Button("Connect") {
                                        Task { _ = await model.connectPlugin(id: plugin.id) }
                                    }
                                    .font(.system(size: 14))
                                }
                            }
                            .frame(minHeight: 44)
                        }
                    }
                } header: {
                    Text("Plugins")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
            .font(.system(size: 14))
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            await model.refreshPlugins()
        }
        .onDisappear {
            Task { await model.bootstrap() }
        }
    }
}
