// SPDX-License-Identifier: Apache-2.0

/**
 * v1.09: mute or unmute the currently open chat from the keyboard.
 * Cmd/Ctrl-Shift-M runs the same sidebar Mute / Unmute action: the
 * id is appended to the muted list, or removed, and that list stays
 * in local storage. A muted chat skips the unread accent dot and the
 * unread count outside the list. The composer does not own the chord
 * and the letter is not inserted. IME composition keeps the key. A
 * key repeat is swallowed so holding the chord does not flap Mute /
 * Unmute and does not type m. Find, the quick switcher, the shortcuts
 * list, rename, the lightbox, a modal or overlay text field, and a
 * focused widget, approve, or connect card keep the key. Nothing
 * changes when no chat is open. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MuteOpenChat.swift`.
 */

export const MUTE_OPEN_CHAT_KEYS = "Cmd/Ctrl Shift M";
export const MUTE_OPEN_CHAT_ACTION = "Mute or unmute this chat";

export type MuteOpenChatEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type MuteOpenChatGate = {
  /** An open chat is on screen. The empty state does not mute. */
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
 * Cmd-Shift-M or Ctrl-Shift-M, including a key repeat. Alt stays put.
 * Not plain M, and not Cmd/Ctrl-M without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert m, and must not
 * toggle again.
 */
export function isMuteOpenChatChord(event: MuteOpenChatEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "m" || event.key === "M";
}

/**
 * The first press toggles. A repeat of the held chord does not, so
 * Mute / Unmute cannot flap while the key is down.
 */
export function muteOpenChatShouldToggle(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsMuteOpenChat(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-M there still mutes or unmutes the open chat.
 */
export function muteOpenChatBlocked(gate: MuteOpenChatGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
