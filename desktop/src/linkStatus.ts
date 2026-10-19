// SPDX-License-Identifier: Apache-2.0

/**
 * v1.35: show a rendered link's destination before it opens.
 * A hovered or keyboard-focused link in a completed message bubble
 * fills a muted status pill at the bottom-left of the chat column.
 * Hover wins over focus. Mouse leave clears the hover; focus keeps
 * the pill until blur. Long URLs truncate in the middle.
 * The pill does not change the click, which still opens the system
 * browser. No new HTTP.
 * Keep the destination string in lockstep with
 * `ios/SnorlaxBot/LinkPreview.swift` (that side shows the full URL).
 */

export const LINK_STATUS_MAX = 64;

const ELLIPSIS = "…";

type Slot = { id: number; url: string } | null;

let seq = 1;
let hover: Slot = null;
let focus: Slot = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** One id per rendered link so a sibling with the same URL can stay. */
export function nextLinkStatusId(): number {
  seq += 1;
  return seq;
}

/** Hovered destination, else the focused one, else nothing. */
export function shownLinkStatus(
  hovered: string | null,
  focused: string | null,
): string | null {
  if (hovered) return hovered;
  if (focused) return focused;
  return null;
}

/**
 * Pill text. A short URL stays whole. A longer one keeps the head
 * and the tail, with a single ellipsis between them.
 */
export function linkStatusLabel(url: string, max = LINK_STATUS_MAX): string {
  if (max <= 0) return "";
  if (url.length <= max) return url;
  if (max === 1) return ELLIPSIS;
  const keep = max - ELLIPSIS.length;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return url.slice(0, head) + ELLIPSIS + url.slice(url.length - tail);
}

export function currentLinkStatus(): string | null {
  return shownLinkStatus(hover?.url ?? null, focus?.url ?? null);
}

export function subscribeLinkStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function linkStatusHover(id: number, url: string): void {
  if (!url) return;
  hover = { id, url };
  emit();
}

export function linkStatusClearHover(id: number): void {
  if (hover?.id !== id) return;
  hover = null;
  emit();
}

export function linkStatusFocus(id: number, url: string): void {
  if (!url) return;
  focus = { id, url };
  emit();
}

export function linkStatusClearFocus(id: number): void {
  if (focus?.id !== id) return;
  focus = null;
  emit();
}

/** Tests and unmount. Drops both slots. */
export function resetLinkStatus(): void {
  hover = null;
  focus = null;
  emit();
}
