// SPDX-License-Identifier: Apache-2.0

/**
 * v2.37: Copy on a completed assistant list.
 * Desktop shows a 12px muted Copy at the top-right on hover or
 * keyboard focus. It reads Copied for 1.5s and stays visible for
 * that window. The clipboard is the lines this list was split from,
 * including bullet or number markers and continuation lines. The
 * display text, after markers are removed, is not copied. A nested
 * list has its own control. Hidden while streaming and on task
 * lists. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/ListCopy.swift`.
 */

export const LIST_COPY_LABEL = "Copy";

export const LIST_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const LIST_COPY_ARIA = "Copy list";

export const LIST_COPIED_ARIA = "Copied";

/** Same confirmation window as v2.36 quote Save. */
export const LIST_COPY_MS = 1500;

/**
 * Shown only for a finished list that has lines to copy.
 * Streaming stays plain text, so the control is not offered.
 */
export function showListCopy(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function listCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? LIST_COPIED_LABEL : LIST_COPY_LABEL;
}

export function listCopyAriaLabel(copied: boolean): string {
  return copied ? LIST_COPIED_ARIA : LIST_COPY_ARIA;
}

/**
 * Clipboard text is the list lines the splitter kept, not the text
 * after markers are removed. A paste round-trips as a list. No
 * trailing newline is added.
 */
export function listClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function listCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
