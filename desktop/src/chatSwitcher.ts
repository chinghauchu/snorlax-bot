// SPDX-License-Identifier: Apache-2.0

/**
 * v0.72: quick chat switcher over the roster already loaded.
 * Desktop: Cmd/Ctrl-K opens a small overlay. A fuzzy name filter
 * narrows agents and channels. Arrow keys move the highlight, Enter
 * switches to that chat, Esc closes. iOS: a pull-down search field
 * on the chat list narrows the same names. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatSwitcher.swift`.
 */

export const SWITCH_INPUT_LABEL = "Switch chat";
export const SWITCH_PLACEHOLDER = "Search chats";
export const SWITCH_EMPTY_LABEL = "No chats";

export type SwitchChat = {
  id: string;
  name: string;
};

/** Cmd-K / Ctrl-K. Shift and Alt stay with the browser / composer. */
export function isSwitchChord(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "k" || event.key === "K";
}

/**
 * While the switcher is open, Esc closes it and does not switch.
 * It does not Stop, Jump, close find, or clear a recalled draft.
 * IME keeps Esc.
 */
export function escapeClosesSwitcher(input: {
  open: boolean;
  composing?: boolean;
}): boolean {
  return input.open && !input.composing;
}

/** A non-blank query filters. Whitespace-only shows every chat. */
export function switchQueryActive(query: string): boolean {
  return query.trim().length > 0;
}

function isBoundary(hay: string, index: number): boolean {
  const prev = hay.charAt(index);
  return prev === " " || prev === "-" || prev === "_";
}

/**
 * Case-insensitive subsequence over UTF-16 code units (Swift
 * `NSString` indexes). Consecutive hits and word starts score
 * higher. Null when a query unit never appears.
 */
export function fuzzyScore(name: string, needle: string): number | null {
  const hay = name.toLowerCase();
  const query = needle.toLowerCase();
  if (!query) return 0;
  let score = 0;
  let hi = 0;
  let prev = -2;
  let first = -1;
  for (let i = 0; i < query.length; i += 1) {
    const unit = query.charAt(i);
    const at = hay.indexOf(unit, hi);
    if (at < 0) return null;
    if (first < 0) first = at;
    score += 1;
    if (at === prev + 1) score += 4;
    if (at === 0 || isBoundary(hay, at - 1)) score += 2;
    prev = at;
    hi = at + 1;
  }
  score += Math.max(0, 8 - first);
  return score;
}

/**
 * Empty / whitespace query keeps roster order. Otherwise higher
 * score first, then the original order.
 */
export function filterChats(
  chats: readonly SwitchChat[],
  query: string,
): SwitchChat[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...chats];
  const ranked: { chat: SwitchChat; score: number; index: number }[] = [];
  chats.forEach((chat, index) => {
    const score = fuzzyScore(chat.name, needle);
    if (score == null) return;
    ranked.push({ chat, score, index });
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.map((row) => row.chat);
}

/** direction 1 = down, -1 = up. Wraps. Empty list stays -1. */
export function stepSwitchIndex(
  index: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total <= 0) return -1;
  if (index < 0 || index >= total) return direction > 0 ? 0 : total - 1;
  return (index + direction + total) % total;
}

export function clampSwitchIndex(index: number, total: number): number {
  if (total <= 0) return -1;
  if (index < 0) return 0;
  return Math.min(index, total - 1);
}
