// SPDX-License-Identifier: Apache-2.0

/**
 * v1.11: rename the currently open chat from the keyboard.
 * Cmd/Ctrl-Shift-R starts the same sidebar Rename action: the row
 * name becomes the inline field. Enter or blur keeps a trimmed
 * non-empty name. Escape restores the previous one. A blank name
 * is rejected. The composer does not own the chord and the letter
 * is not inserted. IME composition keeps the key. A key repeat does
 * not start a second rename, and a rename already in progress does
 * not flap. Find, the quick switcher, the shortcuts list, the
 * lightbox, a modal or overlay text field, and a focused widget,
 * approve, or connect card keep the key. Nothing changes when no
 * chat is open. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/RenameOpenChat.swift`.
 */

export const RENAME_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift R";
export const RENAME_OPEN_CHAT_ACTION = "Rename this chat";

export type RenameOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type RenameOpenChatGate = {
  /** An open chat is on screen. The empty state does not rename. */
  chatOpen: boolean;
  composing: boolean;
  /**
   * Focus is in a text field that is not the composer: find, rename,
   * the switcher query, settings, profile, the channel dialog, and
   * any other modal or overlay field.
   */
  overlayTextField: boolean;
  /** Focus is inside a widget, approve, or connect card. */
  inCard: boolean;
  findOpen: boolean;
  switchOpen: boolean;
  shortcutsOpen: boolean;
  renaming: boolean;
  lightboxOpen: boolean;
  /** Sidebar context menu. */
  menuOpen: boolean;
  /** Takeover, settings, profile, and the other modal sheets, plus mention / skill menus. */
  blocked: boolean;
};

/**
 * Cmd-Shift-R or Ctrl-Shift-R, including a key repeat. Alt stays put.
 * Not plain R, and not Cmd/Ctrl-R without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert r, and must not
 * start another rename.
 */
export function isRenameOpenChatChord(event: RenameOpenChatEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "r" || event.key === "R";
}

/**
 * The first press starts rename. A repeat of the held chord does
 * not, and neither does a press while a rename is already in
 * progress, so the inline field cannot flap.
 */
export function renameOpenChatShouldStart(
  event: { repeat?: boolean },
  renaming: boolean,
): boolean {
  if (event.repeat) return false;
  if (renaming) return false;
  return true;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsRenameOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-R there still starts rename on the open chat.
 * A rename already in progress owns the key too.
 */
export function renameOpenChatBlocked(gate: RenameOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
