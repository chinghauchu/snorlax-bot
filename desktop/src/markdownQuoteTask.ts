// SPDX-License-Identifier: Apache-2.0

/**
 * v1.32: GFM blockquotes and task lists on completed assistant
 * LEFT `kind=message`. A quote line (`>` / nested `>>`) renders
 * with a muted left rule and indent. `- [ ]` / `- [x]` render as
 * read-only checkbox glyphs; checked items are muted.
 * v1.47: CommonMark lazy continuation of a blockquote. A non-blank
 * line that continues an open quote paragraph, and does not
 * itself start a list, an ATX heading, a fence, a thematic
 * break, or a `$$` block, stays inside that quote. A blank line
 * ends it. Nested quotes keep the continuation. A margin list,
 * heading, fence, or rule ends the quote.
 * v1.58: a CommonMark HTML block of types 1–6 ends the quote
 * before the tag line. A type 7 tag such as `<br>` stays in the
 * quote and ends further lazy lines.
 * v1.49: a task item keeps the lines indented to its text.
 * The text column is the column after the bullet, so two spaces
 * under `- [ ]` stay in the item and a nested task renders
 * inside it. A margin line ends the item. Streaming stays the
 * markdown string, so the bubble renders as it does today.
 * Copy controls keep the message markdown source — this module
 * only splits text for display and does not copy.
 * No animation. No new HTTP.
 * v1.51: a task list is loose when a blank line separates its items
 * or two blocks of an item, and tight otherwise. Nested task lists
 * keep their own looseness.
 * v1.59: an ordered list (`1.` / `1)`) is not a bullet task list.
 * Its lines, including a nested `- [ ]`, stay in the markdown so
 * the ordered item can show its own checkbox. `- [ ]` / `* [x]`
 * at the margin still extract here.
 * v1.73: a blockquote keeps cmark-gfm tab stops. The optional
 * column after `>` can eat part of a tab. The leftover columns
 * decide indented code, so `>\t\tfoo` is code whose text is two
 * spaces then `foo`. A tab that crosses the code indent becomes
 * the leftover spaces, and a later tab stays a tab. A line that
 * continues an open paragraph is not code. A fence stays a fence.
 * v1.89: a tab partly consumed by `>` is one byte of fence indent.
 * The leftover columns stay spaces in the code. A space-only
 * fence is unchanged.
 * Streaming stays plain text.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownQuoteTask.swift`.
 */

import { tabFenceCloses, tabFenceCodeLine, tabFenceOpen } from "./markdownFenceIndent.ts";
import {
  LAZY_CONTINUATION_MARK,
  htmlBlockStarts,
  htmlLazyTag,
  listItemIndentedCode,
  listMarkerPadding,
  orderedListEnd,
} from "./markdownList.ts";
import { quoteLineInTable } from "./markdownTable.ts";
import { listIsLoose } from "./markdownLooseList.ts";

/** Empty ballot box. Not a control. */
export const TASK_UNCHECKED_GLYPH = "☐";

/** Ballot box with check. Not a control. */
export const TASK_CHECKED_GLYPH = "☑";

export const TASK_UNCHECKED_LABEL = "Unchecked";

export const TASK_CHECKED_LABEL = "Checked";

export type TaskItem = {
  checked: boolean;
  /** Text after the marker. Markers themselves are not included. */
  text: string;
};

export type QuoteTaskBlock =
  | { type: "markdown"; text: string }
  | { type: "quote"; text: string }
  | { type: "tasks"; items: TaskItem[]; loose: boolean };

/** Never animate, including when Reduce Motion is off. */
export function quoteTaskAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export function taskGlyph(checked: boolean): string {
  return checked ? TASK_CHECKED_GLYPH : TASK_UNCHECKED_GLYPH;
}

export function taskGlyphLabel(checked: boolean): string {
  return checked ? TASK_CHECKED_LABEL : TASK_UNCHECKED_LABEL;
}

/**
 * Pull top-level quotes and task lists out of completed markdown.
 * Fences and `$$` blocks stay markdown. `completed: false` returns
 * the text unchanged.
 */
