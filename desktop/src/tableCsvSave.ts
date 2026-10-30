// SPDX-License-Identifier: Apache-2.0

/**
 * v2.26: Save on a completed assistant table.
 * The control writes the painted grid as table.csv, then reads Saved
 * for 1.5s. Desktop downloads the file. iOS hands the same bytes to
 * the system share sheet and does not ask for photo-library permission.
 * The delimiter row is not included. Copy still copies the markdown
 * source. Cells still copies tab-separated text. Hidden while streaming
 * and on user bubbles. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/TableCsvSave.swift`.
 */

export const TABLE_CSV_SAVE_LABEL = "Save";

export const TABLE_CSV_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const TABLE_CSV_SAVE_ARIA = "Save table";

export const TABLE_CSV_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.24 table Cells. */
export const TABLE_CSV_SAVE_MS = 1500;

export const TABLE_CSV_FILENAME = "table.csv";

export const TABLE_CSV_MIME = "text/csv;charset=utf-8";

/** Same gate as table Copy and Cells: a finished assistant table only. */
export function showTableCsvSave(completed: boolean): boolean {
  return completed;
}

export function tableCsvSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? TABLE_CSV_SAVED_LABEL : TABLE_CSV_SAVE_LABEL;
}

export function tableCsvSaveAriaLabel(saved: boolean): string {
  return saved ? TABLE_CSV_SAVED_ARIA : TABLE_CSV_SAVE_ARIA;
}

/** Saving does not remove the table, send, or change Copy or Cells. */
export function tableCsvSaveKeepsTable(): boolean {
  return true;
}

/**
 * Header and body as CSV. Width is the header. A short row is padded
 * with empty cells. Cells past that width are dropped. The delimiter
 * row is not a row here. A `\|` that the table parser kept so the pipe
 * would not split the row is written as `|`. Other backslashes and
 * inline markers stay. A cell that contains a comma, a double quote,
 * or a line break is wrapped in quotes, and each quote inside it is
 * doubled. A tab does not force quotes. The file ends with a line feed.
 * An empty header writes nothing.
 */
export function tableCsvText(
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
  const body = lines
    .map((row) => row.map((cell) => csvCell(literalPipes(cell))).join(","))
    .join("\n");
  return `${body}\n`;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function tableCsvSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the CSV to the browser as a download. The table stays up. */
export function downloadTableCsv(csv: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: TABLE_CSV_MIME });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
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

function csvCell(cell: string): string {
  if (/[",\n\r]/.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}
