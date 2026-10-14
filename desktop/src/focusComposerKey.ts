// SPDX-License-Identifier: Apache-2.0

/**
 * v0.99: focus the composer from the keyboard.
 * When the open chat is showing and focus is outside a text field,
 * a printable character moves focus to the composer and lands at the
 * end of any draft. Cmd/Ctrl-L focuses it and inserts nothing.
 * Cmd/Ctrl-L is the chord because `/` is printable (skill autocomplete
 * starts with it) and `?` already opens the v0.73 shortcuts overlay.
 * It does not collide with Cmd/Ctrl-F, K, Shift-I, V, or /.
 * Modifier chords, Esc, arrows, Tab, Enter, and IME stay put.
 * Find, the quick switcher, the shortcuts list, rename, the lightbox,
 * and a focused widget, approve, or connect card keep the key.
 * Nothing auto-sends. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/FocusComposer.swift`.
 */

export const FOCUS_COMPOSER_KEYS = "Cmd/Ctrl L";
export const FOCUS_COMPOSER_ACTION = "Focus the composer";

/** Widget, approve, and connect cards. Focus inside one is not the transcript. */
export const COMPOSER_CARD_SELECTOR = ".widget-card, .approve-card, .connect-card";

export type FocusKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  composing?: boolean;
  /**
   * `?` outside a text field opens the v0.73 shortcuts overlay.
   * That key must not be inserted into the draft.
   */
  reserved?: boolean;
};

export type FocusComposerGate = {
  /** An open chat is on screen, so there is a composer to focus. */
  chatOpen: boolean;
  /** The field can take text (not signed out, not in takeover). */
  editable: boolean;
  composing: boolean;
  inTextField: boolean;
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

/** Cmd-L or Ctrl-L. Shift and Alt stay with the browser. Does not insert. */
export function isFocusComposerChord(event: FocusKeyEvent): boolean {
  if (event.repeat) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "l" || event.key === "L";
}

/**
 * Overlays and IME own the keyboard. A text field does not block the
 * chord: Cmd/Ctrl-L while already in the composer is swallowed so the
 * webview does not take it, and the caret stays where it is.
 */
export function focusComposerChordBlocked(gate: FocusComposerGate): boolean {
  if (!gate.chatOpen || !gate.editable) return true;
  if (gate.composing || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/** Printable type-to-focus also refuses an existing text field. */
export function typeToFocusBlocked(gate: FocusComposerGate): boolean {
  return gate.inTextField || focusComposerChordBlocked(gate);
}

/**
 * One printable character to append, or null when this key must stay
 * with its current handler. Shift is allowed (`A`, `!`). Cmd/Ctrl/Alt,
 * Esc, arrows, Tab, Enter, and IME are null.
 */
export function typeToFocusCharacter(event: FocusKeyEvent): string | null {
  if (event.composing || event.reserved) return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const chars = Array.from(event.key);
  if (chars.length !== 1) return null;
  const code = chars[0].codePointAt(0) ?? 0;
  if (code < 32 || code === 127) return null;
  return chars[0];
}

/** The character lands after whatever draft is already there. */
export function appendDraftAtEnd(
  draft: string,
  character: string,
): { text: string; caret: number } {
  const text = `${draft}${character}`;
  return { text, caret: text.length };
}

type CardTarget = {
  closest?: (selector: string) => unknown;
} | null;

/** True when the focused node sits inside a widget, approve, or connect card. */
export function focusInsideCard(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as CardTarget;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest(COMPOSER_CARD_SELECTOR));
}
