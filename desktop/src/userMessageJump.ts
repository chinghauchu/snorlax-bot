// SPDX-License-Identifier: Apache-2.0

/**
 * v1.25: jump between your sent messages from the keyboard.
 * Cmd/Ctrl-Shift-Up scrolls to the previous user-RIGHT kind=message
 * in the open chat's loaded transcript. Cmd/Ctrl-Shift-Down scrolls
 * to the next one. The target is the sent message relative to the
 * current viewport, under the sticky day header. The target bubble
 * gets a brief subtle highlight. Either end stays clamped.
 * A key repeat is swallowed and does not jump again.
 * The chord works from an empty composer and does not move the caret.
 * When the composer has text, the chord stays with the field so
 * Cmd/Ctrl-Shift-Up and Cmd/Ctrl-Shift-Down keep selecting text.
 * IME composition keeps the key. Find, the quick switcher, the
 * shortcuts overlay, rename, the lightbox, a modal or overlay text
 * field, and a focused widget, approve, or connect card keep the key.
 * Stick-to-bottom, the Jump chip, per-chat reading place, the sticky
 * day header, and collapsed long messages stay as they are.
 * No HTTP. Keep in lockstep with `ios/SnorlaxBot/UserMessageJump.swift`.
 */

import { isUserKindMessage } from "./messageActions.ts";

export const USER_JUMP_KEYS = "Cmd/Ctrl Shift ↑ / ↓";
export const USER_JUMP_ACTION = "Previous or next message you sent";

/** A row this close to the reading line is the current one, not the next. */
export const USER_JUMP_EPSILON = 8;

/** Brief highlight. Reduce Motion drops the fade and keeps the outline. */
export const USER_JUMP_HIGHLIGHT_MS = 1200;

/**
 * Pinned day line (v0.85): 12px top padding, 12px line, 4px bottom.
 * Desktop measures the live separator. iOS uses this when a day is pinned.
 */
export const USER_JUMP_STICKY_INSET = 32;

export type UserJumpDirection = "previous" | "next";

export type UserJumpRow = {
  id: string;
  /** Content Y of the row top. Null when that row is not laid out. */
  top: number | null;
};

export type UserJumpView = {
  /** scrollTop plus the sticky day inset. The reading line under that pin. */
  viewAnchor: number;
  scrollTop: number;
  stickyInset: number;
  maxScroll: number;
  epsilon?: number;
};

