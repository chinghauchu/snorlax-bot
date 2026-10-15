// SPDX-License-Identifier: Apache-2.0

/**
 * v1.07: clear the open chat's composer draft from the keyboard.
 * Cmd/Ctrl-Shift-Backspace drops the unsent text and the pending
 * attachment chips. Nothing is sent. An already empty composer
 * (no text and no chips) is a no-op. A key repeat stays on this
 * chord so Backspace does not then delete a character; the second
 * press finds an empty draft and does nothing. The composer does
 * not own the chord. IME composition keeps the key. Find, the
 * quick switcher, the shortcuts list, rename, the lightbox, a
 * modal or overlay text field, and a focused widget, approve, or
 * connect card keep it. Nothing is cleared when no chat is open.
 * Plain Backspace still removes the last chip when the field is
 * empty. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ClearComposerDraft.swift`.
 */

export const CLEAR_COMPOSER_DRAFT_KEYS = "Cmd/Ctrl Shift Backspace";
export const CLEAR_COMPOSER_DRAFT_ACTION = "Clear the draft";

export type ClearComposerDraftEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ClearComposerDraftGate = {
  /** An open chat is on screen. The empty state does not clear. */
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
 * Cmd-Shift-Backspace or Ctrl-Shift-Backspace. Alt stays put.
 * Not plain Backspace, and not Cmd/Ctrl-Backspace without Shift.
 * Repeat still matches: holding the chord must not fall through
 * to deleting characters. Both modifiers together do not match.
 */
export function isClearComposerDraftChord(
  event: ClearComposerDraftEvent,
): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "Backspace";
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsClearComposerDraft(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-Backspace there still clears the open draft.
 */
export function clearComposerDraftBlocked(
  gate: ClearComposerDraftGate,
): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/** No characters and no pending chips. Whitespace is still a draft. */
export function composerDraftAlreadyEmpty(
  text: string,
  chipCount: number,
): boolean {
  return text.length === 0 && chipCount === 0;
}
