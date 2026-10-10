// SPDX-License-Identifier: Apache-2.0

/**
 * v0.74: per-chat reading place. Switching away remembers whether
 * the transcript was at the latest messages or parked on an earlier
 * one. Coming back restores that place. Within the stick-to-bottom
 * slack, the chat still opens at the latest. A new tail while parked
 * shows Jump to latest. Send, Regenerate, and Jump still snap to the
 * bottom. Session memory only. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ReadingPlace.swift`.
 */

import { isNearBottom, STICK_ARMED, type StickBox, type StickState } from "./stickToBottom.ts";

export type ReadingPlace = {
  nearBottom: boolean;
  anchorId: string | null;
  tailId: string | null;
};

export type ReadingRestoreMode = "bottom" | "anchor";

export type ReadingRowBox = {
  id: string;
  top: number;
  bottom: number;
};

/** One chat, including a channel thread. Empty thread is the timeline. */
export function readingPlaceKey(
  agentId: string,
  threadId: string | null | undefined,
): string {
  return `${agentId}\n${threadId ?? ""}`;
}

/**
 * A scroller that has not been laid out yet is treated as the bottom,
 * so the first open does not invent a parked place.
 */
export function readingNearBottom(box: StickBox | null): boolean {
  if (!box || box.clientHeight <= 0) return true;
  return isNearBottom(box);
}

export function captureReadingPlace(input: {
  nearBottom: boolean;
  anchorId: string | null;
  tailId: string | null;
}): ReadingPlace {
  return {
    nearBottom: input.nearBottom,
    anchorId: input.nearBottom ? null : input.anchorId,
    tailId: input.tailId,
  };
}

/**
 * First row whose bottom is still inside the viewport, in visual order.
 * A row that sits entirely above the viewport is not the anchor.
 */
export function topVisibleAnchor(
  rows: readonly ReadingRowBox[],
  viewportTop: number,
): string | null {
  const ordered = rows
    .filter((row) => row.id.length > 0)
    .slice()
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  let fallback: string | null = null;
  for (const row of ordered) {
    fallback = row.id;
    if (row.bottom > viewportTop + 1) return row.id;
  }
  return fallback;
}

/**
 * Missing place, near the bottom, or an anchor that is no longer in
 * the transcript: open at the latest messages.
 */
export function readingRestore(
  saved: ReadingPlace | null | undefined,
  anchorIds: readonly string[],
): ReadingRestoreMode {
  if (!saved || saved.nearBottom || !saved.anchorId) return "bottom";
  if (!anchorIds.includes(saved.anchorId)) return "bottom";
  return "anchor";
}

/** The transcript grew after the place was saved. */
export function readingTailGrew(
  saved: ReadingPlace | null | undefined,
  tailId: string | null,
): boolean {
  if (!saved || !tailId) return false;
  if (!saved.tailId) return true;
  return saved.tailId !== tailId;
}

/**
 * Near-bottom opens stay armed and follow the stream. A parked place
 * stays put. Jump shows only when the tail grew while the chat was away.
 */
export function stickForReadingRestore(
  mode: ReadingRestoreMode,
  tailGrew: boolean,
): StickState {
  if (mode === "bottom") return { ...STICK_ARMED };
  return { armed: false, showJump: tailGrew };
}

/** Scroll so the anchor's top meets the viewport's top. */
export function anchorScrollTop(
  rowTop: number,
  viewportTop: number,
  scrollTop: number,
): number {
  return Math.max(0, rowTop - viewportTop + scrollTop);
}
