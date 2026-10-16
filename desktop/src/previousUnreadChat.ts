// SPDX-License-Identifier: Apache-2.0

/**
 * v1.21: jump to the previous unread chat from the keyboard.
 * Cmd/Ctrl-Shift-K opens the previous chat that paints the unread
 * accent dot before the one that is open, in the sidebar's current
 * visible order. That order is the same one Alt+Up/Down and
 * Cmd/Ctrl-1..9 use: the Pinned group first, then the rest, after
 * All / Unread, with section headers left out. Archived chats are in
 * that order only while the Archived list is showing. The search
 * wraps. Opening uses the same path as clicking the row, so that
 * chat's draft and reading place come back and the composer is
 * focused. If no chat in that order is unread, nothing changes. The
 * open chat is not selected again when it is the only unread row.
 * The composer does not own the chord and the letter is not inserted.
 * A key repeat is swallowed and does not jump again. IME composition
 * keeps the key. Find, the quick switcher, the shortcuts list,
 * rename, the lightbox, a modal or overlay text field, and a focused
 * widget, approve, or connect card keep the key. Cmd/Ctrl-K without
 * Shift stays the quick switcher. Cmd/Ctrl-Shift-K is free: the
 * overlay already uses C, A, Backspace, P, M, U, R, D, E, G, F, H,
 * J, Y, S, O, and I. Alt+Shift+Up stays with the field. Alt+Up/Down
 * already rejects Shift, and Alt+Shift+arrow is a text-selection
 * chord. No new HTTP. Keep in lockstep with
 * `ios/SnorlaxBot/PreviousUnreadChat.swift`.
 */

export const PREVIOUS_UNREAD_KEYS = "Cmd/Ctrl Shift K";
export const PREVIOUS_UNREAD_ACTION = "Previous unread chat";

export type PreviousUnreadEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type PreviousUnreadGate = {
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
 * Cmd-Shift-K or Ctrl-Shift-K, including a key repeat. Alt stays put.
 * Not plain K, and not Cmd/Ctrl-K without Shift (that opens the
 * switcher). Both modifiers together do not match. Repeat still
 * matches so the handler can swallow it: holding the chord must not
 * insert k and must not walk every unread chat.
 */
export function isPreviousUnreadChord(event: PreviousUnreadEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "k" || event.key === "K";
}

/**
 * The first press opens the previous unread chat. A repeat of the
 * held chord does not. The caller still swallows the repeat so k is
 * not inserted.
 */
export function previousUnreadShouldOpen(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsPreviousUnread(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays and IME own the key. The composer does not. An empty chat
 * does not either: the last unread row in the visible order can still
 * open.
 */
export function previousUnreadBlocked(gate: PreviousUnreadGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * The previous unread id before `currentId`, wrapping through `ids`.
 * `ids` is the painted order (Pinned first). `unread` is the subset
 * that paints the accent dot. The current id is never the result, so
 * a chat that is already open stays put when it is the only unread
 * row. A current id that is missing (none open, or hidden by the
 * filter) starts at the last unread. Empty ids, empty strings, and
 * no unread chat other than the current row are null.
 */
export function previousUnreadChatId(
  ids: readonly string[],
  currentId: string | null | undefined,
  unread: ReadonlySet<string>,
): string | null {
  const rows = ids.filter((id) => id.length > 0);
  if (rows.length === 0) return null;
  const start = currentId ? rows.indexOf(currentId) : -1;
  for (let step = 1; step <= rows.length; step += 1) {
    const index =
      start < 0 ? rows.length - step : (start - step + rows.length) % rows.length;
    const id = rows[index];
    if (!id || id === currentId) continue;
    if (unread.has(id)) return id;
  }
  return null;
}
