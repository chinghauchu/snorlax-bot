// SPDX-License-Identifier: Apache-2.0

/**
 * v1.05: jump to the Nth chat in the sidebar's current visible order.
 * Cmd/Ctrl-1 through Cmd/Ctrl-8 opens that slot. Cmd/Ctrl-9 opens the
 * last visible chat, the Slack and browser convention, not a literal
 * ninth row when the list is longer or shorter. A slot past the
 * visible count does nothing. The caller passes painted chat ids:
 * the v0.89 Pinned group first, then the rest, after the v0.88 All /
 * Unread filter. v0.97 section headers are not ids. Archived chats
 * are omitted unless that list is showing. On desktop an expanded
 * archive section is appended after the main rows. On iOS the
 * Archived screen replaces the main roster.
 * The composer does not own the chord. Opening uses the same path as
 * clicking the row, so per-chat drafts stay. IME composition keeps
 * the key. Find, the quick switcher, the shortcuts list, rename, the
 * lightbox, a modal or overlay text field, and a focused widget,
 * approve, or connect card keep it. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatJump.swift`.
 */

export const CHAT_JUMP_KEYS = "Cmd/Ctrl 1-9";
export const CHAT_JUMP_ACTION = "Open a chat (9 is last)";

export type ChatJumpEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ChatJumpGate = {
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

/** 1..9 for Cmd-1..Cmd-9 or Ctrl-1..Ctrl-9. Shift, Alt, and a repeat stay put. */
export function chatJumpSlot(event: ChatJumpEvent): number | null {
  if (event.repeat) return null;
  if (event.altKey || event.shiftKey) return null;
  if (!(event.metaKey || event.ctrlKey)) return null;
  if (event.metaKey && event.ctrlKey) return null;
  if (event.key.length !== 1) return null;
  const slot = event.key.charCodeAt(0) - 48;
  if (slot < 1 || slot > 9) return null;
  return slot;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsChatJump(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays, IME, and a focused card own the key. The composer does
 * not: Cmd/Ctrl-1 through Cmd/Ctrl-9 there still jumps.
 */
export function chatJumpBlocked(gate: ChatJumpGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * Id at that slot, or null when the slot does not exist.
 * 1..8 are 1-based indexes into the visible order. 9 is the last id
 * even when the list is shorter or longer than nine. An empty list
 * and a non-integer slot are null.
 */
export function chatIdAtJumpSlot(
  ids: readonly string[],
  slot: number,
): string | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) return null;
  if (ids.length === 0) return null;
  if (slot === 9) {
    const last = ids[ids.length - 1];
    return last ? last : null;
  }
  if (slot > ids.length) return null;
  const id = ids[slot - 1];
  return id ? id : null;
}

/**
 * Visible jump order. Main ids are already pinned-then-rest, with
 * the All / Unread filter applied and section headers left out.
 * Archived ids are included only while that list is showing. When
 * `archiveReplacesMain` is set (the iOS Archived screen), those
 * archived ids are the whole order. Desktop appends them after the
 * main rows because both stay on screen.
 */
export function visibleJumpIds(input: {
  mainIds: readonly string[];
  archivedIds: readonly string[];
  archiveListShowing: boolean;
  archiveReplacesMain?: boolean;
}): string[] {
  const main = input.mainIds.filter((id) => id.length > 0);
  const archived = input.archivedIds.filter((id) => id.length > 0);
  if (input.archiveListShowing && input.archiveReplacesMain) return archived;
  if (!input.archiveListShowing) return main;
  const seen = new Set(main);
  return [...main, ...archived.filter((id) => !seen.has(id))];
}
