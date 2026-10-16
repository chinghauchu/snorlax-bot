// SPDX-License-Identifier: Apache-2.0

/**
 * v1.20: mark all as read from the keyboard.
 * Cmd/Ctrl-Shift-O clears every unread accent dot through the same
 * local-state path as the v1.01 Mark all as read control: archived
 * chats and channel handoff dots included, so the window title and
 * badge count go to zero and the Unread filter shows No unread chats.
 * Nothing unread is a no-op. The composer does not own the chord and
 * the letter is not inserted. A key repeat is swallowed and does not
 * clear again. IME composition keeps the key. Find, the quick
 * switcher, the shortcuts list, rename, the lightbox, a modal or
 * overlay text field, and a focused widget, approve, or connect card
 * keep the key. A focused sidebar row does not: the chord still
 * clears. The empty state still clears, because the sidebar control
 * does. O is free: the overlay already uses C, A, Backspace, P, M,
 * U, R, D, E, G, F, H, J, Y, I, and S. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkAllReadKey.swift`.
 */

import { anyChatUnread } from "./chatUnread.ts";

export const MARK_ALL_READ_KEYS = "Cmd/Ctrl Shift O";
export const MARK_ALL_READ_ACTION = "Mark all as read";

export type MarkAllReadKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type MarkAllReadKeyGate = {
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
 * Cmd-Shift-O or Ctrl-Shift-O, including a key repeat. Alt stays put.
 * Not plain O, and not Cmd/Ctrl-O without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert o and must not
 * clear again.
 */
export function isMarkAllReadChord(event: MarkAllReadKeyEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "o" || event.key === "O";
}

/**
 * The first press clears. A repeat of the held chord does not.
 * The caller still swallows the repeat so o is not inserted.
 */
export function markAllReadShouldClear(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * Nothing to clear is a no-op. Empty strings are not chats. Archived
 * ids and channel handoff ids still count, the same as the button.
 */
export function markAllReadIsNoOp(
  replyUnread: ReadonlySet<string>,
  handoffUnread: ReadonlySet<string>,
): boolean {
  return !anyChatUnread(replyUnread, handoffUnread);
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsMarkAllRead(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays and IME own the key. The composer does not, and neither
 * does an empty chat or a focused sidebar row: Cmd/Ctrl-Shift-O
 * still marks every chat read, the same as the sidebar control.
 */
export function markAllReadKeyBlocked(gate: MarkAllReadKeyGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
