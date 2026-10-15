// SPDX-License-Identifier: Apache-2.0

/**
 * v1.10: mark the currently open chat unread from the keyboard.
 * Cmd/Ctrl-Shift-U runs the same sidebar Mark as unread / Mark as
 * read action. A read chat is written into the existing unread set,
 * so the accent dot, the count outside the list, and the Unread
 * filter all see it. A chat that already shows that dot is marked
 * read, which is what that same menu item does. A muted chat follows
 * the sidebar: the mark does not paint a dot or change the count.
 * Opening the chat still clears the dot. The composer does not own
 * the chord and the letter is not inserted. IME composition keeps
 * the key. A key repeat is swallowed so holding the chord does not
 * flap Mark as unread / Mark as read and does not type u. Find, the
 * quick switcher, the shortcuts list, rename, the lightbox, a modal
 * or overlay text field, and a focused widget, approve, or connect
 * card keep the key. Nothing changes when no chat is open. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkOpenChat.swift`.
 */

export const MARK_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift U";
export const MARK_OPEN_CHAT_ACTION = "Mark as unread or read";

export type MarkOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type MarkOpenChatGate = {
  /** An open chat is on screen. The empty state does not mark. */
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
 * Cmd-Shift-U or Ctrl-Shift-U, including a key repeat. Alt stays put.
 * Not plain U, and not Cmd/Ctrl-U without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert u, and must not
 * apply the sidebar action again.
 */
export function isMarkOpenChatChord(event: MarkOpenChatEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "u" || event.key === "U";
}

/**
 * The first press runs the sidebar action. A repeat of the held
 * chord does not, so Mark as unread / Mark as read cannot flap
 * while the key is down.
 */
export function markOpenChatShouldApply(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsMarkOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-U there still marks the open chat.
 */
export function markOpenChatBlocked(gate: MarkOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
