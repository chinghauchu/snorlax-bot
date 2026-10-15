// SPDX-License-Identifier: Apache-2.0

/**
 * v1.06: archive the currently open chat from the keyboard.
 * Cmd/Ctrl-Shift-A runs the same sidebar Archive action: the chat
 * leaves the main list, the set stays in local storage, and if that
 * chat was open the next Alt+Up/Down row opens, or the empty state.
 * The composer does not own the chord. The platform does nothing
 * useful with Shift-A there for chat. IME composition keeps the key.
 * Find, the quick switcher, the shortcuts list, rename, the lightbox,
 * a modal or overlay text field, and a focused widget, approve, or
 * connect card keep it. Nothing is archived when no chat is open.
 * No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ArchiveOpenChat.swift`.
 */

export const ARCHIVE_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift A";
export const ARCHIVE_OPEN_CHAT_ACTION = "Archive this chat";

export type ArchiveOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ArchiveOpenChatGate = {
  /** An open chat is on screen. The empty state does not archive. */
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

/** Cmd-Shift-A or Ctrl-Shift-A. Alt stays put. Not plain Cmd/Ctrl-A. Not a key repeat. */
export function isArchiveOpenChatChord(event: ArchiveOpenChatEvent): boolean {
  if (event.repeat) return false;
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "a" || event.key === "A";
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsArchiveOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-A there still archives the open chat.
 */
export function archiveOpenChatBlocked(gate: ArchiveOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
