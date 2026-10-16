// SPDX-License-Identifier: Apache-2.0

/**
 * v0.73: keyboard-shortcuts help for chat keys that already have
 * handlers. Cmd/Ctrl-/ opens the overlay. "?" does too, when focus
 * is not in a text field. Esc or a click outside closes it and does
 * not Stop, close find, close the switcher, or clear a recall.
 * iOS lists the same idea as a Gestures & shortcuts sheet.
 * No HTTP. Keep in lockstep with `ios/SnorlaxBot/ChatShortcuts.swift`.
 */

export const SHORTCUTS_TITLE = "Keyboard shortcuts";

export type ChatShortcut = {
  id: string;
  keys: string;
  action: string;
};

/**
 * Rows are the chat shortcuts already wired on desktop.
 * Enter sends (`composerEnterSends`); Shift Enter stays a newline.
 * Esc stops, closes find / the switcher / menus, clears a recall,
 * jumps, or cancels dictation. Up-arrow recalls. Alt+Up / Alt+Down
 * (Option on macOS) opens the previous or next visible chat.
 * Cmd/Ctrl-F finds. Cmd/Ctrl-K switches. Cmd/Ctrl-Shift-I opens info.
 * Cmd/Ctrl-V pastes an image or file. Cmd/Ctrl-L focuses the composer
 * and does not insert (v0.99). Cmd/Ctrl-Shift-C copies the last
 * assistant reply (v1.00). Page Up / Page Down scroll the transcript
 * one viewport; Cmd/Ctrl-Home / Cmd/Ctrl-End jump to the oldest or
 * latest loaded messages (v1.03). Cmd/Ctrl-Shift-Up /
 * Cmd/Ctrl-Shift-Down jump to the previous or next message you sent
 * (v1.25). An empty composer does not own that chord. A composer
 * that already has text keeps it, so selection stays. Cmd/Ctrl-N starts a new chat
 * through the sidebar New agent path (v1.04). Cmd/Ctrl-1 through
 * Cmd/Ctrl-8 opens that visible chat; Cmd/Ctrl-9 opens the last
 * one (v1.05). Cmd/Ctrl-Shift-A archives the open chat through the
 * sidebar Archive action (v1.06). Cmd/Ctrl-Shift-Backspace clears the
 * open chat's composer draft, text and pending chips, without sending
 * (v1.07). Cmd/Ctrl-Shift-P pins or unpins the open chat through the
 * sidebar Pin action (v1.08). Cmd/Ctrl-Shift-M mutes or unmutes the
 * open chat through the sidebar Mute action (v1.09).
 * Cmd/Ctrl-Shift-U marks the open chat unread, or read when it
 * already shows the unread dot, through the sidebar Mark action
 * (v1.10). Cmd/Ctrl-Shift-R starts rename on the open chat through
 * the sidebar Rename action (v1.11). Cmd/Ctrl-Shift-D asks to delete
 * the open chat with the sidebar Delete confirm (v1.12). Enter or
 * Delete confirms. Esc or Cancel aborts and focus returns to the
 * composer. A key repeat never confirms. Cmd/Ctrl-Shift-E copies the
 * open chat's loaded transcript as plain text (v1.13).
 * Cmd/Ctrl-Shift-G collapses every expanded tool-trace group, or
 * expands every group when all are collapsed (v1.14).
 * Cmd/Ctrl-Shift-F toggles the sidebar All / Unread filter (v1.15).
 * Cmd/Ctrl-F still finds. Cmd/Ctrl-Shift-H opens or closes the
 * Archived chats list through the sidebar Archived control (v1.16).
 * Cmd/Ctrl-Shift-J opens the next unread chat after the one that is
 * open, in that same visible order, wrapping (v1.17).
 * Cmd/Ctrl-Shift-Y regenerates the latest completed assistant LEFT
 * through the Regenerate hover control (v1.18).
 * Cmd/Ctrl-Shift-S moves focus into the sidebar chat list (v1.19).
 * Cmd/Ctrl-Shift-O marks every chat read through the Mark all as
 * read control (v1.20).
 * Cmd/Ctrl-Shift-K opens the previous unread chat before the one
 * that is open, in that same visible order, wrapping (v1.21).
 * Cmd/Ctrl-K without Shift still opens the switcher.
 * Cmd/Ctrl-Shift-B unarchives the open chat through the sidebar
 * Unarchive action when that chat is archived (v1.22).
 * Cmd/Ctrl-Shift-A still only archives.
 * Cmd/Ctrl-[ steps back through recently opened chats and Cmd/Ctrl-]
 * steps forward again (v1.23). The history is in memory for this
 * window. Deleted chats are skipped. Archived chats stay valid.
 * Cmd/Ctrl-= and Cmd/Ctrl-+ make the transcript text one step
 * larger, Cmd/Ctrl-- one step smaller, and Cmd/Ctrl-0 resets it
 * (v1.24). The steps run from 85% to 130% and persist locally.
 * Find's Enter / Shift-Enter steps matches.
 * The switcher uses Up / Down / Enter. Mention and skill menus use
 * Up / Down / Enter / Tab.
 */
