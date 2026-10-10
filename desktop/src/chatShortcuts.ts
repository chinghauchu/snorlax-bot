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
 * jumps, or cancels dictation. Up-arrow recalls. Cmd/Ctrl-F finds.
 * Cmd/Ctrl-K switches. Cmd/Ctrl-Shift-I opens info. Cmd/Ctrl-V
 * pastes an image or file. Find's Enter / Shift-Enter steps matches.
 * The switcher uses Up / Down / Enter. Mention and skill menus use
 * Up / Down / Enter / Tab.
 */
export const CHAT_SHORTCUTS: readonly ChatShortcut[] = [
  { id: "send", keys: "Enter", action: "Send" },
  { id: "newline", keys: "Shift Enter", action: "New line" },
  { id: "escape", keys: "Esc", action: "Stop, close, or jump" },
  { id: "recall", keys: "↑", action: "Recall last message" },
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