export function splitQuoteAndTasks(
  text: string,
  completed = true,
): QuoteTaskBlock[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!completed) return [{ type: "markdown", text: src }];

  const lines = src.split("\n");
  const blocks: QuoteTaskBlock[] = [];
  let mdStart = 0;
  let i = 0;
  let fence: string | null = null;
  let inMath = false;

  const pushMarkdown = (end: number) => {
    if (end <= mdStart) return;
    const chunk = lines.slice(mdStart, end).join("\n");
    if (chunk.trim()) blocks.push({ type: "markdown", text: chunk });
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
    if (stripQuoteMarker(line) != null) {
      const start = i;
      const inner: string[] = [];
      let open = false;
      let carry: QuoteCarry = emptyCarry();
      while (i < lines.length) {
        const current = lines[i] ?? "";
        const rendered = renderQuoteLine(current, carry, open);
        if (rendered != null) {
          inner.push(rendered.text);
          carry = rendered.carry;
          // v1.86: a table is not a paragraph. A later line with no
          // `>` does not continue the quote once a row is in a table.
          if (carry.fence) open = false;
          else if (quoteLineInTable(inner, inner.length - 1)) open = false;
          else open = paragraphOpenAfter(rendered.text, open);
          i += 1;
          continue;
        }
        // v1.47: a paragraph inside the quote may continue without `>`.
        if (!open || endsLazyQuote(current, open)) break;
        inner.push(
          current.includes("|") ? LAZY_CONTINUATION_MARK + current : current,
        );
        open = !htmlLazyTag(current);
        i += 1;
      }
      pushMarkdown(start);
      blocks.push({ type: "quote", text: inner.join("\n") });
      mdStart = i;
      continue;
    }
    // v1.59: keep ordered lists intact, including a nested task.
    const orderedEnd = orderedListEnd(lines, i);
    if (orderedEnd != null && orderedEnd > i) {
      i = orderedEnd;
      continue;
    }
    const task = parseTaskMarker(line);
    if (task && task.column <= 3) {
      const start = i;
      const items: TaskItem[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (isBlank(current)) {
          const next = nextNonBlank(lines, i + 1);
          const sibling = next >= 0 ? parseTaskMarker(lines[next] ?? "") : null;
          if (sibling && sibling.column <= 3) {
            i = next;
            continue;
          }
          break;
        }
        const next = parseTaskMarker(current);
        if (!next || next.column > 3) break;
        const item = readTaskItem(lines, i, next);
        items.push(item.task);
        i = item.next;
      }
      pushMarkdown(start);
      blocks.push({
        type: "tasks",
        items,
        loose: listIsLoose(lines.slice(start, i).join("\n")),
      });
      mdStart = i;
      continue;
    }
    i += 1;
  }
  pushMarkdown(lines.length);
  if (blocks.length === 0) return [{ type: "markdown", text: src }];
  return blocks;
}

/**
 * One CommonMark quote marker, or null when the line is not a quote.
 * A tab keeps its stop: the optional column after `>` can consume
 * part of it, and indented code is stored as four spaces plus the
 * text cmark-gfm would keep.
 */
export function stripQuoteMarker(line: string): string | null {
  if (!line.includes("\t")) return stripQuoteMarkerSpaces(line);
  const contentCol = quoteContentColumn(line);
  if (contentCol == null) return null;
  return canonicalBody(line, contentCol);
}

/** Space-only quote marker. Tabs use `stripQuoteMarker`. */
function stripQuoteMarkerSpaces(line: string): string | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  if (line[i] !== ">") return null;
  i += 1;
  if (line[i] === " ") i += 1;
  return line.slice(i);
}

type QuoteFence = {
  marker: string;
  indent: number;
  /** v1.89: body lines are already the cmark-gfm code text. */
  literal?: boolean;
  offset?: number;
};

type QuoteList = {
  absolute: number;
  relative: number;
  /** The item already has text. An empty item ends on a blank line. */
  filled: boolean;
};

type QuoteCarry = {
  fence: QuoteFence | null;
  math: boolean;
  list: QuoteList | null;
  /** State of a quote nested inside this one. One level per link. */
  nested: QuoteCarry | null;
  /** Whether the paragraph before this line is still open. */
  paragraph: boolean;
};

function emptyCarry(): QuoteCarry {
  return { fence: null, math: false, list: null, nested: null, paragraph: false };
}

