// SPDX-License-Identifier: Apache-2.0

/**
 * v0.71: in-chat find over messages already loaded.
 * Desktop: Cmd/Ctrl-F opens a find bar, highlights matches, Enter /
 * Shift-Enter and the up/down buttons move between them, Esc closes
 * and clears highlights. iOS filters user / assistant / handoff rows
 * and highlights the same way. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatFind.swift`.
 */

export const FIND_INPUT_LABEL = "Find in chat";
export const FIND_PLACEHOLDER = "Find";
export const FIND_PREV_LABEL = "Previous match";
export const FIND_NEXT_LABEL = "Next match";
export const FIND_CLOSE_LABEL = "Close find";
export const FIND_EMPTY_LABEL = "No matches";

export type FindRow = {
  id: string;
  text: string;
};

export type FindHit = {
  rowId: string;
  start: number;
  end: number;
};

export type FindSpan = {
  text: string;
  match: boolean;
  active: boolean;
};

/** A painted transcript string. Hidden tool lines and card chrome are out. */
export type TranscriptFindMessage = {
  id: string;
  texts: readonly string[];
  hidden?: boolean;
  skip?: boolean;
  /** One row, id = message id (user, handoff, tool, live trace). */
  single?: boolean;
};

export function findQueryActive(query: string): boolean {
  return query.trim().length > 0;
}

/** Cmd-F / Ctrl-F. Shift and Alt stay with the browser / composer. */
export function isFindChord(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "f" || event.key === "F";
}

/**
 * While the find bar is open, Esc closes it and clears highlights.
 * It does not Stop, Jump, or clear a recalled draft. IME keeps Esc.
 */
export function escapeClosesFind(input: {
  open: boolean;
  composing?: boolean;
}): boolean {
  return input.open && !input.composing;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, non-overlapping, left to right. Whitespace-only is none. */
export function findHits(
  rows: readonly FindRow[],
  query: string,
): FindHit[] {
  if (!findQueryActive(query)) return [];
  const pattern = new RegExp(escapeRegExp(query), "gi");
  const hits: FindHit[] = [];
  for (const row of rows) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(row.text)) !== null) {
      const len = match[0].length;
      if (len === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      hits.push({
        rowId: row.id,
        start: match.index,
        end: match.index + len,
      });
    }
  }
  return hits;
}

/** 1-based `n of m`. No matches reads `0 of 0`. */
export function findCountLabel(index: number, total: number): string {
  if (total <= 0 || index < 0 || index >= total) return "0 of 0";
  return `${index + 1} of ${total}`;
}

/** direction 1 = next (Enter / down), -1 = previous (Shift-Enter / up). Wraps. */
export function stepFindIndex(
  index: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total <= 0) return -1;
  if (index < 0 || index >= total) return direction > 0 ? 0 : total - 1;
  return (index + direction + total) % total;
}

export function highlightSpans(
  text: string,
  query: string,
  active: { start: number; end: number } | null,
): FindSpan[] {
  if (!text) return [];
  const hits = findHits([{ id: "row", text }], query);
  if (!hits.length) return [{ text, match: false, active: false }];
  const spans: FindSpan[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) {
      spans.push({
        text: text.slice(cursor, hit.start),
        match: false,
        active: false,
      });
    }
    spans.push({
      text: text.slice(hit.start, hit.end),
      match: true,
      active:
        active != null &&
        active.start === hit.start &&
        active.end === hit.end,
    });
    cursor = hit.end;
  }
  if (cursor < text.length) {
    spans.push({ text: text.slice(cursor), match: false, active: false });
  }
  return spans;
}

/**
 * Assistant bubbles are `${id}:${index}`. User, handoff, tool, and live
 * traces are one row keyed by id. Collapsed (hidden) lines and
 * widget / approve / connect chrome are not searchable.
 */
export function transcriptFindRows(
  messages: readonly TranscriptFindMessage[],
): FindRow[] {
  const rows: FindRow[] = [];
  for (const message of messages) {
    if (message.hidden || message.skip || !message.id) continue;
    const texts = message.texts.filter((text) => text.length > 0);
    if (!texts.length) continue;
    if (message.single) {
      rows.push({ id: message.id, text: texts[0]! });
      continue;
    }
    texts.forEach((text, index) => {
      rows.push({ id: `${message.id}:${index}`, text });
    });
  }
  return rows;
}

/**
 * iOS: hide a user / assistant / handoff message when the query is
 * active and none of its text matches. Tool lines and cards stay.
 * Desktop does not filter.
 */
export function omitsUnmatchedMessage(input: {
  searchable: boolean;
  texts: readonly string[];
  query: string;
}): boolean {
  if (!findQueryActive(input.query) || !input.searchable) return false;
  return !input.texts.some(
    (text) => findHits([{ id: "row", text }], input.query).length > 0,
  );
}
