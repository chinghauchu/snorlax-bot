// SPDX-License-Identifier: Apache-2.0

/**
 * v1.53: CommonMark indented fences on a completed assistant
 * LEFT `kind=message`.
 *
 * A code fence indented by 1–3 spaces drops that many columns from
 * every content line. A line indented less than that drops all of
 * its indent. A tab advances to the next column of 4, and a tab
 * that would pass the indent becomes the leftover spaces. The
 * closing fence line is not part of the code. Tilde fences follow
 * the same rule. A fence at column 0 is unchanged. Four or more
 * spaces is indented code, not a fence. Streaming stays plain.
 * Copy on the message keeps markdown source. Copy on the code
 * block copies this dedented body. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownFenceIndent.swift`.
 */

import { fenceInfoAllowsOpen } from "./math.ts";

export type OpeningFence = {
  indent: number;
  marker: string;
  info: string;
};

/** Never animate, including when Reduce Motion is off. */
export function fenceIndentAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * A fence opener in the first three columns, or null. A backtick
 * fence whose info string contains a backtick is not a fence.
 * Four or more spaces (or a tab) is not a fence.
 */
export function openingFence(line: string): OpeningFence | null {
  let indent = 0;
  while (indent < line.length && indent < 4 && line[indent] === " ") indent += 1;
  if (indent > 3) return null;
  const rest = line.slice(indent);
  const match = /^(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!match) return null;
  const marker = match[1] ?? "";
  const info = match[2] ?? "";
  if (!fenceInfoAllowsOpen(marker, info)) return null;
  return { indent, marker, info };
}

/**
 * Drop up to `columns` of leading indent. A partial tab is the
 * spaces that still sit past the indent.
 */
export function dedentFenceLine(line: string, columns: number): string {
  if (columns <= 0 || !line) return line;
  let col = 0;
  let index = 0;
  while (index < line.length && col < columns) {
    const ch = line[index];
    if (ch === " ") {
      col += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      const next = col + (4 - (col % 4));
      index += 1;
      if (next > columns) return `${" ".repeat(next - columns)}${line.slice(index)}`;
      col = next;
      continue;
    }
    break;
  }
  return line.slice(index);
}

/** Dedent every line of a fence body. `columns` <= 0 returns `text`. */
export function dedentFencedContent(text: string, columns: number): string {
  if (columns <= 0 || !text) return text;
  const lines = text.split("\n");
  return lines.map((line) => dedentFenceLine(line, columns)).join("\n");
}

/**
 * v1.89: cmark-gfm fence_offset when a quote or list marker has
 * already consumed part of a tab. The offset is a count of
 * whitespace bytes, and each byte is one column. A tab that is
 * only partly consumed stays one byte, so the leftover columns
 * become spaces in the code. A space-only indent is unchanged
 * (`openingFence` / `dedentFenceLine`). `markers` is true for a
 * block quote, whose prefix includes `>` before the content column.
 */
export type TabFenceOpen = { marker: string; info: string; offset: number };

type TabCursor = { index: number; column: number; partial: number };

export function tabFenceOpen(
  line: string,
  contentColumn: number,
  markers = false,
): TabFenceOpen | null {
  const start = cursorAt(line, contentColumn, markers);
  const found = firstNonspace(line, start);
  if (found.indent > 3 || found.index >= line.length) return null;
  const ch = line[found.index] ?? "";
  if (ch !== "`" && ch !== "~") return null;
  let n = 0;
  let i = found.index;
  while (i < line.length && line[i] === ch) {
    n += 1;
    i += 1;
  }
  if (n < 3) return null;
  const info = line.slice(i);
  const marker = ch.repeat(n);
  if (!fenceInfoAllowsOpen(marker, info)) return null;
  if (!line.slice(start.index, found.index).includes("\t")) return null;
  return { marker, info, offset: found.bytes };
}

/** Code text of one fence line. A partial tab becomes leftover spaces. */
export function tabFenceCodeLine(
  line: string,
  contentColumn: number,
  fenceOffset: number,
  markers = false,
): string {
  const cur = cursorAt(line, contentColumn, markers);
  let left = fenceOffset;
  while (left > 0) {
    const ch = peek(line, cur);
    if (ch !== " " && ch !== "\t") break;
    advanceColumns(line, cur, 1);
    left -= 1;
  }
  if (cur.partial > 0) return `${" ".repeat(cur.partial)}${line.slice(cur.index + 1)}`;
  return line.slice(cur.index);
}

/** Closing fence measured from the same content column as the opener. */
export function tabFenceCloses(
  line: string,
  contentColumn: number,
  marker: string,
  markers = false,
): boolean {
  const start = cursorAt(line, contentColumn, markers);
  const found = firstNonspace(line, start);
  if (found.indent > 3 || found.index >= line.length) return false;
  const ch = marker[0] ?? "";
  if ((line[found.index] ?? "") !== ch) return false;
  let n = 0;
  let i = found.index;
  while (i < line.length && line[i] === ch) {
    n += 1;
    i += 1;
  }
  if (n < marker.length) return false;
  for (let k = i; k < line.length; k += 1) {
    const tail = line[k];
    if (tail !== " " && tail !== "\t") return false;
  }
  return true;
}

function cursorAt(line: string, contentColumn: number, markers: boolean): TabCursor {
  const cur: TabCursor = { index: 0, column: 0, partial: 0 };
  if (contentColumn <= 0) return cur;
  if (markers) {
    advanceColumns(line, cur, contentColumn);
    return cur;
  }
  while (cur.column < contentColumn) {
    const ch = peek(line, cur);
    if (ch !== " " && ch !== "\t") break;
    advanceColumns(line, cur, 1);
  }
  return cur;
}

function advanceColumns(line: string, cur: TabCursor, count: number): void {
  let left = count;
  while (left > 0) {
    if (cur.partial > 0) {
      const step = Math.min(left, cur.partial);
      cur.partial -= step;
      cur.column += step;
      left -= step;
      if (cur.partial === 0) cur.index += 1;
      continue;
    }
    if (cur.index >= line.length) return;
    const ch = line[cur.index] ?? "";
    if (ch === "\t") {
      const width = 4 - (cur.column % 4);
      const step = Math.min(left, width);
      cur.column += step;
      left -= step;
      if (step < width) cur.partial = width - step;
      else cur.index += 1;
      continue;
    }
    cur.index += 1;
    cur.column += 1;
    left -= 1;
  }
}

function peek(line: string, cur: TabCursor): string {
  if (cur.partial > 0) return "\t";
  if (cur.index >= line.length) return "";
  return line[cur.index] ?? "";
}

function firstNonspace(
  line: string,
  start: TabCursor,
): { index: number; bytes: number; indent: number } {
  let index = start.index;
  let column = start.column;
  let partial = start.partial;
  let bytes = 0;
  while (index < line.length) {
    if (partial > 0) {
      column += partial;
      partial = 0;
      index += 1;
      bytes += 1;
      continue;
    }
    const ch = line[index] ?? "";
    if (ch === " ") {
      column += 1;
      index += 1;
      bytes += 1;
      continue;
    }
    if (ch === "\t") {
      column += 4 - (column % 4);
      index += 1;
      bytes += 1;
      continue;
    }
    break;
  }
  return { index, bytes, indent: column - start.column };
}
