// SPDX-License-Identifier: Apache-2.0

/**
 * v1.16: open or close the Archived chats list from the keyboard.
 * Cmd/Ctrl-Shift-H toggles the same sidebar flag as the Archived (n)
 * control. Opening shows that list when at least one chat is archived.
 * Closing returns to the main list. The chord works while a chat is
 * open and while none is open. The composer does not own the chord
 * and the letter is not inserted. A key repeat is swallowed and does
 * not flap. IME composition keeps the key. Find, the quick switcher,
 * the shortcuts list, rename, the lightbox, a modal or overlay text
 * field, and a focused widget, approve, or connect card keep the key.
 * Nothing opens when no chat is archived and the list is already
 * closed. Cmd/Ctrl-Shift-H is free: the overlay already uses C, A,
 * Backspace, P, M, U, R, D, E, G, F, and I. Shift-F toggles All /
 * Unread. H names the hidden list.
 * No new HTTP. Keep in lockstep with `ios/SnorlaxBot/ArchiveListKey.swift`.
 */

export const ARCHIVE_LIST_KEYS = "Cmd/Ctrl Shift H";
export const ARCHIVE_LIST_ACTION = "Open or close Archived chats";

export type ArchiveListEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ArchiveListGate = {
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
 * Cmd-Shift-H or Ctrl-Shift-H, including a key repeat. Alt stays put.
 * Not plain H, and not Cmd/Ctrl-H without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert h and must not flap.
 */
export function isArchiveListChord(event: ArchiveListEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "h" || event.key === "H";
}

/**
 * The first press toggles. A repeat of the held chord does not.
 * The caller still swallows the repeat so h is not inserted.
 */
export function archiveListShouldToggle(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * Same result as clicking the Archived (n) control. That control is
 * hidden when nothing is archived, so a closed list stays closed.
 * An open list always closes, including after the last archived chat
 * was put back.
 */
export function nextArchiveListOpen(open: boolean, archivedCount: number): boolean {
  if (open) return false;
  const count = Number.isFinite(archivedCount) ? Math.floor(archivedCount) : 0;
  return count > 0;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsArchiveList(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays and IME own the key. An empty chat does not: the Archived
 * control sits on the sidebar either way. The composer does not own
 * the chord.
 */
export function archiveListBlocked(gate: ArchiveListGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
