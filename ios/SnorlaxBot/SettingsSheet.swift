// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var showToken = false
    @State private var showAdd = false
    @State private var pendingRemove: Plugin?
    @State private var catalogAdding: String?

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
                                if plugin.status == .needsAuth {
                                    Button("Connect") {
                                        Task { _ = await model.connectPlugin(id: plugin.id) }
                                    }
                                    .font(.system(size: 14))
                                }
                                Button("Remove") {
                                    pendingRemove = plugin
                                }
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
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
                            .font(.system(size: 12))
                            .textCase(nil)
                            .disabled(!model.isConfigured)
                    }
                }

                if !model.pluginCatalog.isEmpty {
                    Section {
                        ForEach(model.pluginCatalog) { entry in
                            HStack {
                                Text(entry.name)
                                    .font(.system(size: 14))
                                Spacer()
                                Button("Add") {
                                    catalogAdding = entry.id
                                    Task {
                                        _ = await model.addCatalogPlugin(entry)
                                        catalogAdding = nil
                                    }
                                }
                                .font(.system(size: 12))
                                .disabled(!model.isConfigured || catalogAdding == entry.id)
                            }
                            .frame(minHeight: 44)
                        }
                    } header: {
                        Text("Catalog")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .textCase(nil)
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
                pendingRemove.map { "Remove \($0.name)? This disconnects it." } ?? "",
                isPresented: Binding(
                    get: { pendingRemove != nil },
                    set: { if !$0 { pendingRemove = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Remove", role: .destructive) {
                    if let plugin = pendingRemove {
                        Task { await model.removePlugin(id: plugin.id) }
                    }
                    pendingRemove = nil
                }
                Button("Cancel", role: .cancel) { pendingRemove = nil }
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
        case stdio
        case url = "URL"
        var id: String { rawValue }
    }

    private var canAdd: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        if mode == .stdio {
            return !command.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
                    TextField("Command", text: $command, prompt: Text("npx"))
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Arguments", text: $args, prompt: Text("-y package"))
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    TextField("Server URL", text: $url, prompt: Text("https://"))
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                }
                Button("Add") {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(saving || !model.isConfigured || !canAdd)
            }
            .navigationTitle("Add plugin")
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
        let ok: Bool
        if mode == .stdio {
            ok = await model.addPlugin(name: name, command: command, args: args, url: nil)
        } else {
            ok = await model.addPlugin(name: name, command: nil, args: "", url: url)
        }
        if ok { dismiss() }
    }
}