export const CHAT_SHORTCUTS: readonly ChatShortcut[] = [
  { id: "send", keys: "Enter", action: "Send" },
  { id: "newline", keys: "Shift Enter", action: "New line" },
  { id: "focus", keys: "Cmd/Ctrl L", action: "Focus the composer" },
  { id: "new-chat", keys: "Cmd/Ctrl N", action: "New chat" },
  { id: "copy-last", keys: "Cmd/Ctrl Shift C", action: "Copy the last reply" },
  { id: "page", keys: "Page Up / Page Down", action: "Scroll the transcript" },
  { id: "transcript-edge", keys: "Cmd/Ctrl Home / End", action: "Oldest or latest messages" },
  { id: "user-jump", keys: "Cmd/Ctrl Shift ↑ / ↓", action: "Previous or next message you sent" },
  { id: "transcript-text", keys: "Cmd/Ctrl = / + / - / 0", action: "Larger, smaller, or default text" },
  { id: "escape", keys: "Esc", action: "Stop, close, or jump" },
  { id: "recall", keys: "↑", action: "Recall last message" },
  { id: "chat-nav", keys: "Alt ↑ / Alt ↓", action: "Previous or next chat" },
  { id: "chat-history", keys: "Cmd/Ctrl [ / ]", action: "Back or forward chat" },
  { id: "jump-chat", keys: "Cmd/Ctrl 1-9", action: "Open a chat (9 is last)" },
  { id: "archive-chat", keys: "Cmd/Ctrl Shift A", action: "Archive this chat" },
  { id: "unarchive-chat", keys: "Cmd/Ctrl Shift B", action: "Unarchive this chat" },
  { id: "clear-draft", keys: "Cmd/Ctrl Shift Backspace", action: "Clear the draft" },
  { id: "pin-chat", keys: "Cmd/Ctrl Shift P", action: "Pin or unpin this chat" },
  { id: "mute-chat", keys: "Cmd/Ctrl Shift M", action: "Mute or unmute this chat" },
  { id: "mark-unread", keys: "Cmd/Ctrl Shift U", action: "Mark as unread or read" },
  { id: "rename-chat", keys: "Cmd/Ctrl Shift R", action: "Rename this chat" },
  { id: "delete-chat", keys: "Cmd/Ctrl Shift D", action: "Ask to delete this chat" },
  { id: "copy-transcript", keys: "Cmd/Ctrl Shift E", action: "Copy the transcript" },
  { id: "tool-traces", keys: "Cmd/Ctrl Shift G", action: "Collapse or expand tool traces" },
  { id: "unread-filter", keys: "Cmd/Ctrl Shift F", action: "Toggle All / Unread" },
  { id: "archive-list", keys: "Cmd/Ctrl Shift H", action: "Open or close Archived chats" },
  { id: "next-unread", keys: "Cmd/Ctrl Shift J", action: "Next unread chat" },
  { id: "regenerate-last", keys: "Cmd/Ctrl Shift Y", action: "Regenerate the last reply" },
  { id: "focus-sidebar", keys: "Cmd/Ctrl Shift S", action: "Focus the chat list" },
  { id: "mark-all-read", keys: "Cmd/Ctrl Shift O", action: "Mark all as read" },
  { id: "previous-unread", keys: "Cmd/Ctrl Shift K", action: "Previous unread chat" },
  { id: "find", keys: "Cmd/Ctrl F", action: "Find in chat" },
  { id: "switch", keys: "Cmd/Ctrl K", action: "Switch chat" },
  { id: "info", keys: "Cmd/Ctrl Shift I", action: "Open info" },
  { id: "paste", keys: "Cmd/Ctrl V", action: "Paste an image or file" },
  { id: "find-step", keys: "Enter / Shift Enter", action: "Next or previous match" },
  { id: "switch-move", keys: "↑ ↓ Enter", action: "Move and open in the switcher" },
  { id: "mention", keys: "↑ ↓ Enter Tab", action: "Move and insert a mention or skill" },
];

type ChordEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

/** Cmd-/ or Ctrl-/. Shift and Alt stay with the browser. "?" is separate. */
export function isShortcutsChord(event: ChordEvent): boolean {
  if (event.repeat) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "/" || event.key === "?";
}

type FocusTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
} | null;

/** Input, textarea, select, and contentEditable. Buttons are not text. */
export function focusIsTextField(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as FocusTarget;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el.type ?? "text").toLowerCase();
  const nonText = new Set([
    "button",
    "checkbox",
    "radio",
    "range",
    "color",
    "file",
    "submit",
    "reset",
    "image",
    "hidden",
  ]);
  return !nonText.has(type);
}

/**
 * Bare "?" (or Shift-/) opens the overlay only when focus is outside
 * a text field, so typing a question in the composer stays text.
 */
export function isShortcutsQuestion(
  event: ChordEvent,
  target: EventTarget | null,
): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const question = event.key === "?" || (event.key === "/" && !!event.shiftKey);
  if (!question) return false;
  return !focusIsTextField(target);
}

/**
 * While the overlay is open, Esc closes it and does not Stop, Jump,
 * close find, close the switcher, or clear a recalled draft.
 * IME keeps Esc.
 */
export function escapeClosesShortcuts(input: {
  open: boolean;
  composing?: boolean;
}): boolean {
  return input.open && !input.composing;
}
