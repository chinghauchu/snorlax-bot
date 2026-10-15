// SPDX-License-Identifier: Apache-2.0

/**
 * v1.15: toggle the sidebar All / Unread filter from the keyboard.
 * Cmd/Ctrl-Shift-F flips the v0.88 control. All shows every chat.
 * Unread shows only rows that paint the accent dot. The empty Unread
 * state, the Pinned group, archived chats, and local persistence stay
 * on that control. The composer does not own the chord and the letter
 * is not inserted. A key repeat is swallowed and does not flap.
 * IME composition keeps the key. Find, the quick switcher, the
 * shortcuts list, rename, the lightbox, a modal or overlay text field,
 * and a focused widget, approve, or connect card keep the key. The
 * empty state still toggles, because the sidebar control does.
 * Cmd/Ctrl-F still finds: that chord rejects Shift, and Shift-F still
 * produces F rather than another character. F names the filter.
 * No new HTTP. Keep in lockstep with `ios/SnorlaxBot/ChatListFilterKey.swift`.
 */

export const CHAT_LIST_FILTER_KEYS = "Cmd/Ctrl Shift F";
export const CHAT_LIST_FILTER_ACTION = "Toggle All / Unread";

export type ChatListFilterKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ChatListFilterKeyGate = {
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
 * Cmd-Shift-F or Ctrl-Shift-F, including a key repeat. Alt stays put.
 * Not plain F, and not Cmd/Ctrl-F without Shift (that chord is find).
 * Both modifiers together do not match. Repeat still matches so the
 * handler can swallow it: holding the chord must not insert f and
 * must not flap All / Unread.
 */
export function isChatListFilterChord(event: ChatListFilterKeyEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "f" || event.key === "F";
}

/**
 * The first press toggles. A repeat of the held chord does not.
 * The caller still swallows the repeat so f is not inserted.
 */
export function chatListFilterShouldToggle(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsChatListFilter(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays and IME own the key. The composer does not, and neither
 * does an empty chat: Cmd/Ctrl-Shift-F still toggles the sidebar
 * filter, the same as clicking All or Unread.
 */
export function chatListFilterKeyBlocked(gate: ChatListFilterKeyGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
