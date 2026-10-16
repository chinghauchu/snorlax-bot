// SPDX-License-Identifier: Apache-2.0

/**
 * v1.22: unarchive the currently open chat from the keyboard.
 * Cmd/Ctrl-Shift-B runs the same sidebar Unarchive action when that
 * chat is archived: the id leaves the local archive set, so the row
 * leaves the Archived list and returns to the main list in pin order
 * if it is pinned, otherwise in roster order. The open chat stays
 * open. Cmd/Ctrl-Shift-A still only archives and does not unarchive.
 * The composer does not own the chord and the letter is not inserted.
 * A key repeat is swallowed and does not unarchive again. IME
 * composition keeps the key. Find, the quick switcher, the shortcuts
 * overlay, rename, the lightbox, a modal or overlay text field, and a
 * focused widget, approve, or connect card keep the key. Nothing
 * changes when no chat is open or the open chat is not archived.
 * B is free: the overlay already uses C, A, Backspace, P, M, U, R, D,
 * E, G, F, H, J, Y, S, O, I, and K. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/UnarchiveOpenChat.swift`.
 */

export const UNARCHIVE_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift B";
export const UNARCHIVE_OPEN_CHAT_ACTION = "Unarchive this chat";

export type UnarchiveOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type UnarchiveOpenChatGate = {
  /** An open chat is on screen. The empty state does not unarchive. */
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
 * Cmd-Shift-B or Ctrl-Shift-B, including a key repeat. Alt stays put.
 * Not plain B, and not Cmd/Ctrl-B without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert b and must not
 * unarchive again.
 */
export function isUnarchiveOpenChatChord(event: UnarchiveOpenChatEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "b" || event.key === "B";
}

/**
 * The first press unarchives when the open chat is archived. A repeat
 * of the held chord does not. A chat that is not archived does not.
 * The caller still swallows the repeat, and swallows the chord when a
 * chat is open but not archived, so b is not inserted.
 */
export function unarchiveOpenChatShouldRun(input: {
  repeat?: boolean;
  archived: boolean;
}): boolean {
  if (input.repeat) return false;
  return input.archived;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsUnarchiveOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-B there still unarchives when the open chat is
 * archived.
 */
export function unarchiveOpenChatBlocked(gate: UnarchiveOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
