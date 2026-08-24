// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0 stub. Pairing fields are real; chat and Keychain are later tickets.
struct ContentView: View {
    @State private var runtimeURL = "http://127.0.0.1:8787"
    @State private var token = ""
    @State private var status = "iOS companion is a stub this pass. Use the desktop client to chat."

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Snorlax-Bot")
                    .font(.largeTitle.weight(.medium))
                Text("Local teammates on your DGX Spark. Same bots as desktop, same LAN token.")
                    .foregroundStyle(.secondary)

                TextField("Runtime URL", text: $runtimeURL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .textFieldStyle(.roundedBorder)

                SecureField("Bearer token", text: $token)
                    .textFieldStyle(.roundedBorder)

                Button("Save locally (not yet talking to /v1)") {
                    status = "Chat + Keychain pairing ship in tickets I1–I3. Runtime contract is protocol/openapi.yaml."
                }
                .buttonStyle(.borderedProminent)

                Text(status)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Spacer()
            }
            .padding()
            .navigationTitle("Companion")
        }
    }
}

#Preview {
    ContentView()
}