/**
 * Quote line ready for a column-0 reparse, or null when `line`
 * is not a quote. Fence, math, list, and nested-quote state cross
 * lines so a tab inside them is not rewritten as a top-level
 * indented code block.
 */
function renderQuoteLine(
  line: string,
  carry: QuoteCarry,
  paragraphOpen: boolean,
): { text: string; carry: QuoteCarry } | null {
  const contentCol = quoteContentColumn(line);
  if (contentCol == null) return null;
  return renderAt(line, contentCol, carry, paragraphOpen);
}

function renderAt(
  line: string,
  contentCol: number,
  carry: QuoteCarry,
  paragraphOpen: boolean,
): { text: string; carry: QuoteCarry } {
  const plain = quotePlain(line, contentCol);
  if (carry.fence) {
    if (carry.fence.literal) {
      const closed = tabFenceCloses(line, contentCol, carry.fence.marker, true);
      const text = closed
        ? carry.fence.marker
        : tabFenceCodeLine(line, contentCol, carry.fence.offset ?? 0, true);
      return {
        text,
        carry: { ...emptyCarry(), fence: closed ? null : carry.fence },
      };
    }
    const text = fenceBody(line, contentCol, carry.fence.indent);
    const closed = fenceCloses(line, contentCol, carry.fence.marker);
    return {
      text,
      carry: { ...emptyCarry(), fence: closed ? null : carry.fence },
    };
  }
  if (carry.math) {
    const text = materialize(line, contentCol);
    return {
      text,
      carry: { ...emptyCarry(), math: text.trim() !== "$$", list: carry.list },
    };
  }
  // A list item owns a later tabbed fence. Measured from the quote
  // column, the same tab is one byte too many and the code gains a
  // space. The list pass measures it from the item's content column.
  const tabbed =
    !carry.list && line.includes("\t") ? tabFenceOpen(line, contentCol, true) : null;
  if (tabbed) {
    return {
      text: `${tabbed.marker}${tabbed.info}`,
      carry: {
        ...emptyCarry(),
        fence: { marker: tabbed.marker, indent: 0, literal: true, offset: tabbed.offset },
      },
    };
  }
  const opened = openingQuoteFence(line, contentCol);
  if (opened) {
    const text = line.includes("\t")
      ? fenceBody(line, contentCol, opened.indent)
      : plain;
    return { text, carry: { ...emptyCarry(), fence: opened } };
  }
  const at = firstContent(line, contentCol);
  if (at && line[at.index] === ">" && at.col - contentCol <= 3) {
    const innerCol = nestedContentColumn(line, at.index, at.col);
    const nested = carry.nested ?? emptyCarry();
    const inner = renderAt(line, innerCol, nested, nested.paragraph);
    const paragraph = inner.carry.fence
      ? false
      : paragraphOpenAfter(inner.text, nested.paragraph);
    const indent = at.col - contentCol;
    const keepList =
      carry.list != null && (paragraphOpen || indent >= carry.list.relative);
    const next: QuoteCarry = {
      ...emptyCarry(),
      list: keepList && carry.list ? { ...carry.list, filled: true } : null,
      nested: { ...inner.carry, paragraph },
    };
    // A line with no tab keeps the old one-level strip (`>> foo`, not
    // `> > foo`). The nested state is still recorded for a later tab.
    if (!line.includes("\t")) return { text: plain, carry: next };
    return { text: `${" ".repeat(indent)}> ${inner.text}`, carry: next };
  }
  const marker = listMarkerInfo(line, contentCol);
  const starts = marker != null && (!paragraphOpen || marker.interrupts);
  const openList = !starts ? carry.list : null;
  let list: QuoteList | null = null;
  let text: string;
  if (starts && marker) {
    text = line.includes("\t") ? marker.text : plain;
    list = {
      absolute: marker.absolute,
      relative: marker.relative,
      filled: marker.filled,
    };
  } else if (openList && at == null) {
    // Blank lines stay in a filled item. An empty item ends, so the
    // next line belongs to the quote rather than the item.
    text = line.includes("\t") ? "" : plain;
    list = openList.filled ? openList : null;
  } else if (
    openList &&
    (paragraphOpen || (at != null && at.col - contentCol >= openList.relative))
  ) {
    const code = !paragraphOpen && line.includes("\t")
      ? listItemIndentedCode(line, contentCol + openList.relative)
      : null;
    if (!line.includes("\t")) {
      text = plain;
    } else if (code != null) {
      // Spaces, not a shifted tab: the code text already has cmark's tabs.
      text = `${" ".repeat(openList.relative)}    ${code}`;
    } else {
      text = materialize(line, contentCol);
    }
    list = { ...openList, filled: true };
  } else {
    text = line.includes("\t") ? canonicalBody(line, contentCol) : plain;
    list = null;
  }
  return {
    text,
    carry: { ...emptyCarry(), math: text.trim() === "$$", list },
  };
}

