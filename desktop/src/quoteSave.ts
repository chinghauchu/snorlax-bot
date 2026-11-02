// SPDX-License-Identifier: Apache-2.0

/**
 * v2.36: Save on a completed assistant blockquote.
 * The control writes the lines that quote was split from as quote.md,
 * then reads Saved for 1.5s. Desktop downloads the file. iOS hands the
 * same bytes to the system share sheet and does not ask for
 * photo-library permission. Markers, nested markers, and lazy
 * continuation lines stay. The display text, after markers are
 * removed, is not written. Copy still copies those lines. Hidden
 * while streaming and on task lists. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/QuoteSave.swift`.
 */

export const QUOTE_SAVE_LABEL = "Save";

export const QUOTE_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const QUOTE_SAVE_ARIA = "Save quote";

export const QUOTE_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.35 quote Copy. */
export const QUOTE_SAVE_MS = 1500;

export const QUOTE_SAVE_FILENAME = "quote.md";

export const QUOTE_SAVE_MIME = "text/markdown;charset=utf-8";

/**
 * Shown only for a finished quote that has lines to save.
 * Streaming stays plain text, so the control is not offered.
 */
export function showQuoteSave(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function quoteSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? QUOTE_SAVED_LABEL : QUOTE_SAVE_LABEL;
}

export function quoteSaveAriaLabel(saved: boolean): string {
  return saved ? QUOTE_SAVED_ARIA : QUOTE_SAVE_ARIA;
}

/** Saving does not remove the quote, send, or change Copy. */
export function quoteSaveKeepsQuote(): boolean {
  return true;
}

/**
 * File body. The quote lines the splitter kept, the same string Copy
 * puts on the clipboard. Markers stay. A paste of the file is a
 * quote. No extra trailing newline.
 */
export function quoteSaveBody(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function quoteSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the quote to the browser as a download. The quote stays up. */
export function downloadQuoteMarkdown(source: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([quoteSaveBody(source)], {
    type: QUOTE_SAVE_MIME,
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
