// SPDX-License-Identifier: Apache-2.0

/**
 * v2.38: Copy on a completed assistant heading section.
 * Desktop shows a 12px muted Copy at the top-right on hover or
 * keyboard focus. It reads Copied for 1.5s and stays visible for
 * that window. The clipboard is the heading line plus the lines
 * under it until the next heading of the same or higher level.
 * Hidden while streaming. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/SectionCopy.swift`.
 */

export const SECTION_COPY_LABEL = "Copy";

export const SECTION_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const SECTION_COPY_ARIA = "Copy section";

export const SECTION_COPIED_ARIA = "Copied";

/** Same confirmation window as v2.37 list Copy. */
export const SECTION_COPY_MS = 1500;

/**
 * Shown only for a finished section that has lines to copy.
 * Streaming stays plain text, so the control is not offered.
 */
export function showSectionCopy(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function sectionCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? SECTION_COPIED_LABEL : SECTION_COPY_LABEL;
}

export function sectionCopyAriaLabel(copied: boolean): string {
  return copied ? SECTION_COPIED_ARIA : SECTION_COPY_ARIA;
}

/**
 * Clipboard text is the section source, heading line included.
 * A paste round-trips as the same section. No trailing newline
 * is added.
 */
export function sectionClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function sectionCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
