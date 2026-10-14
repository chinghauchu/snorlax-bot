// SPDX-License-Identifier: Apache-2.0

/**
 * v1.04: start a new chat from the keyboard.
 * Cmd/Ctrl-N runs the same New agent path as the sidebar Create
 * control. Focus then lands in the composer, which is where that
 * path already puts the caret. The composer does not own the chord:
 * the platform does nothing useful with Cmd/Ctrl-N there, and a new
 * chat is what users expect. IME composition keeps the key. A modal
 * or overlay text field owns it, as do find, the quick switcher, the
 * shortcuts list, rename, the lightbox, a context menu, and a focused
 * widget, approve, or connect card. Shift and Alt stay with the
 * browser. Nothing is sent. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/NewChat.swift`.
 */

export const NEW_CHAT_KEYS = "Cmd/Ctrl N";
export const NEW_CHAT_ACTION = "New chat";

export type NewChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type NewChatGate = {
  /** Signed in. The sidebar Create control is disabled until then. */
  ready: boolean;
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

/** Cmd-N or Ctrl-N. Shift and Alt stay put. Not a key repeat. */
export function isNewChatChord(event: NewChatEvent): boolean {
  if (event.repeat) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "n" || event.key === "N";
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsNewChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays, IME, and a signed-out window own the key. The composer
 * does not: Cmd/Ctrl-N there still starts the new chat.
 */
export function newChatBlocked(gate: NewChatGate): boolean {
  if (!gate.ready) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
