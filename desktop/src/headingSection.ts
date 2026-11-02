// SPDX-License-Identifier: Apache-2.0

/**
 * v2.38: a finished assistant heading section.
 * A section is one ATX heading of level 1–3 (`#`, `##`, or `###`)
 * plus the lines under it until the next heading of the same or
 * higher level. A later `#` / `##` / `###`, and a setext heading of
 * the same or higher level, closes it. `####` and deeper stay inside
 * the section and do not gain their own control. The saved text is
 * those source lines, not the display text.
 * Fences, `$$` blocks, HTML blocks, lists, and block quotes keep
 * their own lines, so a `#` inside one is not a section. Streaming
 * has no sections. Keep in lockstep with
 * `ios/SnorlaxBot/HeadingSection.swift`.
 */

import { contentColumns, isThematicBreakLine } from "./markdownIndentedCode.ts";
import {
  htmlBlockEnd,
  htmlBlockStarts,
  markdownListEnd,
} from "./markdownList.ts";

export type HeadingSection = {
  /** 1, 2, or 3. Deeper ATX headings are not sections. */
  level: 1 | 2 | 3;
  /** The heading line as written, including indent and closing hashes. */
  headingLine: string;
  /**
   * Heading line plus the lines under it. The blank line that ends
   * the section is not included. No extra trailing newline.
   */
  source: string;
  /** Offset of `headingLine` in the normalized document. */
  offset: number;
};

type Boundary = {
  index: number;
  level: number;
  chrome: boolean;
};

export function splitHeadingSections(
  text: string,
  completed = true,
): HeadingSection[] {
  if (!text || !completed) return [];
  const src = normalize(text);
  const lines = src.split("\n");
  const boundaries = collectBoundaries(lines);
  const sections: HeadingSection[] = [];
  for (const boundary of boundaries) {
    if (!boundary.chrome) continue;
    if (boundary.level < 1 || boundary.level > 3) continue;
    let end = lines.length;
    for (const later of boundaries) {
      if (later.index <= boundary.index) continue;
      if (later.level <= boundary.level) {
        end = later.index;
        break;
      }
    }
    const slice = lines.slice(boundary.index, end);
    while (slice.length > 0 && isBlank(slice[slice.length - 1] ?? "")) slice.pop();
    if (slice.length === 0) continue;
    const headingLine = lines[boundary.index] ?? "";
    sections.push({
      level: boundary.level as 1 | 2 | 3,
      headingLine,
      source: slice.join("\n"),
      offset: lineOffset(lines, boundary.index),
    });
  }
  return sections;
}

/**
 * Sections whose heading line sits in each bubble. Bubble text is
 * the blank-line split of `documentText`. A heading bubble keeps the
 * whole section, including lines that render in later bubbles.
 * Streaming returns an empty list per bubble.
 */
export function headingSectionsByBubble(
  documentText: string,
  bubbles: string[],
  completed = true,
): HeadingSection[][] {
  if (!completed) return bubbles.map(() => []);
  const src = normalize(documentText);
  const sections = splitHeadingSections(src, true);
  const spans = bubbleSpans(src, bubbles);
  return spans.map((span) => {
    if (span.start < 0) return [];
    return sections.filter(
      (section) => section.offset >= span.start && section.offset < span.end,
    );
  });
}

export type HeadingPiece =
  | { type: "text"; text: string }
  | { type: "section"; text: string; section: HeadingSection };

/**
 * Split one bubble around the heading lines it owns. Text before
 * the first heading stays plain. Each owned heading runs until the
 * next owned heading in this bubble. The section source may be
 * longer than `text` when later bubbles continue the section.
 */
export function partitionHeadingBubble(
  bubble: string,
  sections: HeadingSection[],
): HeadingPiece[] {
  if (!bubble) return [];
  if (sections.length === 0) return [{ type: "text", text: bubble }];
  const lines = bubble.split("\n");
  const pieces: HeadingPiece[] = [];
  let buf: string[] = [];
  let next = 0;
  const flushText = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    buf = [];
    if (text.length > 0) pieces.push({ type: "text", text });
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const section = next < sections.length ? sections[next] : undefined;
    if (section && line === section.headingLine) {
      flushText();
      const start = i;
      next += 1;
      i += 1;
      while (i < lines.length) {
        const later = next < sections.length ? sections[next] : undefined;
        if (later && (lines[i] ?? "") === later.headingLine) break;
        i += 1;
      }
      pieces.push({
        type: "section",
        text: lines.slice(start, i).join("\n"),
        section,
      });
      i -= 1;
      continue;
    }
    buf.push(line);
  }
  flushText();
  return pieces.length > 0 ? pieces : [{ type: "text", text: bubble }];
}

