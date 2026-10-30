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
 * v1.65: a body row is clipped to the header width. Extra cells
 * are dropped. A short row is padded with empty cells. Alignment
 * stays the delimiter row. The clipboard source stays the original
 * lines.
 * v1.66: a body line with no unescaped pipe is one cell, then
 * padded to the header. A blank line ends the table. A heading,
 * rule, quote, list, fence, indented code, raw HTML block, or
 * `$$` line still ends it. A pipe-less header does not start a
 * table, so `foo` over `---` stays a setext heading.
 * v1.86: cmark-gfm table edges. An unescaped `|` inside a code
 * span splits the row. A footnote definition ends the table.
 * A lazy delimiter is not a table, and a lazy body line ends it.
 * A table inside a list stays in the list. A link reference
 * definition still stays in the cell.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownTable.swift`.
 */

import {
  LAZY_CONTINUATION_MARK,
  htmlBlockInterrupts,
  htmlLazyTag,
  markdownListEnd,
  setLazyLineEndsItem,
  splitMarkdownLists,
} from "./markdownList.ts";
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
 * v2.24 Cells (`tableCellsCopy.ts`) is the tab-separated grid.
 */
export function tableClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function tableCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export function containsMarkdownTable(text: string, seen?: Set<string>): boolean {
  if (!text || !text.includes("|")) return false;
  if (splitMarkdownTables(text, true).some((part) => part.type === "table")) return true;
  if (seen?.has(text)) return false;
  const next = seen ?? new Set<string>();
  next.add(text);
  return splitMarkdownLists(text, true).some(
    (block) =>
      block.type === "list" &&
      block.list.items.some((item) => containsMarkdownTable(item, next)),
  );
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

  const rawLines = src.split("\n");
  const peeled = rawLines.map(peelLazyContinuation);
  const lines = peeled.map((part) => part.text);
  const lazy = peeled.map((part) => part.lazy);
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
    // A table inside a list stays with the item. Hoisting it would
    // paint the table as a sibling of the list.
    const listEnd = markdownListEnd(lines, i);
    if (listEnd != null && listEnd > i) {
      i = listEnd;
      continue;
    }
    const found = parseTable(lines, i, lazy);
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
  if (segments.length === 0) return [{ type: "markdown", text: lines.join("\n") }];
  return segments;
}

function peelLazyContinuation(line: string): { text: string; lazy: boolean } {
  if (line.startsWith(LAZY_CONTINUATION_MARK)) {
    return { text: line.slice(LAZY_CONTINUATION_MARK.length), lazy: true };
  }
  return { text: line, lazy: false };
}

/**
 * True when `lines[index]` sits inside a table. Fences and `$$`
 * are not tables. A lazy delimiter does not open one. Quote and
 * list continuation use this so a lazy line after a table ends
 * the block instead of joining it.
 */
export function quoteLineInTable(lines: string[], index: number): boolean {
  if (index < 0 || index >= lines.length) return false;
  const peeled = lines.map(peelLazyContinuation);
  const texts = peeled.map((part) => part.text);
  const lazy = peeled.map((part) => part.lazy);
  let i = 0;
  let fence: string | null = null;
  let inMath = false;
  while (i < texts.length && i <= index) {
    const gate = blockGate(texts[i] ?? "", fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      i += 1;
      continue;
    }
    const found = parseTable(texts, i, lazy);
    if (found && found.next > i) {
      if (index >= i && index < found.next) return true;
      i = found.next;
      continue;
    }
    i += 1;
  }
  return false;
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
  lazy?: boolean[],
): { table: MarkdownTable; next: number } | null {
  if (start + 1 >= lines.length) return null;
  // A lazy continuation cannot open a table. The header may be lazy
  // when the delimiter itself is quoted or indented.
  if (lazy?.[start + 1]) return null;
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
    if (lazy?.[next]) break;
    const line = lines[next] ?? "";
    if (!isTableLine(line) || interruptsTable(line)) break;
    const row = splitRow(line, true);
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

/**
 * Index just after a table that starts at `start`, or `start`
 * when those lines are not a table. Reference links and footnotes
 * use this so a pipe-less body row is not stolen as a definition.
 */
export function markdownTableEnd(
  lines: string[],
  start: number,
  lazy?: boolean[],
): number {
  return parseTable(lines, start, lazy)?.next ?? start;
}

function isTableLine(line: string): boolean {
  if (leadingColumns(line).columns >= 4) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(">")) return false;
  // An empty item (`-`, `*`, `1.`) is still a list. Ordered markers
  // are at most nine digits, so `1234567890. item` is a cell.
  if (/^[-*+](?:[ \t]|$)/.test(trimmed)) return false;
  if (/^\d{1,9}[.)](?:[ \t]|$)/.test(trimmed)) return false;
  return true;
}

/**
 * Block starts end the table instead of becoming a one-cell row.
 * A pipe row such as `| # not a heading |` does not match these.
 */
