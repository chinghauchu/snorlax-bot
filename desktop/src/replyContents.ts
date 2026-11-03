// SPDX-License-Identifier: Apache-2.0

/**
 * v2.44: a Contents outline on a finished long assistant reply.
 * Three or more ATX headings of level 1–3 show a muted Contents list
 * above the first bubble. Each row is that heading. Click or tap
 * scrolls the heading into view. A heading hidden under a folded
 * ancestor opens that ancestor first. A heading inside a clamped
 * bubble opens that bubble. Two headings stay plain. `####`, setext,
 * and a heading marker inside a fence, list, quote, math block, or
 * HTML block stay out. Streaming stays plain text. A user message
 * stays plain. The choice is not saved. Copy still copies the reply.
 * The control does not move composer focus. No animation. No new
 * shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ReplyContents.swift`.
 */

import { splitHeadingSections, type HeadingSection } from "./headingSection.ts";
import { sectionBodyRange } from "./sectionCollapse.ts";

export const CONTENTS_LABEL = "Contents";
export const CONTENTS_GO_TO_EMPTY = "Go to heading";

/** Fewer headings than this stay plain. The heading line itself counts. */
export const CONTENTS_MIN_HEADINGS = 3;

/** Extra indent per level below 1. Level 2 is 12px / 12pt. Level 3 is 24. */
export const CONTENTS_INDENT_PX = 12;

export type ContentsEntry = {
  level: 1 | 2 | 3;
  /** Heading text with the ATX marks removed. Inline marks stay. */
  title: string;
  /** Heading section offset. The scroll anchor. */
  offset: number;
};

export function replyContentsEntries(
  text: string,
  completed = true,
): ContentsEntry[] {
  if (!text || !completed) return [];
  const sections = splitHeadingSections(text, true);
  if (sections.length < CONTENTS_MIN_HEADINGS) return [];
  return sections.map((section) => ({
    level: section.level,
    title: headingTitle(section.headingLine),
    offset: section.offset,
  }));
}

export function contentsShows(count: number, minimum = CONTENTS_MIN_HEADINGS): boolean {
  return count >= minimum;
}

/** Display text of one ATX heading line. Closing hashes come off. */
export function headingTitle(headingLine: string): string {
  let index = 0;
  let columns = 0;
  while (index < headingLine.length && columns <= 3) {
    const ch = headingLine[index];
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
  while (index < headingLine.length && headingLine[index] === "#") index += 1;
  if (
    index < headingLine.length &&
    (headingLine[index] === " " || headingLine[index] === "\t")
  ) {
    index += 1;
  }
  let text = trimEdge(headingLine.slice(index));
  text = trimEdge(text.replace(/[ \t]+#+$/, ""));
  return text;
}

export function contentsIndentPx(level: number, step = CONTENTS_INDENT_PX): number {
  if (level <= 1) return 0;
  return (level - 1) * step;
}

export function contentsGoToLabel(title: string): string {
  const name = title.trim();
  return name ? `Go to ${name}` : CONTENTS_GO_TO_EMPTY;
}

export function contentsAnchor(messageId: string, offset: number): string {
  return `contents:${messageId}:${offset}`;
}

/**
 * Anchor for the heading that owns this bubble. A nested markdown
 * render (a null in the scope) does not add a second anchor.
 */
export function contentsAnchorForWrap(wrapScope: string, offset: number): string | null {
  if (!wrapScope || wrapScope.includes("\u0000")) return null;
  const colon = wrapScope.lastIndexOf(":");
  if (colon <= 0) return null;
  const bubble = wrapScope.slice(colon + 1);
  if (!/^\d+$/.test(bubble)) return null;
  const messageId = wrapScope.slice(0, colon);
  if (!messageId) return null;
  return contentsAnchor(messageId, offset);
}

export function contentsSelector(anchor: string): string {
  return `[data-contents-anchor="${escapeContentsAnchor(anchor)}"]`;
}

/** Center the heading. Instant, including when Reduce Motion is off. */
export function contentsScrollOptions(reduceMotion: boolean): ScrollIntoViewOptions {
  void reduceMotion;
  return { block: "center", behavior: "auto" };
}

export function contentsAnimates(reduceMotion: boolean): boolean {
  void reduceMotion;
  return false;
}

/**
 * Collapsed ancestors whose body contains this heading. The heading's
 * own section is not opened: its heading line stays on screen.
 */
export function contentsAncestorsToOpen(
  documentText: string,
  offset: number,
  collapsed: ReadonlySet<number>,
): number[] {
  if (!documentText || collapsed.size === 0) return [];
  const sections = splitHeadingSections(documentText, true);
  return ancestorOffsets(sections, offset, collapsed);
}

export function contentsBubbleFor(
  byBubble: readonly { offset: number }[][],
  offset: number,
): number | null {
  for (let index = 0; index < byBubble.length; index += 1) {
    const sections = byBubble[index] ?? [];
    if (sections.some((section) => section.offset === offset)) return index;
  }
  return null;
}

/** Scroll the heading marker into the middle of the transcript. */
export function scrollContentsHeading(anchor: string): boolean {
  if (!anchor || typeof document === "undefined") return false;
  const el = document.querySelector(contentsSelector(anchor));
  if (!(el instanceof HTMLElement)) return false;
  el.scrollIntoView(contentsScrollOptions(false));
  return true;
}

function ancestorOffsets(
  sections: readonly HeadingSection[],
  offset: number,
  collapsed: ReadonlySet<number>,
): number[] {
  const open: number[] = [];
  for (const parent of sections) {
    if (parent.offset === offset || !collapsed.has(parent.offset)) continue;
    const body = sectionBodyRange(parent);
    if (!body) continue;
    if (offset >= body.start && offset < body.end) open.push(parent.offset);
  }
  return open;
}

function trimEdge(text: string): string {
  return text.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function escapeContentsAnchor(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
}
