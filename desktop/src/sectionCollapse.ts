// SPDX-License-Identifier: Apache-2.0

/**
 * v2.43: collapse a long assistant heading section.
 * A completed ATX heading of level 1–3 whose body is longer than 14
 * lines shows the heading and a muted Show more. Click or tap expands
 * that section and the control becomes Show less. Lines under the
 * heading hide, including lines that render in later blank-line
 * bubbles, until the next heading of the same or higher level. Each
 * section collapses on its own. The choice is not saved. Streaming
 * stays plain text. Copy and Save still use the full section. An
 * active find hit inside the section keeps it open. The control does
 * not move composer focus. No animation. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/SectionCollapse.swift`.
 */

import {
  headingBubbleSpans,
  splitHeadingSections,
  type HeadingSection,
} from "./headingSection.ts";

export const SECTION_SHOW_MORE = "Show more";
export const SECTION_SHOW_LESS = "Show less";
export const SECTION_SHOW_MORE_ARIA = "Show more section";
export const SECTION_SHOW_LESS_ARIA = "Show less section";

/**
 * Body lines under the heading. The heading line does not count.
 * One more line than this collapses. Blank lines inside the section count.
 */
export const SECTION_COLLAPSE_LINES = 14;

export type SectionSpan = { start: number; end: number };

export type SectionCollapsePlan = {
  /** Bubble indexes that are not painted. */
  hidden: ReadonlySet<number>;
  /** Section offsets whose body is hidden. */
  collapsed: ReadonlySet<number>;
  /** Section offsets that show Show more or Show less. */
  toggles: ReadonlySet<number>;
  /** Section offsets skipped because a collapsed ancestor contains them. */
  hiddenPieces: ReadonlySet<number>;
  /** Offsets the reader opened. Not a server field. */
  expanded: ReadonlySet<number>;
};

export function sectionBodyLineCount(source: string, headingLine: string): number {
  const lines = source.split("\n");
  if (lines.length === 0 || lines[0] !== headingLine) return 0;
  return lines.length - 1;
}

export function sectionOverflows(
  lineCount: number,
  limit = SECTION_COLLAPSE_LINES,
): boolean {
  return lineCount > limit;
}

/** The lines under the heading, in document offsets. Null when the section is only the heading. */
export function sectionBodyRange(section: HeadingSection): SectionSpan | null {
  if (sectionBodyLineCount(section.source, section.headingLine) <= 0) return null;
  const start = section.offset + section.headingLine.length + 1;
  const end = section.offset + section.source.length;
  if (start >= end) return null;
  return { start, end };
}

export function sectionCollapseLabel(expanded: boolean): string {
  return expanded ? SECTION_SHOW_LESS : SECTION_SHOW_MORE;
}