function interruptsTable(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const rest = line.slice(lead.index);
  if (/^#{1,6}(?:[ \t]|$)/.test(rest)) return true;
  if (isThematicBreak(line)) return true;
  if (isFenceLine(line)) return true;
  if (rest.trim() === "$$") return true;
  if (htmlBlockInterrupts(line) || htmlLazyTag(line)) return true;
  if (isFootnoteDefinition(line)) return true;
  return false;
}

/**
 * v1.86: with the footnote extension, `[^1]: note` ends the table.
 * The definition is then a footnote. A link reference `[ref]: url`
 * is not a footnote and stays a cell.
 */
function isFootnoteDefinition(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const rest = line.slice(lead.index);
  return /^\[\^[A-Za-z0-9_-]+\]:[ \t]*/.test(rest);
}

function isThematicBreak(line: string): boolean {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const mark = line[i];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (let j = i; j < line.length; j += 1) {
    const ch = line[j];
    if (ch === mark) count += 1;
    else if (ch === " " || ch === "\t") continue;
    else return false;
  }
  return count >= 3;
}

function isFenceLine(line: string): boolean {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return false;
  return fenceInfoAllowsOpen(match[2] ?? "", match[3] ?? "");
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

/**
 * Cells split on unescaped pipes outside inline code. Outer pipes drop.
 * v1.55: `\|` inside a code span is stored as `|`. Outside a code
 * span the backslash stays so the escape pass can paint the pipe.
 */
/**
 * `pipeLess` is for a body row. A line with no unescaped pipe is
 * then one cell. Header and delimiter rows stay pipe-required, so
 * `foo` over `---` is still a setext heading.
 */
export function splitRow(line: string, pipeLess = false): string[] | null {
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
      // v1.86: cmark-gfm splits on `|` even inside a code span, and
      // the next cell does not stay inside that span.
      if (ch === "|") {
        pipes += 1;
        cells.push(current.trim());
        current = "";
        code = 0;
        i += 1;
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
  if (pipes === 0) {
    if (!pipeLess) return null;
    if (leadingColumns(line).columns >= 4) return null;
    const text = body.trim();
    if (!text) return null;
    return [text];
  }
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

/**
 * v1.65: column count is the header, which matches the delimiter.
 * A short body row gains empty cells. Cells past that width are
 * dropped, so a wider row does not grow a left-aligned column.
 * Alignment stays the delimiter row. The clipboard source is still
 * the original lines, extra cells included.
 */
function rectangular(
  header: string[],
  rows: string[][],
  align: TableAlign[],
): { header: string[]; rows: string[][]; align: TableAlign[] } {
  const width = header.length;
  const fit = (cells: string[]) => {
    const next = cells.slice(0, width);
    while (next.length < width) next.push("");
    return next;
  };
  const nextAlign = align.slice(0, width);
  while (nextAlign.length < width) nextAlign.push("left");
  return { header: fit(header), rows: rows.map(fit), align: nextAlign };
}

setLazyLineEndsItem((body) => quoteLineInTable(body, body.length - 1));
