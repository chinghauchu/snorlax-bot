// SPDX-License-Identifier: Apache-2.0

/**
 * v1.26: quote a transcript selection from the keyboard.
 * Cmd/Ctrl-L, when the selection sits in one quotable message,
 * inserts that selection as a markdown quote through the v0.94
 * path, leaves the caret after the quote, and focuses the
 * composer. Nothing is sent. An existing draft is kept.
 * With no quotable selection, Cmd/Ctrl-L still only focuses the
 * composer (v0.99). A selection in the composer is not quoted.
 * A key repeat is not this chord, so it does not quote again.
 * IME composition keeps the key. Find, the quick switcher, the
 * shortcuts overlay, rename, the lightbox, a modal or overlay
 * text field, and a focused widget, approve, or connect card
 * keep the key. Tool lines, cards, file chips, and a streaming
 * LEFT bubble stay unquotable. Stick-to-bottom, the Jump chip,
 * per-chat reading place, the sticky day header, and collapsed
 * long messages stay as they are. Reduce Motion adds no animation.
 * No HTTP. Keep in lockstep with `ios/SnorlaxBot/QuoteSelectionKey.swift`.
 */

import { isFocusComposerChord, type FocusKeyEvent } from "./focusComposerKey.ts";
import { quoteableText } from "./quoteSelection.ts";

export const QUOTE_SELECTION_KEYS = "Cmd/Ctrl L";
export const QUOTE_SELECTION_ACTION = "Quote the selection";

export type QuoteSelectionGate = {
  chatOpen: boolean;
  /** The field can take text (not signed out, not in takeover). */
  editable: boolean;
  composing: boolean;
  /**
   * Focus is in a text field. The composer, find, rename, the
   * switcher query, and any modal field keep the chord.
   */
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

/**
 * Same chord as focus-the-composer. Shift and Alt stay put.
 * A key repeat is not the chord, so a hold does not quote again.
 */
export function isQuoteSelectionChord(event: FocusKeyEvent): boolean {
  return isFocusComposerChord(event);
}

/**
 * Overlays and IME own the keyboard. A text field does not block
 * the chord here: the caller leaves the caret alone instead of quoting.
 */
export function quoteSelectionBlocked(gate: QuoteSelectionGate): boolean {
  if (!gate.chatOpen || !gate.editable) return true;
  if (gate.composing || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * Text to quote, or null when Cmd/Ctrl-L should only focus.
 * A text field keeps the chord. Empty and whitespace quote nothing.
 * The caller has already required one quotable message root.
 */
export function selectionToQuote(input: {
  inTextField: boolean;
  selection: string | null;
}): string | null {
  if (input.inTextField) return null;
  if (input.selection == null) return null;
  return quoteableText(input.selection);
}
