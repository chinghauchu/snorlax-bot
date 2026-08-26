// SPDX-License-Identifier: Apache-2.0
import SwiftUI

struct ConnectCardView: View {
    let message: Message
    @Environment(AppModel.self) private var model

    private var card: ConnectCard { message.connect! }
    private var pending: Bool { message.connectStatus == .pending }
    private var interactive: Bool { pending && !model.isSending }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(card.prompt)
                        .font(.system(size: 14))
                        .fixedSize(horizontal: false, vertical: true)
                    if let help = card.helpText, !help.isEmpty {
                        Text(help)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                    if message.connectStatus == .connected {
                        Text("Connected")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    } else if message.connectStatus == .dismissed {
                        Text("Dismissed")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, interactive ? 22 : 0)
                if interactive {
                    Button {
                        Task { await model.dismissConnect(id: message.id) }
                    } label: {
                        Text("×")
                            .font(.system(size: 16))
                            .foregroundStyle(.secondary)
                            .frame(width: 20, height: 20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Dismiss")
                }
            }
            if interactive {
                Button {
                    Task { await model.answerConnect(id: message.id, pluginId: card.pluginId) }
                } label: {
                    Text("Connect")
                        .font(.system(size: 13, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.plain)
                .background(Color.accentColor.opacity(0.28), in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(12)
        .frame(minWidth: 240, maxWidth: 320, alignment: .leading)
        .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(uiColor: .separator), lineWidth: 1)
        )
    }
}