export function sectionCollapseAria(expanded: boolean): string {
  return expanded ? SECTION_SHOW_LESS_ARIA : SECTION_SHOW_MORE_ARIA;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function sectionCollapseAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Bubble index encoded after the message id. Desktop uses `:`, iOS uses `#`.
 * Anything else is not a bubble row.
 */
export function sectionFindBubble(
  messageId: string,
  rowId: string,
  separator: ":" | "#",
): number | null {
  if (!messageId || !rowId) return null;
  const prefix = `${messageId}${separator}`;
  if (!rowId.startsWith(prefix)) return null;
  const rest = rowId.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return Number(rest);
}

/** The part of this bubble under the heading. Empty when the bubble is only the heading. */
export function sectionTail(bubbleText: string, headingLine: string): string {
  const prefix = `${headingLine}\n`;
  if (!bubbleText.startsWith(prefix)) return "";
  return bubbleText.slice(prefix.length);
}

/**
 * Text to paint for one heading piece. A collapsed section keeps the
 * heading line. An open section keeps the bubble's own lines. Copy and
 * Save do not use this slice.
 */
export function sectionVisibleText(
  bubbleText: string,
  headingLine: string,
  collapsed: boolean,
): string {
  if (!collapsed) return bubbleText;
  if (bubbleText === headingLine || bubbleText.startsWith(`${headingLine}\n`)) {
    return headingLine;
  }
  return bubbleText;
}

/**
 * A heading that sits in a collapsed ancestor's body is not painted.
 * The ancestor's own heading stays.
 */
export function sectionPieceHidden(
  offset: number,
  sections: readonly HeadingSection[],
  collapsed: ReadonlySet<number>,
): boolean {
  for (const parent of sections) {
    if (!collapsed.has(parent.offset) || parent.offset === offset) continue;
    const body = sectionBodyRange(parent);
    if (!body) continue;
    if (offset >= body.start && offset < body.end) return true;
  }
  return false;
}

/** Last bubble that is still painted. -1 when every bubble is hidden. */
export function lastPaintedBubble(
  count: number,
  hidden: ReadonlySet<number>,
): number {
  for (let index = count - 1; index >= 0; index -= 1) {
    if (!hidden.has(index)) return index;
  }
  return -1;
}

/**
 * The active find hit lies in this section's body, so the body stays
 * painted. A hit on the heading line does not. A hit in the footnote
 * suffix of a bubble that sits entirely in the body does.
 */
export function sectionFindKeepsOpen(input: {
  section: HeadingSection;
  bubbles: readonly string[];
  spans: readonly SectionSpan[];
  activeBubble: number | null;
  activeStart: number | null;
}): boolean {
  const body = sectionBodyRange(input.section);
  if (!body || input.activeBubble == null) return false;
  const span = input.spans[input.activeBubble];
  if (!span || span.start < 0) return false;
  if (span.start >= body.start && span.end <= body.end) return true;
  const bubble = input.bubbles[input.activeBubble] ?? "";
  const start = input.activeStart;
  if (start == null || start < 0 || start >= bubble.length) return false;
  const at = span.start + start;
  return at >= body.start && at < body.end;
}

export function planSectionCollapse(input: {
  documentText: string;
  bubbles: readonly string[];
  completed: boolean;
  expanded: ReadonlySet<number>;
  activeBubble: number | null;
  activeStart: number | null;
}): SectionCollapsePlan {
  const expanded = input.expanded;
  const empty: SectionCollapsePlan = {
    hidden: new Set(),
    collapsed: new Set(),
    toggles: new Set(),
    hiddenPieces: new Set(),
    expanded,
  };
  if (!input.completed || !input.documentText || input.bubbles.length === 0) {
    return empty;
  }
  const sections = splitHeadingSections(input.documentText, true);
  if (sections.length === 0) return empty;
  const spans = headingBubbleSpans(input.documentText, input.bubbles);
  const collapsed = new Set<number>();
  const toggles = new Set<number>();
  for (const section of sections) {
    const lines = sectionBodyLineCount(section.source, section.headingLine);
    if (!sectionOverflows(lines)) continue;
    const findOpen = sectionFindKeepsOpen({
      section,
      bubbles: input.bubbles,
      spans,
      activeBubble: input.activeBubble,
      activeStart: input.activeStart,
    });
    if (!findOpen) toggles.add(section.offset);
    if (!expanded.has(section.offset) && !findOpen) collapsed.add(section.offset);
  }
  const hidden = new Set<number>();
  spans.forEach((span, index) => {
    if (span.start < 0) return;
    for (const section of sections) {
      if (!collapsed.has(section.offset)) continue;
      const body = sectionBodyRange(section);
      if (!body) continue;
      if (span.start >= body.start && span.end <= body.end) {
        hidden.add(index);
        return;
      }
    }
  });
  const hiddenPieces = new Set<number>();
  for (const section of sections) {
    if (sectionPieceHidden(section.offset, sections, collapsed)) {
      hiddenPieces.add(section.offset);
    }
  }
  return { hidden, collapsed, toggles, hiddenPieces, expanded };
}
