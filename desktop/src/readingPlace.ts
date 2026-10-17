// SPDX-License-Identifier: Apache-2.0

/**
 * v0.74: per-chat reading place. Switching away remembers whether
 * the transcript was at the latest messages or parked on an earlier
 * one. Coming back restores that place. Within the stick-to-bottom
 * slack, the chat still opens at the latest. A new tail while parked
 * shows Jump to latest. Send, Regenerate, and Jump still snap to the
 * bottom. Session memory only. No HTTP.
 *
 * v1.30: the parked place also stores how far into that row the
 * viewport started, as a fraction of the row height. Coming back
 * lands on that fraction, so new messages and a text-size change
 * do not drop the reader at the top of the row. A zero fraction
 * still aligns the row top. An explicit jump to a message, or
 * Cmd/Ctrl-Home/End, wins over the saved place. The restore assigns
 * scrollTop. No animation. Still session memory only. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ReadingPlace.swift`.
 */

import { isNearBottom, STICK_ARMED, type StickBox, type StickState } from "./stickToBottom.ts";

export type ReadingPlace = {
  nearBottom: boolean;
  anchorId: string | null;
  /**
   * Fraction of the anchor row that sits above the viewport.
   * 0 aligns the row's top with the viewport top (v0.74).
   */
  anchorOffset: number;
  tailId: string | null;
};

export type ReadingRestoreMode = "bottom" | "anchor";

export type ReadingRowBox = {
  id: string;
  top: number;
  bottom: number;
};

/** What an explicit scroll was aiming at, after the place was scheduled. */
export type TargetedScrollKind = "top" | "bottom" | "message";

/**
 * `place` restores the saved anchor. `top` / `bottom` are Home / End
 * (and Send, Regenerate, Jump). `keep` leaves a message-target scroll
 * where that jump put it.
 */
export type ReadingRestoreDecision = "place" | "top" | "bottom" | "keep";

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

function finiteOffset(offset: number | null | undefined): number {
  if (offset == null || !Number.isFinite(offset)) return 0;
  return offset;
}

export function captureReadingPlace(input: {
  nearBottom: boolean;
  anchorId: string | null;
  tailId: string | null;
  anchorOffset?: number;
}): ReadingPlace {
  const parked = !input.nearBottom && !!input.anchorId;
  return {
    nearBottom: input.nearBottom,
    anchorId: input.nearBottom ? null : input.anchorId,
    anchorOffset: parked ? finiteOffset(input.anchorOffset) : 0,
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
 * How far into the anchor the viewport starts, as a fraction of the
 * row height. 0 means the row's top meets the viewport top. The
 * fraction tracks a text-size change because the row is measured
 * again on the way back.
 */
export function anchorOffsetFraction(
  rowTop: number,
  rowBottom: number,
  viewportTop: number,
): number {
  const height = rowBottom - rowTop;
  if (!(height > 0)) return 0;
  return (viewportTop - rowTop) / height;
}

/** Fraction for the saved anchor, or 0 when that row is not measured. */
export function anchorOffsetForId(
  rows: readonly ReadingRowBox[],
  anchorId: string | null,
  viewportTop: number,
): number {
  if (!anchorId) return 0;
  const row = rows.find((item) => item.id === anchorId);
  if (!row) return 0;
  return anchorOffsetFraction(row.top, row.bottom, viewportTop);
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

/**
 * An explicit scroll claimed after the place was scheduled wins.
 * Equal tokens mean nothing targeted a message in the meantime.
 */
export function readingRestoreYields(
  scheduledTargeted: number,
  currentTargeted: number,
): boolean {
  return scheduledTargeted !== currentTargeted;
}

export function readingRestoreDecision(
  scheduledTargeted: number,
  currentTargeted: number,
  kind: TargetedScrollKind,
): ReadingRestoreDecision {
  if (!readingRestoreYields(scheduledTargeted, currentTargeted)) return "place";
  if (kind === "top") return "top";
  if (kind === "bottom") return "bottom";
  return "keep";
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

/**
 * Scroll so the saved fraction of the anchor sits above the viewport.
 * A zero offset, or a row with no height, matches v0.74: the row's
 * top meets the viewport top. There is no smooth-scroll animation.
 */
export function anchorScrollTop(
  rowTop: number,
  viewportTop: number,
  scrollTop: number,
  offset = 0,
  rowHeight = 0,
): number {
  const aligned = rowTop - viewportTop + scrollTop;
  const shift =
    rowHeight > 0 && Number.isFinite(offset) ? offset * rowHeight : 0;
  const next = aligned + shift;
  return next < 0 ? 0 : next;
}
