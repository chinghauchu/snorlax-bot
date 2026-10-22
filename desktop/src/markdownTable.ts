// SPDX-License-Identifier: Apache-2.0

/**
 * v1.31: GFM pipe tables on completed assistant LEFT `kind=message`.
 * A wide table scrolls inside its own container. Copy puts the
 * table's markdown source on the clipboard (header, delimiter, and
 * rows as written), then shows Copied for 1.5s. Streaming stays
 * plain text. No animation. No new HTTP.
 * v1.55: delimiter cells set column alignment (`:---` left,
 * `:---:` center, `---:` right). A `\|` inside an inline code span
 * becomes a literal pipe in that cell. The escape pass leaves code
 * spans unchanged, so the backslash has to come off here.
 * v1.64: a cell is inline markdown. A heading, list, quote, rule,
 * or fence at the start of the cell stays the characters. Bold,
 * italic, code, and links still parse. Intraword `_` stays literal.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownTable.swift`.
 */

import { fenceInfoAllowsOpen } from "./math.ts";

export const TABLE_COPY_LABEL = "Copy";

export const TABLE_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const TABLE_COPY_ARIA = "Copy table";

export const TABLE_COPIED_ARIA = "Copied";

/** Same confirmation window as v0.66 code-block Copy. */
export const TABLE_COPY_MS = 1500;

export type TableAlign = "left" | "center" | "right";

export type MarkdownTable = {
  /** Header, delimiter, and body lines, joined as written. */
  source: string;
  align: TableAlign[];
  header: string[];
  rows: string[][];
};

export type MarkdownTableSegment =
  | { type: "markdown"; text: string }
  | { type: "table"; table: MarkdownTable };

export function showTableCopy(completed: boolean): boolean {
  return completed;
}

export function tableCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? TABLE_COPIED_LABEL : TABLE_COPY_LABEL;
}

export function tableCopyAriaLabel(copied: boolean): string {
  return copied ? TABLE_COPIED_ARIA : TABLE_COPY_ARIA;
}

/**
 * Clipboard text is the table's markdown source, not a tab-separated
 * rewrite. Pasting it back into the composer round-trips, and the
 * other copy controls already copy source.
 */
export function tableClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function tableCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export function containsMarkdownTable(text: string): boolean {
  return splitMarkdownTables(text, true).some((part) => part.type === "table");
}

/**
 * Pull top-level GFM tables out of completed markdown. Fences and
 * `$$` blocks stay markdown. `completed: false` returns the text
 * unchanged so a streaming bubble is not a table.
 */
export function splitMarkdownTables(
  text: string,
  completed = true,
): MarkdownTableSegment[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!completed) return [{ type: "markdown", text: src }];

  const lines = src.split("\n");
  const segments: MarkdownTableSegment[] = [];
  let mdStart = 0;
  let i = 0;
  let fence: string | null = null;
  let inMath = false;

  const pushMarkdown = (end: number) => {
    if (end <= mdStart) return;
    const chunk = lines.slice(mdStart, end).join("\n");
    if (chunk.trim()) segments.push({ type: "markdown", text: chunk });
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      i += 1;
      continue;
    }
    const found = parseTable(lines, i);
    if (!found) {
      i += 1;
      continue;
    }
    pushMarkdown(i);
    segments.push({ type: "table", table: found.table });
    i = found.next;
    mdStart = i;
  }
  pushMarkdown(lines.length);
  if (segments.length === 0) return [{ type: "markdown", text: src }];
  return segments;
}

function blockGate(
  line: string,
  fence: string | null,
  inMath: boolean,
): { fence: string | null; inMath: boolean; blocked: boolean } {
  if (!inMath) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[2] ?? "";
      const info = match[3] ?? "";
      if (!fence) {
        if (marker[0] === "`" && info.includes("`")) {
          return { fence: null, inMath, blocked: false };
        }
        return { fence: marker, inMath, blocked: true };
      }
      const same =
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        info.trim() === "";
      return { fence: same ? null : fence, inMath, blocked: true };
    }
  }
  if (fence) return { fence, inMath, blocked: true };
  if (line.trim() === "$$") return { fence, inMath: !inMath, blocked: true };
  if (inMath) return { fence, inMath, blocked: true };
  return { fence, inMath, blocked: false };
}

function parseTable(
  lines: string[],
  start: number,
): { table: MarkdownTable; next: number } | null {
  if (start + 1 >= lines.length) return null;
  const headerLine = lines[start] ?? "";
  const delimLine = lines[start + 1] ?? "";
  if (!isTableLine(headerLine) || !isTableLine(delimLine)) return null;
  const header = splitRow(headerLine);
  const delim = splitRow(delimLine);
  if (!header || !delim) return null;
  const align = delimiterAlign(delim);
  if (!align || align.length !== header.length) return null;

  const body: string[][] = [];
  let next = start + 2;
  while (next < lines.length) {
    const line = lines[next] ?? "";
    if (!isTableLine(line)) break;
    const row = splitRow(line);
    if (!row) break;
    body.push(row);
    next += 1;
  }
  const shaped = rectangular(header, body, align);
  return {
    table: {
      source: lines.slice(start, next).join("\n"),
      align: shaped.align,
      header: shaped.header,
      rows: shaped.rows,
    },
    next,
  };
}

function isTableLine(line: string): boolean {
  if (/^ {4,}/.test(line)) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(">")) return false;
  if (/^([-*+]|\d+[.)])\s/.test(trimmed)) return false;
  return true;
}

/**
 * Cells split on unescaped pipes outside inline code. Outer pipes drop.
 * v1.55: `\|` inside a code span is stored as `|`. Outside a code
 * span the backslash stays so the escape pass can paint the pipe.
 */
