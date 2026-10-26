// SPDX-License-Identifier: Apache-2.0

/**
 * v1.51: CommonMark loose and tight lists on a completed assistant
 * LEFT `kind=message`.
 *
 * A tight list (no blank line between its items, and no blank line
 * between an item's own blocks) renders with compact item spacing.
 * A loose list — a blank line between any of its items, or between
 * two blocks of an item — renders those items with paragraph spacing.
 * That is CommonMark's loose/tight rule. Bullet, ordered, and task
 * lists follow it. A nested list keeps its own looseness: a blank
 * inside the nested list does not loosen the parent, and a blank
 * between the parent's own blocks does not change the child.
 *
 * Fences, `$$`, and indented code swallow the blank lines inside
 * them, so those blanks do not loosen the list. v1.54 list
 * padding (one to four spaces, or a blank marker line) decides
 * which lines belong to the item before looseness is classified.
 * v1.63: that looseness also sets the gap in front of a nested
 * list. Tight is flush. Loose is the paragraph gap. Streaming
 * (`completed: false`) is tight, because the bubble is still plain
 * text. Copy controls keep markdown source — this module does not
 * copy. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownLooseList.swift`.
 */

import {
  htmlBlockStarts,
  lazyItemLine,
  listMarkerPadding,
  markdownListEnd,
} from "./markdownList.ts";

/** Compact gap between items of a tight list. iOS rows and task rows. */
export const TIGHT_LIST_ITEM_SPACING_PX = 4;

/**
 * Paragraph gap between items of a loose list. Matches the 8px
 * bottom margin on `.assistant-md p`.
 */
export const LOOSE_LIST_ITEM_SPACING_PX = 8;

/** Never animate, including when Reduce Motion is off. */
export function looseListAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Item gap in px. Tight stays compact. Loose uses paragraph spacing. */
export function listItemSpacing(loose: boolean): number {
  return loose ? LOOSE_LIST_ITEM_SPACING_PX : TIGHT_LIST_ITEM_SPACING_PX;
}

/**
 * v1.63: gap before a nested block inside one list item.
 * A tight list is flush — CommonMark does not wrap that
 * paragraph in `<p>`, so a nested list sits against the
 * text. A loose list uses the paragraph gap, including
 * when the blank line is between sibling items and this
 * item's own nested list has no blank of its own.
 * `null` is outside a list; blocks there keep 8px.
 * iOS draws this directly. Desktop regular lists get it
 * from the `<p>` margin; a loose task body uses the same
 * 8px as a column gap.
 */
export function listBlockSpacing(listLoose: boolean | null): number {
  if (listLoose === false) return 0;
  return LOOSE_LIST_ITEM_SPACING_PX;
}

/**
 * Whether the list that starts this text is loose.
 * `completed: false` is never loose. Text that does not start with
 * a margin list marker is never loose. Only the first list is
 * classified; a later list in the same string is ignored.
 */
export function listIsLoose(text: string, completed = true): boolean {
  if (!completed || !text) return false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  const firstLine = lines[0] ?? "";
  if (isThematicBreak(firstLine)) return false;
  const first = parseMarker(firstLine);
  if (!first || first.column > 3) return false;
  return readList(lines, first).loose;
}

type Marker = {
  column: number;
  ordered: boolean;
  delimiter: "." | ")" | "";
  contentColumn: number;
  text: string;
};

function readList(lines: string[], first: Marker): { loose: boolean; next: number } {
  let loose = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      const next = nextNonBlank(lines, i);
      if (next < 0) break;
      const sibling = parseMarker(lines[next] ?? "");
      if (sibling && sameList(sibling, first) && sibling.column <= 3) {
        // A blank line between items loosens the whole list.
        loose = true;
        i = next;
        continue;
      }
      break;
    }
    const marker = parseMarker(line);
    if (!marker || !sameList(marker, first) || marker.column > 3) break;
    const item = readItem(lines, i, marker, first);
    if (itemDirectlyLoose(item.text)) loose = true;
    i = item.next;
  }
  return { loose, next: i };
}

function readItem(
  lines: string[],
  start: number,
  marker: Marker,
  listMarker: Marker,
): { text: string; next: number } {
  const body: string[] = marker.text === "" ? [] : [marker.text];
  let i = start + 1;
  let fence: string | null = null;
  let inMath = false;
  let sawBlank = false;
  let sawContent = marker.text !== "";

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (fence) {
      body.push(dedent(line, marker.contentColumn));
      const opened = fenceOnLine(line);
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
      body.push(dedent(line, marker.contentColumn));
      if (line.trim() === "$$") inMath = false;
      i += 1;
      continue;
    }
    if (line.trim() === "") {
      if (!sawContent) break;
      const next = nextNonBlank(lines, i);
      if (next < 0) break;
      const upcoming = lines[next] ?? "";
      const sibling = parseMarker(upcoming);
      if (
        sibling &&
        sameList(sibling, listMarker) &&
        sibling.column <= 3 &&
        sibling.column < marker.contentColumn
      ) {
        break;
      }
      if (leadingColumns(upcoming).columns >= marker.contentColumn) {
        body.push("");
        sawBlank = true;
        i += 1;
        continue;
      }
      break;
    }
    const opened = fenceOnLine(line);
    if (opened) {
      const cols = leadingColumns(line).columns;
      if (cols >= marker.contentColumn) {
        fence = opened.marker;
        body.push(dedent(line, marker.contentColumn));
        sawContent = true;
        i += 1;
        continue;
      }
      if (cols <= 3) break;
    }
    if (line.trim() === "$$") {
      const cols = leadingColumns(line).columns;
      if (cols >= marker.contentColumn) {
        inMath = true;
        body.push(dedent(line, marker.contentColumn));
        sawContent = true;
        i += 1;
        continue;
      }
      if (cols <= 3) break;
    }
    const nested = parseMarker(line);
    if (nested && nested.column >= marker.contentColumn) {
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      i += 1;
      continue;
    }
    if (nested && nested.column <= 3 && nested.column < marker.contentColumn) break;
    if (leadingColumns(line).columns >= marker.contentColumn) {
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      i += 1;
      continue;
    }
    if (sawContent && !sawBlank && !interruptsList(line)) {
      body.push(lazyItemLine(line));
      i += 1;
      continue;
    }
    break;
  }
  return { text: trimEdgeNewlines(body.join("\n")), next: i };
}

