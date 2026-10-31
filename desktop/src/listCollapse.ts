// SPDX-License-Identifier: Apache-2.0

/**
 * v2.34: collapse a long assistant list.
 * A completed bulleted, numbered, or task list with more than 8 items
 * shows the first 8 items and a muted Show more. Click or tap expands
 * that list and the control becomes Show less. Each list collapses on
 * its own, including a nested list. The choice is not saved. Streaming
 * stays plain text. The footnote list stays open. Copy still uses the
 * whole message. An active find match in that list stays fully visible.
 * The control does not move composer focus. No animation. No new
 * shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ListCollapse.swift`.
 */

import { findHits, findQueryActive } from "./chatFind.ts";

export const LIST_SHOW_MORE = "Show more";
export const LIST_SHOW_LESS = "Show less";
export const LIST_SHOW_MORE_ARIA = "Show more list";
export const LIST_SHOW_LESS_ARIA = "Show less list";

/** Items. One more item than this collapses. The marker stays with the item. */
export const LIST_COLLAPSE_ITEMS = 8;

export function listOverflows(
  itemCount: number,
  limit = LIST_COLLAPSE_ITEMS,
): boolean {
  return itemCount > limit;
}

/** Clamp only a finished list the reader has not opened. */
export function shouldCollapseList(input: {
  completed: boolean;
  itemCount: number;
  expanded: boolean;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    listOverflows(input.itemCount) &&
    !input.expanded &&
    !input.activeFind
  );
}

/** Hide the control while streaming and while find is showing the match. */
export function showListCollapseToggle(input: {
  completed: boolean;
  itemCount: number;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    listOverflows(input.itemCount) &&
    !input.activeFind
  );
}

export function listCollapseLabel(expanded: boolean): string {
  return expanded ? LIST_SHOW_LESS : LIST_SHOW_MORE;
}

export function listCollapseAria(expanded: boolean): string {
  return expanded ? LIST_SHOW_LESS_ARIA : LIST_SHOW_MORE_ARIA;
}

/**
 * Items to paint. An open list keeps every item. Copy does not use
 * this slice: the message copy is still the full markdown source.
 */
export function listVisibleItems<T>(
  items: readonly T[],
  collapsed: boolean,
  limit = LIST_COLLAPSE_ITEMS,
): readonly T[] {
  if (!collapsed) return items;
  return items.slice(0, limit);
}

/** Item text, one item per line. Markers are not added. */
export function listFindText(parts: readonly string[]): string {
  return parts.join("\n");
}

/**
 * This bubble owns the active find hit, and the query occurs in the
 * list. The list stays fully open so that match is not hidden.
 * Prose that the list does not contain leaves the list collapsed.
 */
export function listFindKeepsOpen(input: {
  activeRowId: string;
  wrapScope: string;
  text: string;
  query: string;
}): boolean {
  if (!input.activeRowId || input.activeRowId !== input.wrapScope) return false;
  if (!findQueryActive(input.query)) return false;
  return (
    findHits([{ id: "row", text: input.text }], input.query).length > 0
  );
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function listCollapseAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