export function splitRow(line: string): string[] | null {
  const indent = line.match(/^ */)?.[0].length ?? 0;
  if (indent >= 4) return null;
  const body = line.slice(indent);
  const cells: string[] = [];
  let current = "";
  let pipes = 0;
  let code = 0;
  for (let i = 0; i < body.length; ) {
    const ch = body[i] ?? "";
    if (code > 0) {
      if (ch === "`") {
        let n = 0;
        while (body[i + n] === "`") n += 1;
        current += "`".repeat(n);
        i += n;
        if (n === code) code = 0;
        continue;
      }
      // v1.55: `\|` inside a code span is a literal pipe. The escape
      // pass leaves code spans byte-for-byte, so the backslash has to
      // come off here or the chip shows `\|`.
      if (ch === "\\" && (body[i + 1] ?? "") === "|") {
        current += "|";
        i += 2;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      if (i + 1 < body.length) {
        // Keep the backslash. Only `\|` fails to split; the inline
        // escape pass turns `\*` into a literal asterisk.
        current += ch + (body[i + 1] ?? "");
        i += 2;
        continue;
      }
    }
    if (ch === "`") {
      let n = 0;
      while (body[i + n] === "`") n += 1;
      current += "`".repeat(n);
      i += n;
      code = n;
      continue;
    }
    if (ch === "|") {
      pipes += 1;
      cells.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  cells.push(current.trim());
  if (pipes === 0) return null;
  let start = 0;
  let end = cells.length;
  const trimmed = body.trim();
  if (trimmed.startsWith("|")) start = 1;
  if (endsWithUnescapedPipe(body)) end -= 1;
  if (end <= start) return null;
  return cells.slice(start, end);
}

function endsWithUnescapedPipe(line: string): boolean {
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith("|")) return false;
  let slashes = 0;
  for (let i = trimmed.length - 2; i >= 0 && trimmed[i] === "\\"; i -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 0;
}

function delimiterAlign(cells: string[]): TableAlign[] | null {
  if (cells.length === 0) return null;
  const align: TableAlign[] = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) align.push("center");
    else if (right) align.push("right");
    else align.push("left");
  }
  return align;
}

/**
 * v1.64: GFM parses a table cell as inlines. A block start is escaped
 * so the cell does not become a heading, list, quote, rule, or fence.
 * The escape pass paints the marker, so the backslash is not shown.
 * `**bold**`, `*italic*`, `` `code` ``, and `[links](url)` are not
 * block starts and stay formatted. `completed: false` returns `text`.
 */
export function protectTableCellBlocks(text: string, completed = true): string {
  if (!completed || !text) return text;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  let changed = false;
  const out = lines.map((line) => {
    const next = protectCellLine(line);
    if (next !== line) changed = true;
    return next;
  });
  if (!changed) return text.includes("\r") ? src : text;
  return out.join("\n");
}

/** Never animate, including when Reduce Motion is off. */
export function tableCellInlineAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

function protectCellLine(line: string): string {
  let indent = 0;
  while (indent < line.length && indent < 3 && line[indent] === " ") indent += 1;
  if (indent < line.length && line[indent] === " ") return line;
  const rest = line.slice(indent);
  if (!rest) return line;
  const fence = fenceOpener(rest);
  if (fence > 0) return escapeRun(line, indent, fence);
  if (isThematicCell(rest)) return escapeMarks(line, indent);
  if (/^#{1,6}(?:[ \t]|$)/.test(rest)) return insertBackslash(line, indent);
  if (rest.startsWith(">")) return insertBackslash(line, indent);
  if (/^[-*+](?:[ \t]|$)/.test(rest)) return insertBackslash(line, indent);
  const ordered = /^(\d{1,9})([.)])(?:[ \t]|$)/.exec(rest);
  if (ordered) return insertBackslash(line, indent + (ordered[1] ?? "").length);
  return line;
}

/** Length of a real opening fence marker, or 0 when the line is not one. */
function fenceOpener(rest: string): number {
  const match = /^(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!match) return 0;
  const marker = match[1] ?? "";
  if (!fenceInfoAllowsOpen(marker, match[2] ?? "")) return 0;
  return marker.length;
}

function isThematicCell(rest: string): boolean {
  const mark = rest[0];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (const ch of rest) {
    if (ch === mark) count += 1;
    else if (ch === " " || ch === "\t") continue;
    else return false;
  }
  return count >= 3;
}

function insertBackslash(line: string, index: number): string {
  return `${line.slice(0, index)}\\${line.slice(index)}`;
}

function escapeRun(line: string, start: number, count: number): string {
  let out = line.slice(0, start);
  for (let n = 0; n < count; n += 1) out += `\\${line[start + n] ?? ""}`;
  return out + line.slice(start + count);
}

function escapeMarks(line: string, indent: number): string {
  let out = line.slice(0, indent);
  for (const ch of line.slice(indent)) {
    if (ch === "-" || ch === "*" || ch === "_") out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

function rectangular(
  header: string[],
  rows: string[][],
  align: TableAlign[],
): { header: string[]; rows: string[][]; align: TableAlign[] } {
  let width = Math.max(header.length, align.length);
  for (const row of rows) width = Math.max(width, row.length);
  const pad = (cells: string[]) => {
    const next = cells.slice(0, width);
    while (next.length < width) next.push("");
    return next;
  };
  const nextAlign = align.slice(0, width);
  while (nextAlign.length < width) nextAlign.push("left");
  return { header: pad(header), rows: rows.map(pad), align: nextAlign };
}
