// SPDX-License-Identifier: Apache-2.0
import SwiftUI

/// v0.73: gestures and hardware-keyboard shortcuts that already exist
/// on the chat screen. Long-press actions come from the message menu
/// and the approve-command copy. Hardware keys are `UIKeyCommand`
/// (Escape, Up, Option+Up/Down, ⌘L / ⌃L, ⌘N / ⌃N, ⌘1–⌘9 / ⌃1–⌃9, ⌘⇧C / ⌃⇧C, ⌘⇧A / ⌃⇧A, ⌘⇧P / ⌃⇧P, ⌘⇧M / ⌃⇧M, ⌘⇧U / ⌃⇧U, ⌘⇧R / ⌃⇧R, ⌘⇧D / ⌃⇧D, ⌘⇧E / ⌃⇧E, ⌘⇧G / ⌃⇧G, ⌘⇧F / ⌃⇧F), `.onKeyPress`
/// (Page Up / Page Down, ⌘↑ / ⌘↓, ⌘N, ⌘1–⌘9, ⌘⇧A, ⌘⇧⌫, ⌘⇧P, ⌘⇧M, ⌘⇧U, ⌘⇧R, ⌘⇧D, ⌘⇧E, ⌘⇧G, ⌘⇧F, and Enter / Delete / Esc on the delete confirm), `.keyboardShortcut` (Cmd-F), and
/// the composer Return / Shift-Return presses. ⌘L focuses the composer
/// and does not insert or send. ⌘N starts a new chat through New agent
/// and does not send. ⌘1–⌘8 opens that chat and ⌘9 opens the last one.
/// ⌘⇧C copies the last assistant reply
/// and does not send. ⌘⇧A archives the open chat and does not send.
/// ⌘⇧⌫ clears the open chat's composer draft and does not send.
/// ⌘⇧P pins or unpins the open chat and does not insert or send.
/// ⌘⇧M mutes or unmutes the open chat and does not insert or send.
/// ⌘⇧U marks the open chat unread, or read when it already shows the
/// unread dot, and does not insert or send.
/// ⌘⇧R starts rename on the open chat and does not insert or send.
/// ⌘⇧D asks to delete the open chat with the same confirm as sidebar
/// Delete. Enter or Delete confirms. Esc or Cancel aborts and focus
/// returns to the composer. A key repeat never confirms. The chord
/// does not insert or send.
/// ⌘⇧E copies the open chat's loaded transcript as plain text and
/// does not insert or send.
/// ⌘⇧G collapses every expanded tool-trace group, or expands every
/// group when all are collapsed, and does not insert or send.
/// ⌘⇧F toggles All / Unread and does not insert or send. ⌘F still finds.
/// Page Up / Page Down scroll the transcript.
/// ⌘↑ / ⌘↓ jump to the oldest or latest messages. No Cmd-K on iOS
/// (the switcher is the chat-list search field). No HTTP.
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
            id: "quote",
            keys: "Select text, then Quote",
            action: "Insert a quote in the composer"
        ),
        Row(
            id: "edit",
            keys: "Long-press your message",
            action: "Copy, or \(RecallDraft.editAsNewMessage)"
        ),
        Row(
            id: "retry",
            keys: "Long-press a failed send",
            action: "Retry or Remove"
        ),
        Row(
            id: "image",
            keys: "Tap an image",
            action: "View it full size"
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
        Row(id: "chat-nav", keys: ChatNav.keysLabel, action: ChatNav.action),
        Row(id: "jump-chat", keys: ChatJump.keysLabel, action: ChatJump.action),
        Row(id: "archive-chat", keys: ArchiveOpenChat.keysLabel, action: ArchiveOpenChat.action),
        Row(id: "clear-draft", keys: ClearComposerDraft.keysLabel, action: ClearComposerDraft.action),
        Row(id: "pin-chat", keys: PinOpenChat.keysLabel, action: PinOpenChat.action),
        Row(id: "mute-chat", keys: MuteOpenChat.keysLabel, action: MuteOpenChat.action),
        Row(id: "mark-unread", keys: MarkOpenChat.keysLabel, action: MarkOpenChat.action),
        Row(id: "rename-chat", keys: RenameOpenChat.keysLabel, action: RenameOpenChat.action),
        Row(id: "delete-chat", keys: DeleteOpenChat.keysLabel, action: DeleteOpenChat.action),
        Row(id: "copy-transcript", keys: CopyTranscript.keysLabel, action: CopyTranscript.action),
        Row(id: "tool-traces", keys: ToolTraceGroups.keysLabel, action: ToolTraceGroups.action),
        Row(id: "unread-filter", keys: ChatListFilterKey.keysLabel, action: ChatListFilterKey.action),
        Row(id: "focus", keys: FocusComposer.keysLabel, action: FocusComposer.action),
        Row(id: "new-chat", keys: NewChat.keysLabel, action: NewChat.action),
        Row(id: "copy-last", keys: CopyLastReply.keysLabel, action: CopyLastReply.action),
        Row(id: "page", keys: TranscriptScroll.pageKeysLabel, action: TranscriptScroll.pageAction),
        Row(id: "transcript-edge", keys: TranscriptScroll.edgeKeysLabel, action: TranscriptScroll.edgeAction),
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
