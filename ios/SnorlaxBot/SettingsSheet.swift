// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var showToken = false
    @State private var showAdd = false
    @State private var pendingUninstall: Plugin?

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
                                if plugin.status == .connected {
                                    Button("Disconnect") {
                                        Task { await model.disconnectPlugin(id: plugin.id) }
                                    }
                                    .font(.system(size: 14))
                                } else {
                                    Button("Connect") {
                                        Task { _ = await model.connectPlugin(id: plugin.id) }
                                    }
                                    .font(.system(size: 14))
                                }
                                Button("Uninstall", role: .destructive) {
                                    pendingUninstall = plugin
                                }
                                .font(.system(size: 14))
                            }
                            .frame(minHeight: 44)
                        }
                    }
                } header: {
                    HStack {
                        Text("Plugins")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .textCase(nil)
                        Spacer()
                        Button("Add") { showAdd = true }
                            .font(.system(size: 14))
                            .textCase(nil)
                            .disabled(!model.isConfigured)
                    }
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
            .sheet(isPresented: $showAdd) {
                AddPluginSheet()
            }
            .confirmationDialog(
                pendingUninstall.map { "Uninstall \($0.name)? This removes it from the runtime catalog." } ?? "",
                isPresented: Binding(
                    get: { pendingUninstall != nil },
                    set: { if !$0 { pendingUninstall = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Uninstall", role: .destructive) {
                    if let plugin = pendingUninstall {
                        Task { await model.uninstallPlugin(id: plugin.id) }
                    }
                    pendingUninstall = nil
                }
                Button("Cancel", role: .cancel) { pendingUninstall = nil }
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

private struct AddPluginSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var mode = Transport.stdio
    @State private var command = ""
    @State private var args = ""
    @State private var url = ""
    @State private var saving = false

    private enum Transport: String, CaseIterable, Identifiable {
        case stdio = "Command"
        case url = "URL"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .font(.system(size: 14))
                Picker("Transport", selection: $mode) {
                    ForEach(Transport.allCases) { item in
                        Text(item.rawValue).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                if mode == .stdio {
                    TextField("Command", text: $command)
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Args", text: $args)
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    TextField("URL", text: $url, prompt: Text("http://127.0.0.1:8765/mcp"))
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }
            }
            .navigationTitle("Add plugin")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(saving || !model.isConfigured)
                }
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let ok: Bool
        if mode == .stdio {
            ok = await model.addPlugin(name: name, command: command, args: args, url: nil)
        } else {
            ok = await model.addPlugin(name: name, command: nil, args: "", url: url)
        }
        if ok { dismiss() }
    }
}
