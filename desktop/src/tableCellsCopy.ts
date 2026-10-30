// SPDX-License-Identifier: Apache-2.0

/**
 * v2.24: Cells on a completed assistant table.
 * The control copies the painted grid as tab-separated text, then
 * reads Copied for 1.5s. The delimiter row is not included. Copy
 * (v1.31) still copies the markdown source. Hidden while streaming.
 * No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/TableCellsCopy.swift`.
 */

export const TABLE_CELLS_LABEL = "Cells";

export const TABLE_CELLS_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Cells`. */
export const TABLE_CELLS_ARIA = "Copy cells";

export const TABLE_CELLS_COPIED_ARIA = "Copied";

/** Same confirmation window as v1.31 table Copy. */
export const TABLE_CELLS_COPY_MS = 1500;

export function showTableCells(completed: boolean): boolean {
  return completed;
}

export function tableCellsLabel(copied: boolean): "Cells" | "Copied" {
  return copied ? TABLE_CELLS_COPIED_LABEL : TABLE_CELLS_LABEL;
}

export function tableCellsAriaLabel(copied: boolean): string {
  return copied ? TABLE_CELLS_COPIED_ARIA : TABLE_CELLS_ARIA;
}

/**
 * Header and body, one row per line, cells separated by a tab.
 * Width is the header. A short row is padded with empty cells.
 * Cells past that width are dropped. The delimiter row is not
 * a row here. A `\|` that the table parser kept so the pipe
 * would not split the row is written as `|`. Other backslashes
 * and inline markers stay. A cell that contains a tab, a
 * newline, or a double quote is wrapped in quotes, and each
 * quote inside it is doubled. No trailing newline.
 */
export function tableCellsClipboardText(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const width = header.length;
  if (width === 0) return "";
  const fit = (cells: readonly string[]) => {
    const next = cells.slice(0, width);
    while (next.length < width) next.push("");
    return next;
  };
  const lines = [fit(header), ...rows.map(fit)];
  return lines
    .map((row) => row.map((cell) => tsvCell(literalPipes(cell))).join("\t"))
    .join("\n");
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function tableCellsCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

function literalPipes(cell: string): string {
  let out = "";
  for (let i = 0; i < cell.length; i += 1) {
    const ch = cell[i] ?? "";
    if (ch === "\\" && (cell[i + 1] ?? "") === "|") {
      out += "|";
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function tsvCell(cell: string): string {
  if (/[\t\n\r"]/.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}
