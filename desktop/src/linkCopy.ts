// SPDX-License-Identifier: Apache-2.0

/**
 * v2.25: Copy link on a completed assistant reply.
 * The control copies the destination URL, not the visible label,
 * and does not open the link. It reads Copied for 1.5s. Hidden
 * while streaming and on user bubbles. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/LinkCopy.swift`.
 */

export const LINK_COPY_LABEL = "Copy link";

export const LINK_COPY_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy link`. */
export const LINK_COPY_ARIA = "Copy link";

export const LINK_COPY_COPIED_ARIA = "Copied";

/** Same confirmation window as v2.24 table Cells. */
export const LINK_COPY_MS = 1500;

/**
 * Shown only for a completed assistant link whose destination is
 * already safe to open. Streaming and user bubbles stay plain links.
 */
export function showLinkCopy(opts: {
  completed: boolean;
  revealed: boolean;
}): boolean {
  return opts.completed && opts.revealed;
}

export function linkCopyLabel(copied: boolean): "Copy link" | "Copied" {
  return copied ? LINK_COPY_COPIED_LABEL : LINK_COPY_LABEL;
}

export function linkCopyAriaLabel(copied: boolean): string {
  return copied ? LINK_COPY_COPIED_ARIA : LINK_COPY_ARIA;
}

/**
 * Clipboard text is the destination the link would open.
 * The visible label is not included. A long URL is not truncated.
 */
export function linkCopyClipboardText(destination: string): string {
  return destination;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function linkCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
