// SPDX-License-Identifier: Apache-2.0

/**
 * v1.12: delete the currently open chat from the keyboard.
 * Cmd/Ctrl-Shift-D runs the same removal as confirming the sidebar
 * Delete action: the existing DELETE for that roster row, then the
 * local pin, mute, archive, name, and unread cleanup. It does not
 * open the confirm dialog, so a held key cannot delete the chat that
 * opens next. After the row is gone, the next chat in the Alt+Up/Down
 * visible order opens, or the empty state. The composer does not own
 * the chord and the letter is not inserted. IME composition keeps the
 * key. Find, the quick switcher, the shortcuts list, rename, the
 * lightbox, a modal or overlay text field, and a focused widget,
 * approve, or connect card keep the key. Nothing is deleted when no
 * chat is open. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/DeleteOpenChat.swift`.
 */

import { selectionAfterArchive } from "./chatArchive.ts";

export const DELETE_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift D";
export const DELETE_OPEN_CHAT_ACTION = "Delete this chat";

export type DeleteOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type DeleteOpenChatGate = {
  /** An open chat is on screen. The empty state does not delete. */
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
 * Cmd-Shift-D or Ctrl-Shift-D, including a key repeat. Alt stays put.
 * Not plain D, and not Cmd/Ctrl-D without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert d, and must not
 * delete the chat that just opened.
 */
export function isDeleteOpenChatChord(event: DeleteOpenChatEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "d" || event.key === "D";
}

/**
 * The first press deletes. A repeat of the held chord does not, so
 * the next visible chat cannot be deleted by the same hold.
 */
export function deleteOpenChatShouldRun(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The chat that should be open after deleting `openId`.
 * `visibleIds` is the Alt+Up/Down order (pinned, then the rest, after
 * All / Unread; archived chats already absent). The following row
 * opens. The last row, or an open chat that is not in that order,
 * becomes the empty state.
 */
export function nextOpenChatAfterDelete(
  visibleIds: readonly string[],
  openId: string | null | undefined,
): string | null {
  if (!openId) return null;
  return selectionAfterArchive(visibleIds, openId, openId);
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsDeleteOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-D there still deletes the open chat.
 */
export function deleteOpenChatBlocked(gate: DeleteOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