/** Quote content when the line has no tab. `contentCol` is the index. */
function quotePlain(line: string, contentCol: number): string {
  return line.slice(contentCol);
}

/** Column where quote content starts, or null when `line` is not a quote. */
function quoteContentColumn(line: string): number | null {
  let col = 0;
  let index = 0;
  while (index < line.length && line[index] === " ") {
    col += 1;
    index += 1;
    if (col > 3) return null;
  }
  if (index >= line.length || line[index] !== ">" || col > 3) return null;
  index += 1;
  col += 1;
  if (index >= line.length) return col;
  const ch = line[index];
  if (ch === " " || ch === "\t") return col + 1;
  return col;
}

/**
 * Quote content, parsed from column 0 the way cmark-gfm parses
 * it in place. Indented code is four spaces plus the kept text.
 * A nested marker stays a quote. A list marker keeps its column.
 */
function canonicalBody(line: string, contentCol: number): string {
  if (firstContent(line, contentCol) == null) return "";
  const code = listItemIndentedCode(line, contentCol);
  if (code != null) return `    ${code}`;
  const at = firstContent(line, contentCol);
  if (at && line[at.index] === ">" && at.col - contentCol <= 3) {
    const innerCol = nestedContentColumn(line, at.index, at.col);
    const inner = canonicalBody(line, innerCol);
    return `${" ".repeat(at.col - contentCol)}> ${inner}`;
  }
  const list = canonicalList(line, contentCol);
  if (list != null) return list;
  return materialize(line, contentCol);
}

function nestedContentColumn(line: string, index: number, col: number): number {
  let i = index + 1;
  let c = col + 1;
  if (i >= line.length) return c;
  if (line[i] === " " || line[i] === "\t") return c + 1;
  return c;
}

/** First non-space at or after `contentCol`, in original columns. */
function firstContent(
  line: string,
  contentCol: number,
): { col: number; index: number } | null {
  let col = 0;
  let index = 0;
  while (index < line.length) {
    const ch = line[index] ?? "";
    if (ch === " ") {
      col += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      col += 4 - (col % 4);
      index += 1;
      continue;
    }
    if (col < contentCol) {
      col += 1;
      index += 1;
      continue;
    }
    return { col, index };
  }
  return null;
}

function isThematicContent(line: string, index: number): boolean {
  const mark = line[index];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (let i = index; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === mark) {
      count += 1;
      continue;
    }
    if (ch === " " || ch === "\t") continue;
    return false;
  }
  return count >= 3;
}

type QuoteMarker = {
  text: string;
  absolute: number;
  relative: number;
  interrupts: boolean;
  filled: boolean;
};

/**
 * A list marker in the quote's first three columns, rewritten so
 * a column-0 parser keeps the same code text. Null when the line
 * is not a list marker.
 */
function listMarkerInfo(line: string, contentCol: number): QuoteMarker | null {
  const at = firstContent(line, contentCol);
  if (!at) return null;
  const indent = at.col - contentCol;
  if (indent > 3) return null;
  if (isThematicContent(line, at.index)) return null;
  let i = at.index;
  let token = "";
  const bullet = line[i] ?? "";
  if (bullet === "-" || bullet === "*" || bullet === "+") {
    token = bullet;
    i += 1;
  } else {
    const match = /^(\d{1,9})([.)])/.exec(line.slice(i));
    if (!match) return null;
    token = match[0] ?? "";
    i += token.length;
  }
  if (i < line.length && line[i] !== " " && line[i] !== "\t") return null;
  const markerEnd = at.col + token.length;
  const padded = listMarkerPadding(line, i, markerEnd);
  const code = listItemIndentedCode(line, padded.contentColumn);
  const lead = " ".repeat(indent);
  const text = code != null
    ? `${lead}${token}     ${code}`
    : `${lead}${token}${" ".repeat(Math.max(0, padded.contentColumn - markerEnd))}${padded.text}`;
  const ordered = /^(\d+)[.)]$/.exec(token);
  const filled = code != null || padded.text !== "";
  const interrupts = filled && (!ordered || ordered[1] === "1");
  return {
    text,
    absolute: padded.contentColumn,
    relative: padded.contentColumn - contentCol,
    interrupts,
    filled,
  };
}

