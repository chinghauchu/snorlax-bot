// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var model = model
        Group {
            if UIDevice.current.userInterfaceIdiom == .pad {
                iPadRoot()
            } else {
                iPhoneRoot()
            }
        }
        .sheet(isPresented: $model.showSettings) {
            SettingsSheet()
        }
        .fullScreenCover(isPresented: takeoverPresented) {
            if let id = model.computerTakeoverAgentId,
               let agent = model.visibleAgents.first(where: { $0.id == id }),
               !agent.isChannel
            {
                ComputerTakeoverView(agent: agent)
                    .environment(model)
                    .interactiveDismissDisabled(true)
            }
        }
        .alert("Error", isPresented: errorPresented) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .task { await model.bootstrap() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await model.handleSceneActive() }
            }
        }
    }

    private var takeoverPresented: Binding<Bool> {
        Binding(
            get: { model.computerTakeoverOpen },
            set: { open in
                if !open, model.computerTakeoverOpen, let id = model.computerTakeoverAgentId {
                    Task { await model.closeComputer(agentId: id) }
                }
            }
        )
    }

    private var errorPresented: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )
    }
}

private struct iPhoneRoot: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $model.navigationPath) {
            AgentListView()
                .navigationTitle("Snorlax-Bot")
                .navigationBarTitleDisplayMode(.large)
                .navigationDestination(for: String.self) { id in
                    ChatView(agentID: id)
                }
        }
    }
}

private struct iPadRoot: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        NavigationSplitView {
            AgentListView()
                .navigationTitle("Snorlax-Bot")
                .navigationBarTitleDisplayMode(.large)
                .navigationSplitViewColumnWidth(min: 220, ideal: 256, max: 320)
        } detail: {
            if let id = model.selectedAgentID {
                ChatView(agentID: id)
            } else if model.isConfigured {
                ChatView(agentID: "")
            } else {
                ChatView(agentID: Agent.channelID)
            }
        }
        .navigationSplitViewStyle(.balanced)
    }
}

#Preview {
    ContentView()
        .environment(AppModel())
        .preferredColorScheme(.dark)
}
