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