function canonicalList(line: string, contentCol: number): string | null {
  return listMarkerInfo(line, contentCol)?.text ?? null;
}

/** Leading tabs become spaces. A tab after the first glyph stays a tab. */
function materialize(line: string, contentCol: number): string {
  let col = 0;
  let index = 0;
  while (index < line.length && col < contentCol) {
    const ch = line[index] ?? "";
    if (ch === " ") {
      col += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      const next = col + (4 - (col % 4));
      if (next > contentCol) {
        return `${" ".repeat(next - contentCol)}${expandLeading(line.slice(index + 1), next)}`;
      }
      col = next;
      index += 1;
      continue;
    }
    col += 1;
    index += 1;
  }
  return expandLeading(line.slice(index), col);
}

function expandLeading(text: string, col: number): string {
  let i = 0;
  let c = col;
  let lead = "";
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch === " ") {
      lead += " ";
      c += 1;
      i += 1;
      continue;
    }
    if (ch === "\t") {
      const next = c + (4 - (c % 4));
      lead += " ".repeat(next - c);
      c = next;
      i += 1;
      continue;
    }
    break;
  }
  return lead + text.slice(i);
}

function openingQuoteFence(
  line: string,
  contentCol: number,
): QuoteFence | null {
  const at = firstContent(line, contentCol);
  if (!at) return null;
  const indent = at.col - contentCol;
  if (indent > 3) return null;
  const ch = line[at.index] ?? "";
  if (ch !== "`" && ch !== "~") return null;
  let n = 0;
  let i = at.index;
  while (i < line.length && line[i] === ch) {
    n += 1;
    i += 1;
  }
  if (n < 3) return null;
  const info = line.slice(i);
  if (ch === "`" && info.includes("`")) return null;
  return { marker: ch.repeat(n), indent };
}

function fenceCloses(line: string, contentCol: number, marker: string): boolean {
  const at = firstContent(line, contentCol);
  if (!at) return false;
  if (at.col - contentCol > 3) return false;
  const ch = marker[0] ?? "";
  if (line[at.index] !== ch) return false;
  let n = 0;
  let i = at.index;
  while (i < line.length && line[i] === ch) {
    n += 1;
    i += 1;
  }
  if (n < marker.length) return false;
  return line.slice(i).trim() === "";
}

/** Drop `columns` of quote-content indent. A crossing tab leaves spaces. */
function dedentContent(line: string, contentCol: number, columns: number): string {
  const limit = contentCol + columns;
  let col = 0;
  let index = 0;
  while (index < line.length && col < limit) {
    const ch = line[index] ?? "";
    if (ch === " ") {
      col += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      const next = col + (4 - (col % 4));
      if (next > limit) return `${" ".repeat(next - limit)}${line.slice(index + 1)}`;
      col = next;
      index += 1;
      continue;
    }
    if (col < contentCol) {
      col += 1;
      index += 1;
      continue;
    }
    return line.slice(index);
  }
  return line.slice(index);
}

function fenceBody(line: string, contentCol: number, indent: number): string {
  return `${" ".repeat(indent)}${dedentContent(line, contentCol, indent)}`;
}

/**
 * A GFM task item: 0–3 spaces, `-`/`*`/`+`, whitespace, then
 * `[ ]`, `[x]`, or `[X]`, then whitespace or the end of the line.
 * `- [x]done` (no space after the marker) stays ordinary text.
 */
