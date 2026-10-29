// SPDX-License-Identifier: Apache-2.0

/**
 * v2.19: collapse a long assistant code block.
 * A completed fence or indented code block longer than 14 lines shows
 * the first 14 lines and a muted Show more. Click or tap expands that
 * block and the control becomes Show less. Each block collapses on
 * its own. Streaming stays open. A rendered mermaid diagram is not a
 * code block here. Copy still copies the full source. An active find
 * match in that block stays fully visible. The control does not move
 * composer focus. No animation. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/CodeBlockCollapse.swift`.
 */

import { findHits, findQueryActive } from "./chatFind.ts";

export const CODE_BLOCK_SHOW_MORE = "Show more";
export const CODE_BLOCK_SHOW_LESS = "Show less";
export const CODE_BLOCK_SHOW_MORE_ARIA = "Show more code";
export const CODE_BLOCK_SHOW_LESS_ARIA = "Show less code";

/** A block of this many lines stays fully open. One more collapses. */
export const CODE_BLOCK_COLLAPSE_LINES = 14;

/** One trailing newline is the fence closer, not an extra line. */
export function codeBlockBody(source: string): string {
  return source.endsWith("\n") ? source.slice(0, -1) : source;
}

export function codeBlockLineCount(source: string): number {
  const body = codeBlockBody(source);
  if (body.length === 0) return 0;
  return body.split("\n").length;
}

export function codeBlockOverflows(
  lineCount: number,
  limit = CODE_BLOCK_COLLAPSE_LINES,
): boolean {
  return lineCount > limit;
}

/** Clamp only a finished block the reader has not opened. */
export function shouldCollapseCodeBlock(input: {
  completed: boolean;
  lineCount: number;
  expanded: boolean;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    codeBlockOverflows(input.lineCount) &&
    !input.expanded &&
    !input.activeFind
  );
}

/** Hide the control while streaming and while find is showing the match. */
export function showCodeBlockCollapseToggle(input: {
  completed: boolean;
  lineCount: number;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    codeBlockOverflows(input.lineCount) &&
    !input.activeFind
  );
}

export function codeBlockCollapseLabel(expanded: boolean): string {
  return expanded ? CODE_BLOCK_SHOW_LESS : CODE_BLOCK_SHOW_MORE;
}

export function codeBlockCollapseAria(expanded: boolean): string {
  return expanded ? CODE_BLOCK_SHOW_LESS_ARIA : CODE_BLOCK_SHOW_MORE_ARIA;
}

/**
 * First 14 lines when collapsed. An open block keeps its source,
 * including a trailing newline Copy already had.
 */
export function codeBlockVisibleText(source: string, collapsed: boolean): string {
  if (!collapsed) return source;
  const body = codeBlockBody(source);
  if (body.length === 0) return body;
  return body.split("\n").slice(0, CODE_BLOCK_COLLAPSE_LINES).join("\n");
}

/**
 * Bubble row id stored in a fence wrap id. The first NUL ends it, so
 * an indented block (`row\0indent\0index`) still names that bubble.
 */
export function codeBlockFindRowId(wrapId: string): string {
  const nul = wrapId.indexOf("\0");
  return nul >= 0 ? wrapId.slice(0, nul) : wrapId;
}

/**
 * The bubble that owns the active find hit, and the code itself
 * contains that query. The block stays fully open so the match is
 * not hidden under Show more.
 */
export function codeBlockFindKeepsOpen(input: {
  activeRow: boolean;
  source: string;
  query: string;
}): boolean {
  if (!input.activeRow || !findQueryActive(input.query)) return false;
  return (
    findHits([{ id: "row", text: codeBlockBody(input.source) }], input.query)
      .length > 0
  );
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function codeBlockCollapseAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
