// SPDX-License-Identifier: Apache-2.0

/**
 * v1.08: pin or unpin the currently open chat from the keyboard.
 * Cmd/Ctrl-Shift-P runs the same sidebar Pin / Unpin action: the id
 * is appended to the pinned list, or removed, and that list stays in
 * local storage. Pinned chats sit in the Pinned group in that order.
 * The composer does not own the chord and the letter is not inserted.
 * IME composition keeps the key. A key repeat is swallowed so holding
 * the chord does not flap Pin / Unpin and does not type p. Find, the
 * quick switcher, the shortcuts list, rename, the lightbox, a modal
 * or overlay text field, and a focused widget, approve, or connect
 * card keep the key. Nothing changes when no chat is open. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/PinOpenChat.swift`.
 */

export const PIN_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift P";
export const PIN_OPEN_CHAT_ACTION = "Pin or unpin this chat";

export type PinOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type PinOpenChatGate = {
  /** An open chat is on screen. The empty state does not pin. */
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
 * Cmd-Shift-P or Ctrl-Shift-P, including a key repeat. Alt stays put.
 * Not plain P, and not Cmd/Ctrl-P without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert p, and must not
 * toggle again.
 */
export function isPinOpenChatChord(event: PinOpenChatEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "p" || event.key === "P";
}

/**
 * The first press toggles. A repeat of the held chord does not, so
 * Pin / Unpin cannot flap while the key is down.
 */
export function pinOpenChatShouldToggle(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsPinOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-P there still pins or unpins the open chat.
 */
export function pinOpenChatBlocked(gate: PinOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