function collectBoundaries(lines: string[]): Boundary[] {
  const boundaries: Boundary[] = [];
  let i = 0;
  let fence: string | null = null;
  let inMath = false;
  let paragraph = false;
  let paragraphStart: number | null = null;

  const closeParagraph = () => {
    paragraph = false;
    paragraphStart = null;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (inMath) {
      if (line.trim() === "$$") inMath = false;
      closeParagraph();
      i += 1;
      continue;
    }
    if (fence) {
      if (isClosingFence(line, fence)) fence = null;
      closeParagraph();
      i += 1;
      continue;
    }
    if (line.trim() === "$$") {
      inMath = true;
      closeParagraph();
      i += 1;
      continue;
    }
    const opened = openingFence(line);
    if (opened) {
      fence = opened;
      closeParagraph();
      i += 1;
      continue;
    }

    const htmlEnd = htmlBlockEnd(lines, i, paragraph);
    if (htmlEnd != null && htmlEnd > i) {
      closeParagraph();
      i = htmlEnd;
      continue;
    }

    const listEnd = markdownListEnd(lines, i);
    if (listEnd != null && listEnd > i) {
      closeParagraph();
      i = listEnd;
      continue;
    }

    if (isQuoteLine(line)) {
      closeParagraph();
      i = skipQuote(lines, i);
      continue;
    }

    const level = atxHeadingLevel(line);
    if (level != null) {
      if (level <= 3) boundaries.push({ index: i, level, chrome: true });
      closeParagraph();
      i += 1;
      continue;
    }

    if (isBlank(line)) {
      closeParagraph();
      i += 1;
      continue;
    }

    if (paragraph) {
      const underline = setextUnderline(line);
      if (underline && paragraphStart != null) {
        boundaries.push({
          index: paragraphStart,
          level: underline.level,
          chrome: false,
        });
        closeParagraph();
        i += 1;
        continue;
      }
      if (isThematicBreakLine(line)) {
        closeParagraph();
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (isThematicBreakLine(line) || isIndentedCodeLine(line)) {
      closeParagraph();
      i += 1;
      continue;
    }

    paragraph = true;
    paragraphStart = i;
    i += 1;
  }
  return boundaries;
}

function skipQuote(lines: string[], start: number): number {
  let i = start + 1;
  let open = true;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isQuoteLine(line)) {
      open = true;
      i += 1;
      continue;
    }
    if (!open) break;
    if (
      isBlank(line) ||
      atxHeadingLevel(line) != null ||
      openingFence(line) != null ||
      line.trim() === "$$" ||
      htmlBlockStarts(line) ||
      isThematicBreakLine(line) ||
      markdownListEnd(lines, i) != null
    ) {
      break;
    }
    i += 1;
  }
  return i;
}

/** Offsets of each bubble inside the normalized document. Missing text is -1. */
export function headingBubbleSpans(
  documentText: string,
  bubbles: readonly string[],
): { start: number; end: number }[] {
  return bubbleSpans(normalize(documentText), bubbles);
}

function bubbleSpans(
  src: string,
  bubbles: readonly string[],
): { start: number; end: number }[] {
  let cursor = 0;
  return bubbles.map((bubble) => {
    if (!bubble) return { start: -1, end: -1 };
    const at = src.indexOf(bubble, cursor);
    if (at < 0) return { start: -1, end: -1 };
    cursor = at + bubble.length;
    return { start: at, end: cursor };
  });
}

function lineOffset(lines: string[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) offset += (lines[i] ?? "").length + 1;
  return offset;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isBlank(line: string): boolean {
  return contentColumns(line) == null;
}

function isIndentedCodeLine(line: string): boolean {
  const columns = contentColumns(line);
  return columns != null && columns >= 4;
}

/** ATX level 1–6, or null. A `#` inside a fence is not asked. */
export function atxHeadingLevel(line: string): number | null {
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
  if (columns > 3) return null;
  let hashes = 0;
  while (index < line.length && line[index] === "#" && hashes < 7) {
    hashes += 1;
    index += 1;
  }
  if (hashes < 1 || hashes > 6) return null;
  if (index < line.length && line[index] !== " " && line[index] !== "\t") return null;
  return hashes;
}

function isQuoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line);
}

/** 0–3 spaces, then `=` or `-`, then trailing space or tab. A lone `-` is not an underline. */
function setextUnderline(line: string): { level: 1 | 2 } | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const ch = line[i];
  if (ch !== "=" && ch !== "-") return null;
  const start = i;
  while (i < line.length && line[i] === ch) i += 1;
  const count = i - start;
  if (ch === "-" && count < 2) return null;
  for (let j = i; j < line.length; j += 1) {
    const c = line[j];
    if (c !== " " && c !== "\t") return null;
  }
  return { level: ch === "=" ? 1 : 2 };
}

function openingFence(line: string): string | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const marker = match[2] ?? "";
  const info = match[3] ?? "";
  if (marker.startsWith("`") && info.includes("`")) return null;
  return marker;
}

function isClosingFence(line: string, open: string): boolean {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return false;
  const marker = match[2] ?? "";
  if (!marker || marker[0] !== open[0]) return false;
  if (marker.length < open.length) return false;
  return (match[3] ?? "").trim() === "";
}
