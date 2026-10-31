// SPDX-License-Identifier: Apache-2.0

/**
 * v2.33: collapse a long assistant table.
 * A completed table with more than 8 body rows shows the header and
 * the first 8 body rows, plus a muted Show more. Click or tap expands
 * that table and the control becomes Show less. Each table collapses
 * on its own. The choice is not saved. Streaming stays plain text.
 * Copy, Cells, and Save still use the full table. An active find
 * match in that table stays fully visible. The control does not move
 * composer focus. No animation. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/TableCollapse.swift`.
 */

import { findHits, findQueryActive } from "./chatFind.ts";

export const TABLE_SHOW_MORE = "Show more";
export const TABLE_SHOW_LESS = "Show less";
export const TABLE_SHOW_MORE_ARIA = "Show more table";
export const TABLE_SHOW_LESS_ARIA = "Show less table";

/** Body rows. The header stays. One more row than this collapses. */
export const TABLE_COLLAPSE_ROWS = 8;

export function tableOverflows(
  rowCount: number,
  limit = TABLE_COLLAPSE_ROWS,
): boolean {
  return rowCount > limit;
}

/** Clamp only a finished table the reader has not opened. */
export function shouldCollapseTable(input: {
  completed: boolean;
  rowCount: number;
  expanded: boolean;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    tableOverflows(input.rowCount) &&
    !input.expanded &&
    !input.activeFind
  );
}

/** Hide the control while streaming and while find is showing the match. */
export function showTableCollapseToggle(input: {
  completed: boolean;
  rowCount: number;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    tableOverflows(input.rowCount) &&
    !input.activeFind
  );
}

export function tableCollapseLabel(expanded: boolean): string {
  return expanded ? TABLE_SHOW_LESS : TABLE_SHOW_MORE;
}

export function tableCollapseAria(expanded: boolean): string {
  return expanded ? TABLE_SHOW_LESS_ARIA : TABLE_SHOW_MORE_ARIA;
}

/**
 * Body rows to paint. The header is not in this list. An open table
 * keeps every row. Copy, Cells, and Save do not use this slice.
 */
export function tableVisibleRows<T>(
  rows: readonly T[],
  collapsed: boolean,
  limit = TABLE_COLLAPSE_ROWS,
): readonly T[] {
  if (!collapsed) return rows;
  return rows.slice(0, limit);
}

/** Header and body cells, one cell per line. The delimiter row is not included. */
export function tableFindText(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines: string[] = [];
  for (const cell of header) lines.push(cell);
  for (const row of rows) {
    for (const cell of row) lines.push(cell);
  }
  return lines.join("\n");
}

/**
 * This bubble owns the active find hit, and the query occurs in the
 * table. The table stays fully open so that match is not hidden.
 * Prose that the table does not contain leaves the table collapsed.
 */
export function tableFindKeepsOpen(input: {
  activeRowId: string;
  wrapScope: string;
  header: readonly string[];
  rows: readonly (readonly string[])[];
  query: string;
}): boolean {
  if (!input.activeRowId || input.activeRowId !== input.wrapScope) return false;
  if (!findQueryActive(input.query)) return false;
  return (
    findHits(
      [{ id: "row", text: tableFindText(input.header, input.rows) }],
      input.query,
    ).length > 0
  );
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function tableCollapseAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
