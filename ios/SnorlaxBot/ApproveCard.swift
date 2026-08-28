// SPDX-License-Identifier: Apache-2.0
import SwiftUI
import UIKit

struct ApproveCardView: View {
    let message: Message
    @Environment(AppModel.self) private var model

    private var card: ApproveCard { message.approve! }
    private var pending: Bool { message.approveStatus == .pending }
    private var interactive: Bool { pending && !model.isSending }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                Text(card.command)
                    .font(.system(size: 12, design: .monospaced))
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, interactive ? 22 : 0)
                    .onLongPressGesture {
                        UIPasteboard.general.string = card.command
                    }
                if interactive {
                    Button {
                        Task { await model.denyApprove(id: message.id) }
                    } label: {
                        Text("×")
                            .font(.system(size: 16))
                            .foregroundStyle(.secondary)
                            .frame(width: 20, height: 20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Deny")
                }
            }
            if message.approveStatus == .denied {
                Text("Denied")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }
            if interactive {
                VStack(spacing: 6) {
                    Button {
                        Task { await model.answerApprove(id: message.id) }
                    } label: {
                        Text("Approve")
                            .font(.system(size: 13, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                    .background(Color.accentColor.opacity(0.28), in: RoundedRectangle(cornerRadius: 8))
                    Button {
                        Task { await model.denyApprove(id: message.id) }
                    } label: {
                        Text("Deny")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 10)
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