export function parseTaskLine(line: string): TaskItem | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const marker = line[i];
  if (marker !== "-" && marker !== "*" && marker !== "+") return null;
  i += 1;
  if (line[i] !== " " && line[i] !== "\t") return null;
  while (line[i] === " " || line[i] === "\t") i += 1;
  if (line[i] !== "[") return null;
  i += 1;
  const mark = line[i];
  if (mark !== " " && mark !== "x" && mark !== "X") return null;
  i += 1;
  if (line[i] !== "]") return null;
  i += 1;
  if (i >= line.length) return { checked: mark !== " ", text: "" };
  if (line[i] !== " " && line[i] !== "\t") return null;
  while (line[i] === " " || line[i] === "\t") i += 1;
  return { checked: mark !== " ", text: line.slice(i) };
}

type TaskMarker = {
  checked: boolean;
  text: string;
  /** Columns before the bullet. A margin task is 0–3. */
  column: number;
  /** Column where the item text begins, immediately after `- `. */
  contentColumn: number;
};

/**
 * A margin or nested task marker. The content column is the
 * CommonMark list column after the bullet, not the column after
 * the checkbox, so `  more` continues `- [ ] item`.
 */
function parseTaskMarker(line: string): TaskMarker | null {
  const task = parseTaskLine(line);
  if (!task) return null;
  const lead = leadingColumns(line);
  if (lead.columns > 3) return null;
  const contentColumn = bulletContentColumn(line, lead);
  if (contentColumn <= lead.columns) return null;
  return {
    checked: task.checked,
    text: task.text,
    column: lead.columns,
    contentColumn,
  };
}

/** Column of the first character of the list item's text. */
function bulletContentColumn(
  line: string,
  lead: { columns: number; index: number },
): number {
  const afterMarker = lead.columns + 1;
  const sepIndex = lead.index + 1;
  if (sepIndex >= line.length) return afterMarker + 1;
  const sep = line[sepIndex];
  if (sep === " ") return afterMarker + 1;
  if (sep === "\t") return afterMarker + (4 - (afterMarker % 4));
  return afterMarker + 1;
}

/**
 * One task item plus every following line that belongs to it.
 * Indented lines, including a nested task, stay in `text` and are
 * dedented so the item body parses again. A margin line, including
 * the next task, is left for the caller.
 */
function readTaskItem(
  lines: string[],
  start: number,
  marker: TaskMarker,
): { task: TaskItem; next: number } {
  const body: string[] = [marker.text];
  let i = start + 1;
  let fence: string | null = null;
  let inMath = false;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (fence) {
      body.push(dedentLine(line, marker.contentColumn));
      const opened = fenceMark(line);
      if (
        opened &&
        opened.marker[0] === fence[0] &&
        opened.marker.length >= fence.length &&
        opened.info.trim() === ""
      ) {
        fence = null;
      }
      i += 1;
      continue;
    }
    if (inMath) {
      body.push(dedentLine(line, marker.contentColumn));
      if (line.trim() === "$$") inMath = false;
      i += 1;
      continue;
    }
    if (isBlank(line)) {
      const next = nextNonBlank(lines, i + 1);
      if (next < 0) break;
      const upcoming = lines[next] ?? "";
      if (leadingColumns(upcoming).columns >= marker.contentColumn) {
        body.push("");
        i += 1;
        continue;
      }
      break;
    }
    if (leadingColumns(line).columns < marker.contentColumn) break;
    const opened = fenceMark(line);
    if (opened) {
      fence = opened.marker;
      body.push(dedentLine(line, marker.contentColumn));
      i += 1;
      continue;
    }
    if (line.trim() === "$$") {
      inMath = true;
      body.push(dedentLine(line, marker.contentColumn));
      i += 1;
      continue;
    }
    body.push(dedentLine(line, marker.contentColumn));
    i += 1;
  }
  return {
    task: { checked: marker.checked, text: trimEdgeNewlines(body.join("\n")) },
    next: i,
  };
}

function fenceMark(line: string): { marker: string; info: string } | null {
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  const match = /^(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!match) return null;
  return { marker: match[1] ?? "", info: match[2] ?? "" };
}

function dedentLine(line: string, columns: number): string {
  let col = 0;
  let index = 0;
  while (index < line.length && col < columns) {
    const ch = line[index];
    if (ch === " ") {
      col += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      const next = col + (4 - (col % 4));
      index += 1;
      if (next > columns) return `${" ".repeat(next - columns)}${line.slice(index)}`;
      col = next;
      continue;
    }
    break;
  }
  return line.slice(index);
}

