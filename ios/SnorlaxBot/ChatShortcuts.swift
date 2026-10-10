// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.73: gestures and hardware-keyboard shortcuts that already exist
/// on the chat screen. Long-press actions come from the message menu
/// and the approve-command copy. Hardware keys are `UIKeyCommand`
/// (Escape, Up), `.keyboardShortcut` (Cmd-F), and the composer
/// Return / Shift-Return presses. No Cmd-K on iOS (the switcher is
/// the chat-list search field). No HTTP.
/// Keep in lockstep with `desktop/src/chatShortcuts.ts`.
enum ChatShortcuts {
    static let title = "Gestures & shortcuts"
    static let gesturesHeading = "Gestures"
    static let keysHeading = "Hardware keyboard"
    static let doneLabel = "Done"

    struct Row: Identifiable {
        let id: String
        let keys: String
        let action: String
    }

    /// Long-press actions already on the chat screen.
    static let gestures: [Row] = [
        Row(
            id: "message",
            keys: "Long-press a message",
            action: "Copy, Speak, Regenerate, or the time"
        ),
        Row(
            id: "edit",
            keys: "Long-press your message",
            action: RecallDraft.editAsNewMessage
        ),
        Row(
            id: "approve",
            keys: "Long-press an approve command",
            action: "Copy the command"
        ),
    ]

    /// Hardware keyboard only. Soft-keyboard Return still inserts a newline.
    static let keys: [Row] = [
        Row(id: "send", keys: "Return", action: "Send"),
        Row(id: "newline", keys: "Shift Return", action: "New line"),
        Row(id: "escape", keys: "Esc", action: "Stop, close, or jump"),
        Row(id: "recall", keys: "↑", action: "Recall last message"),
        Row(id: "find", keys: "⌘F", action: "Find in chat"),
        Row(
            id: "find-step",
            keys: "Return / Shift Return",
            action: "Next or previous match"
        ),
    ]
}

struct ChatShortcutsSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section(ChatShortcuts.gesturesHeading) {
                    ForEach(ChatShortcuts.gestures) { row in
                        shortcutRow(row)
                    }
                }
                Section(ChatShortcuts.keysHeading) {
                    ForEach(ChatShortcuts.keys) { row in
                        shortcutRow(row)
                    }
                }
            }
            .navigationTitle(ChatShortcuts.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(ChatShortcuts.doneLabel) {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func shortcutRow(_ row: ChatShortcuts.Row) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.keys)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Text(row.action)
                .font(.system(size: 14))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.keys), \(row.action)")
    }
}