/**
 * True when `text` (one item, already dedented) has a blank line
 * between two of its own blocks. A nested list, a fence, a `$$`
 * block, and an indented code block count as one block each, so
 * the blank lines inside them belong to the child.
 */
function itemDirectlyLoose(text: string): boolean {
  if (!text || !text.includes("\n")) return false;
  const lines = text.split("\n");
  let sawBlock = false;
  let pendingBlank = false;
  let loose = false;
  let fence: string | null = null;
  let inMath = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    if (gate.blocked) {
      // A blank before a fence or $$ block separates two blocks.
      // A blank already inside one does not.
      if (pendingBlank && sawBlock && !fence && !inMath) loose = true;
      fence = gate.fence;
      inMath = gate.inMath;
      sawBlock = true;
      pendingBlank = false;
      i += 1;
      continue;
    }
    fence = gate.fence;
    inMath = gate.inMath;
    if (line.trim() === "") {
      if (sawBlock) pendingBlank = true;
      i += 1;
      continue;
    }
    const nestedEnd = markdownListEnd(lines, i);
    if (nestedEnd != null && nestedEnd > i) {
      if (pendingBlank && sawBlock) loose = true;
      sawBlock = true;
      pendingBlank = false;
      i = nestedEnd;
      continue;
    }
    if (pendingBlank && indentedCodeStart(lines, i)) {
      if (sawBlock) loose = true;
      sawBlock = true;
      pendingBlank = false;
      i = consumeIndentedCode(lines, i);
      continue;
    }
    if (pendingBlank && sawBlock) loose = true;
    sawBlock = true;
    pendingBlank = false;
    i += 1;
  }
  return loose;
}

function indentedCodeStart(lines: string[], index: number): boolean {
  return leadingColumns(lines[index] ?? "").columns >= 4;
}

/** Include blank lines that stay inside the indented code run. */
function consumeIndentedCode(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      const next = nextNonBlank(lines, i);
      if (next < 0) break;
      if (leadingColumns(lines[next] ?? "").columns >= 4) {
        i = next;
        continue;
      }
      break;
    }
    if (leadingColumns(line).columns >= 4) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function sameList(marker: Marker, first: Marker): boolean {
  return marker.ordered === first.ordered && marker.delimiter === first.delimiter;
}

function parseMarker(line: string): Marker | null {
  if (isThematicBreak(line)) return null;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  let ordered = false;
  let delimiter: "." | ")" | "" = "";
  let token = "";
  const bullet = /^([-+*])/.exec(rest);
  const orderedMatch = /^(\d{1,9})([.)])/.exec(rest);
  if (bullet) {
    token = bullet[1] ?? "";
  } else if (orderedMatch) {
    ordered = true;
    token = `${orderedMatch[1] ?? ""}${orderedMatch[2] ?? ""}`;
    delimiter = orderedMatch[2] === ")" ? ")" : ".";
  } else {
    return null;
  }
  const after = lead.index + token.length;
  if (after < line.length) {
    const sep = line[after];
    if (sep !== " " && sep !== "\t") return null;
  }
  const padded = listMarkerPadding(line, after, lead.columns + token.length);
  return {
    column: lead.columns,
    ordered,
    delimiter,
    contentColumn: padded.contentColumn,
    text: padded.text,
  };
}

function interruptsList(line: string): boolean {
  if (leadingColumns(line).columns > 3) return false;
  if (isThematicBreak(line)) return true;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  if (/^#{1,6}(?:[ \t]|$)/.test(rest)) return true;
  if (rest.startsWith(">")) return true;
  if (fenceOnLine(line)) return true;
  if (rest.trim() === "$$") return true;
  if (htmlBlockStarts(line)) return true;
  return false;
}

function isThematicBreak(line: string): boolean {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const mark = line[i];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (let j = i; j < line.length; j += 1) {
    const c = line[j];
    if (c === mark) {
      count += 1;
      continue;
    }
    if (c === " " || c === "\t") continue;
    return false;
  }
  return count >= 3;
}

function fenceOnLine(line: string): { marker: string; info: string } | null {
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  const match = /^(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!match) return null;
  const marker = match[1] ?? "";
  const info = match[2] ?? "";
  if (marker[0] === "`" && info.includes("`")) return null;
  return { marker, info };
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

function dedent(line: string, columns: number): string {
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
      if (next > columns) {
        return `${" ".repeat(next - columns)}${line.slice(index)}`;
      }
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
    if ((lines[i] ?? "").trim() !== "") return i;
  }
  return -1;
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