export type UserJumpEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type UserJumpGate = {
  chatOpen: boolean;
  composing: boolean;
  /**
   * Focus is in a text field that is not the composer: find, rename,
   * the switcher query, settings, profile, and any other modal field.
   */
  overlayTextField: boolean;
  /** The composer is focused and already has text, so selection stays. */
  composerHasText: boolean;
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

/** User-RIGHT kind=message. Assistant, tool, widget, approve, and connect rows are not. */
export function isUserJumpMessage(message: {
  kind?: string;
  role?: string;
  senderId?: string;
}): boolean {
  return isUserKindMessage(message);
}

/**
 * Cmd/Ctrl-Shift-Up is previous. Cmd/Ctrl-Shift-Down is next.
 * Not both modifiers, and not with Alt. Shift is required, so
 * Up-arrow recall, Alt+Up / Alt+Down, and Cmd/Ctrl-Up on iOS stay.
 * A key repeat still matches so the handler can swallow it.
 */
export function userMessageJumpDirection(
  event: UserJumpEvent,
): UserJumpDirection | null {
  if (event.altKey || !event.shiftKey) return null;
  const command = !!event.metaKey;
  const control = !!event.ctrlKey;
  if (command === control) return null;
  if (event.key === "ArrowUp") return "previous";
  if (event.key === "ArrowDown") return "next";
  return null;
}

/** The first press jumps. A repeat of the held chord does not. */
export function userMessageJumpShouldMove(input: { repeat?: boolean }): boolean {
  return !input.repeat;
}

/**
 * Cmd/Ctrl-Shift-arrow selects text once the composer has any
 * characters, including spaces. An empty composer does not.
 */
export function composerTextOwnsUserJump(inComposer: boolean, text: string): boolean {
  return inComposer && text.length > 0;
}

/** The composer may take this chord. Any other text field does. */
export function overlayTextFieldOwnsUserJump(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays, IME, a composer that already has text, and no open chat
 * keep the key. An empty composer does not.
 */
export function userMessageJumpBlocked(gate: UserJumpGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.composerHasText || gate.inCard) {
    return true;
  }
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/** Reading line just under the pinned day header. */
export function userJumpView(input: {
  scrollTop: number;
  stickyInset: number;
  maxScroll: number;
  epsilon?: number;
}): UserJumpView {
  const stickyInset = Math.max(0, input.stickyInset);
  const maxScroll = Math.max(0, input.maxScroll);
  return {
    viewAnchor: input.scrollTop + stickyInset,
    scrollTop: input.scrollTop,
    stickyInset,
    maxScroll,
    epsilon: input.epsilon,
  };
}

/** Content Y from a viewport measurement. */
export function userJumpContentTop(
  nodeTop: number,
  scrollerTop: number,
  scrollTop: number,
): number {
  return nodeTop - scrollerTop + scrollTop;
}

/**
 * Scroll so the row's top sits just under the sticky day header.
 * Clamped to the loaded transcript.
 */
export function userJumpScrollTop(
  targetTop: number,
  stickyInset: number,
  maxScroll: number,
): number {
  const limit = Math.max(0, maxScroll);
  const raw = targetTop - Math.max(0, stickyInset);
  if (raw <= 0) return 0;
  if (raw >= limit) return limit;
  return raw;
}

export function userJumpHighlightMs(reduceMotion: boolean): number {
  void reduceMotion;
  return USER_JUMP_HIGHLIGHT_MS;
}

/** The outline stays. Reduce Motion skips the fade. */
export function userJumpHighlightAnimates(reduceMotion: boolean): boolean {
  return !reduceMotion;
}

function epsilonOf(view: UserJumpView): number {
  return view.epsilon ?? USER_JUMP_EPSILON;
}

/** On or above the reading line, or already parked on a clamped offset. */
function settled(row: UserJumpRow, view: UserJumpView): boolean {
  if (row.top == null) return false;
  const epsilon = epsilonOf(view);
  if (row.top <= view.viewAnchor + epsilon) return true;
  const commanded = userJumpScrollTop(row.top, view.stickyInset, view.maxScroll);
  const clamped = commanded >= view.maxScroll - epsilon;
  return clamped && view.scrollTop + epsilon >= commanded;
}

function strictlyAbove(row: UserJumpRow, view: UserJumpView): boolean {
  if (row.top == null) return false;
  return row.top < view.viewAnchor - epsilonOf(view);
}

function nextMeasuredIndex(rows: readonly UserJumpRow[], start: number): number {
  for (let index = start; index < rows.length; index += 1) {
    if (rows[index].top != null) return index;
  }
  return -1;
}

/**
 * Previous is the closest sent message above the reading line.
 * Next is the closest one below it. A message whose top is already
 * on that line is the current one. A long message you have scrolled
 * into is previous, so the first press brings its top back under the
 * day header. Rows that are not laid out still count when a later
 * laid-out row shows which side of the line they are on. Either end
 * returns null. The list is transcript order.
 */
export function pickUserJumpId(
  rows: readonly UserJumpRow[],
  direction: UserJumpDirection,
  view: UserJumpView,
): string | null {
  const list = rows.filter((row) => row.id.length > 0);
  if (list.length === 0) return null;

  if (direction === "previous") {
    let lastAbove: string | null = null;
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      if (row.top == null) {
        if (nextMeasuredIndex(list, index + 1) < 0) break;
        lastAbove = row.id;
        continue;
      }
      if (strictlyAbove(row, view)) {
        lastAbove = row.id;
        continue;
      }
      return lastAbove;
    }
    return lastAbove;
  }

  let lastSettled = -1;
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index];
    if (row.top != null && settled(row, view)) {
      lastSettled = index;
      continue;
    }
    if (row.top == null) {
      const later = nextMeasuredIndex(list, index + 1);
      if (later >= 0 && settled(list[later], view)) continue;
      if (lastSettled >= 0) return row.id;
      if (later >= 0 && !settled(list[later], view)) return list[0].id;
      continue;
    }
    if (lastSettled >= 0 && index > lastSettled + 1) return list[lastSettled + 1].id;
    return row.id;
  }
  return null;
}
