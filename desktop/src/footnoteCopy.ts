// SPDX-License-Identifier: Apache-2.0

/**
 * v2.41: Copy on a completed assistant Footnotes list.
 * Desktop shows a 12px muted Copy at the top-right on hover or
 * keyboard focus. It reads Copied for 1.5s and stays visible for
 * that window. The clipboard is the same notes.md text Save writes:
 * one `[^label]:` definition per rendered note. The Footnotes title
 * and the painted numbers are not copied. Hidden while streaming.
 * No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/FootnoteCopy.swift`.
 */

import { footnoteSaveBody, type FootnoteSaveNote } from "./footnoteSave.ts";

export const FOOTNOTE_COPY_LABEL = "Copy";

export const FOOTNOTE_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const FOOTNOTE_COPY_ARIA = "Copy footnotes";

export const FOOTNOTE_COPIED_ARIA = "Copied";

/** Same confirmation window as v2.41 footnote Save. */
export const FOOTNOTE_COPY_MS = 1500;

/**
 * Shown only for a finished list that has a note to copy.
 * Streaming does not render the list, so the control is not offered.
 */
export function showFootnoteCopy(opts: {
  completed: boolean;
  notes: readonly FootnoteSaveNote[];
}): boolean {
  return opts.completed && footnoteClipboardText(opts.notes).length > 0;
}

export function footnoteCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? FOOTNOTE_COPIED_LABEL : FOOTNOTE_COPY_LABEL;
}

export function footnoteCopyAriaLabel(copied: boolean): string {
  return copied ? FOOTNOTE_COPIED_ARIA : FOOTNOTE_COPY_ARIA;
}

/**
 * Clipboard text is the file body. Definitions stay. A paste
 * round-trips as footnotes. No trailing newline is added.
 */
export function footnoteClipboardText(notes: readonly FootnoteSaveNote[]): string {
  return footnoteSaveBody(notes);
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function footnoteCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
