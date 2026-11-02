// SPDX-License-Identifier: Apache-2.0

/**
 * v2.35: Copy on a completed assistant blockquote.
 * Desktop shows a 12px muted Copy at the top-right on hover or
 * keyboard focus. It reads Copied for 1.5s and stays visible for
 * that window. The clipboard is the quote lines this block was
 * split from, including `>` markers, nested markers, and lazy
 * continuation lines. The rewritten display text is not copied.
 * A nested quote has its own control. Hidden while streaming.
 * No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/QuoteCopy.swift`.
 */

export const QUOTE_COPY_LABEL = "Copy";

export const QUOTE_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const QUOTE_COPY_ARIA = "Copy quote";

export const QUOTE_COPIED_ARIA = "Copied";

/** Same confirmation window as v0.66 code-block Copy. */
export const QUOTE_COPY_MS = 1500;

/**
 * Shown only for a finished quote that has lines to copy.
 * Streaming stays plain text, so the control is not offered.
 */
export function showQuoteCopy(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function quoteCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? QUOTE_COPIED_LABEL : QUOTE_COPY_LABEL;
}

export function quoteCopyAriaLabel(copied: boolean): string {
  return copied ? QUOTE_COPIED_ARIA : QUOTE_COPY_ARIA;
}

/**
 * Clipboard text is the quote lines the splitter kept, not the
 * text after `>` markers are removed. A paste round-trips as a
 * quote. No trailing newline is added.
 */
export function quoteClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function quoteCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