function trimEdgeNewlines(text: string): string {
  return text.replace(/^\n+|\n+$/g, "");
}

function nextNonBlank(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i += 1) {
    if (!isBlank(lines[i] ?? "")) return i;
  }
  return -1;
}

/**
 * A quote paragraph stays open after this stripped quote line.
 * Nested `>` markers peel first, so `> > foo` is still open and
 * `> # Foo` is not. An empty list item does not open a paragraph.
 */
function paragraphOpenAfter(stripped: string, wasOpen: boolean): boolean {
  const content = innermostQuote(stripped);
  if (isBlank(content) || isMathFence(content)) return false;
  if (isThematicBreak(content) || isAtxHeading(content) || isFenceLine(content)) {
    return false;
  }
  if (isMarginListMarker(content)) return listItemOpensParagraph(content);
  if (!wasOpen && isIndentedCodeLine(content)) return false;
  return true;
}

/** Peel one quote marker at a time until the line is not a quote. */
function innermostQuote(line: string): string {
  let current = line;
  for (;;) {
    const next = stripQuoteMarker(current);
    if (next == null) return current;
    current = next;
  }
}

/**
 * This line closes the quote instead of joining it. A blank line,
 * a `$$` block, a thematic break, an ATX heading, a fence, a
 * list marker in the first three columns, or an HTML block of
 * types 1–7 does. Indented code does only when no paragraph is
 * open. v1.87: a type 7 tag such as `<br>` ends the quote. The
 * tag line and the lines the block owns stay outside it.
 */
function endsLazyQuote(line: string, paragraphOpen: boolean): boolean {
  if (isBlank(line) || isMathFence(line)) return true;
  if (
    isThematicBreak(line) ||
    isAtxHeading(line) ||
    isFenceLine(line) ||
    isMarginListMarker(line) ||
    htmlBlockStarts(line)
  ) {
    return true;
  }
  if (!paragraphOpen && isIndentedCodeLine(line)) return true;
  return false;
}

function isBlank(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function isMathFence(line: string): boolean {
  return line.trim() === "$$";
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

function isThematicBreak(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const mark = line[lead.index];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (let i = lead.index; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === mark) {
      count += 1;
      continue;
    }
    if (ch === " " || ch === "\t") continue;
    return false;
  }
  return count >= 3;
}

function isAtxHeading(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  let i = lead.index;
  let hashes = 0;
  while (i < line.length && line[i] === "#" && hashes < 7) {
    hashes += 1;
    i += 1;
  }
  if (hashes < 1 || hashes > 6) return false;
  if (i >= line.length) return true;
  return line[i] === " " || line[i] === "\t";
}

function isFenceLine(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const mark = line[lead.index];
  if (mark !== "`" && mark !== "~") return false;
  let count = 0;
  let i = lead.index;
  while (i < line.length && line[i] === mark) {
    count += 1;
    i += 1;
  }
  return count >= 3;
}

function isIndentedCodeLine(line: string): boolean {
  if (isBlank(line)) return false;
  return leadingColumns(line).columns >= 4;
}

/** A bullet or ordered marker in the first three columns. */
function isMarginListMarker(line: string): boolean {
  return listMarkerLength(line) > 0;
}

function listItemOpensParagraph(line: string): boolean {
  const marker = listMarkerLength(line);
  if (marker <= 0) return false;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index + marker);
  let i = 0;
  while (i < rest.length && (rest[i] === " " || rest[i] === "\t")) i += 1;
  return rest.slice(i).length > 0;
}

function listMarkerLength(line: string): number {
  const lead = leadingColumns(line);
  if (lead.columns >= 4) return 0;
  const rest = line.slice(lead.index);
  const bullet = rest[0];
  if (bullet === "-" || bullet === "*" || bullet === "+") {
    if (rest.length === 1) return 1;
    const next = rest[1];
    return next === " " || next === "\t" ? 1 : 0;
  }
  const ordered = /^(\d{1,9})[.)]/.exec(rest);
  if (!ordered) return 0;
  const len = ordered[0].length;
  if (rest.length === len) return len;
  const next = rest[len];
  return next === " " || next === "\t" ? len : 0;
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
