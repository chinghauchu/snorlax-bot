// SPDX-License-Identifier: Apache-2.0

/**
 * v1.48: CommonMark indented code blocks on a completed assistant
 * LEFT `kind=message`.
 *
 * A run of lines indented four or more columns (spaces, or a tab)
 * renders as a code block when it is not a paragraph continuation
 * and not list-item content. There is no info string, so the block
 * is monochrome. Blank lines inside the run stay. Trailing blank
 * lines do not. v1.95: an interior blank keeps columns past the
 * fourth, spaces or a tab stop, the same way cmark-gfm does.
 * An indented line cannot interrupt a paragraph.
 * Fences, `$$`, and a top-level list (including a loose
 * continuation) stay markdown so the existing renderers keep them.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownIndentedCode.swift`.
 */

import { markdownListEnd } from "./markdownList.ts";

export type IndentedCodeBlock =
  | { type: "markdown"; text: string }
  | { type: "code"; source: string };

/** Never animate, including when Reduce Motion is off. */
export function indentedCodeAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Pull top-level indented code out of completed markdown.
 * `completed: false` returns the text unchanged.
 */
export function splitIndentedCode(
  text: string,
  completed = true,
): IndentedCodeBlock[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!completed) return [{ type: "markdown", text: src }];

  const lines = src.split("\n");
  const blocks: IndentedCodeBlock[] = [];
  const md: string[] = [];
  let fence: string | null = null;
  let inMath = false;
  let paragraph = false;
  let i = 0;

  const flushMarkdown = () => {
    if (!md.length) return;
    const chunk = md.join("\n");
    md.length = 0;
    if (chunk.trim()) blocks.push({ type: "markdown", text: chunk });
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      md.push(line);
      paragraph = false;
      i += 1;
      continue;
    }
    if (!fence && !inMath) {
      const listEnd = markdownListEnd(lines, i);
      if (listEnd != null && listEnd > i) {
        for (let j = i; j < listEnd; j += 1) md.push(lines[j] ?? "");
        paragraph = false;
        i = listEnd;
        continue;
      }
    }
    if (isBlank(line)) {
      md.push(line);
      paragraph = false;
      i += 1;
      continue;
    }
    const indent = contentColumns(line);
    if (!paragraph && indent != null && indent >= 4) {
      flushMarkdown();
      const collected: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (isBlank(current)) {
          let j = i;
          while (j < lines.length && isBlank(lines[j] ?? "")) j += 1;
          const upcoming = j < lines.length ? (lines[j] ?? "") : "";
          const nextIndent = j < lines.length ? contentColumns(upcoming) : null;
          if (nextIndent != null && nextIndent >= 4) {
            while (i < j) {
              // v1.95: a blank line is still a code line. Columns
              // past the fourth stay; four or fewer become empty.
              collected.push(dedentCodeLine(lines[i] ?? ""));
              i += 1;
            }
            continue;
          }
          break;
        }
        const columns = contentColumns(current);
        if (columns == null || columns < 4) break;
        collected.push(dedentCodeLine(current));
        i += 1;
      }
      while (collected.length && collected[collected.length - 1] === "") {
        collected.pop();
      }
      if (collected.length) blocks.push({ type: "code", source: collected.join("\n") });
      paragraph = false;
      continue;
    }
    md.push(line);
    paragraph = !isAtxHeadingLine(line) && !isThematicBreakLine(line);
    i += 1;
  }
  flushMarkdown();
  if (blocks.length === 0) return [{ type: "markdown", text: src }];
  return blocks;
}

/** True when completed markdown contains a top-level indented code block. */
export function containsIndentedCode(text: string): boolean {
  return splitIndentedCode(text, true).some((part) => part.type === "code");
}

/** Column of the first non-space, or null when the line is blank. */
export function contentColumns(line: string): number | null {
  let columns = 0;
  for (const ch of line) {
    if (ch === " ") {
      columns += 1;
      continue;
    }
    if (ch === "\t") {
      columns += 4 - (columns % 4);
      continue;
    }
    return columns;
  }
  return null;
}

export function isBlank(line: string): boolean {
  return contentColumns(line) == null;
}

/** ATX heading in the first three columns. Not an indented code line. */
export function isAtxHeadingLine(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  let i = lead.index;
  let hashes = 0;
  while (i < line.length && line[i] === "#" && hashes < 7) {
    hashes += 1;
    i += 1;
  }
  if (hashes < 1 || hashes > 6) return false;
  if (i >= line.length) return true;
  return line[i] === " " || line[i] === "\t";
}

/** Thematic break in the first three columns. Not an indented code line. */
export function isThematicBreakLine(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const mark = line[lead.index];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (let i = lead.index; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === mark) {
      count += 1;
      continue;
    }
    if (ch === " " || ch === "\t") continue;
    return false;
  }
  return count >= 3;
}

/**
 * Drop one indent level (four columns) from a code line.
 * A blank line keeps whatever columns remain past the fourth.
 */
export function dedentCodeLine(line: string): string {
  let columns = 0;
  let index = 0;
  while (index < line.length && columns < 4) {
    const ch = line[index];
    if (ch === " ") {
      columns += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      const next = columns + (4 - (columns % 4));
      index += 1;
      if (next > 4) return `${" ".repeat(next - 4)}${line.slice(index)}`;
      columns = next;
      continue;
    }
    break;
  }
  return line.slice(index);
}

function leadingColumns(line: string): { columns: number; index: number } {
  let columns = 0;
  let index = 0;
  while (index < line.length) {
    const ch = line[index];
    if (ch === " ") {
      columns += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      columns += 4 - (columns % 4);
      index += 1;
      continue;
    }
    break;
  }
  return { columns, index };
}

function blockGate(
  line: string,
  fence: string | null,
  inMath: boolean,
): { fence: string | null; inMath: boolean; blocked: boolean } {
  if (fence) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[2] ?? "";
      const info = match[3] ?? "";
      const same =
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        info.trim() === "";
      return { fence: same ? null : fence, inMath, blocked: true };
    }
    return { fence, inMath, blocked: true };
  }
  if (inMath) {
    if (line.trim() === "$$") return { fence, inMath: false, blocked: true };
    return { fence, inMath, blocked: true };
  }
  const columns = contentColumns(line);
  if (columns != null && columns >= 4) return { fence, inMath, blocked: false };
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (match) {
    const marker = match[2] ?? "";
    const info = match[3] ?? "";
    if (marker[0] === "`" && info.includes("`")) {
      return { fence, inMath, blocked: false };
    }
    return { fence: marker, inMath, blocked: true };
  }
  if (line.trim() === "$$") return { fence, inMath: true, blocked: true };
  return { fence, inMath, blocked: false };
}
