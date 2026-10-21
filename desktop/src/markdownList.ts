// SPDX-License-Identifier: Apache-2.0

/**
 * v1.36: ordered-list start numbers and nested lists on a
 * completed assistant LEFT `kind=message`.
 *
 * Desktop react-markdown (CommonMark) already emits
 * `<ol start="N">` and nested `<ul>` / `<ol>`. iOS draws the
 * reply in a text view, which drops list markers and restarts
 * ordered lists at 1. This parser is what iOS renders, and it
 * follows the same CommonMark rules desktop already paints:
 * the first marker's number is the start, a later item in that
 * list counts up from there, a paragraph or fence ends the
 * list, and an indented `-` or `1.` under an item is a nested
 * list.
 *
 * v1.54: the column where item text starts follows CommonMark.
 * One to four spaces after the marker are padding, so `-   item`
 * continues at that wider column. Five or more spaces keep one
 * as the separator and the rest as content (often indented
 * code). A marker line with no text, such as `1.` then
 * `   text`, uses a padding of one. A second blank line before
 * any text ends the item. Streaming (`completed: false`)
 * returns the text unchanged. Copy controls keep markdown
 * source — this module does not copy. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownList.swift`.
 */

export type MarkdownListGroup = {
  ordered: boolean;
  /** First marker's number. Bullets use 1 and ignore it. */
  start: number;
  /** `.` or `)` for an ordered list. Bullets use "". */
  delimiter: "." | ")" | "";
  items: string[];
};

export type ListBlock =
  | { type: "markdown"; text: string }
  | { type: "list"; list: MarkdownListGroup };

type Marker = {
  column: number;
  ordered: boolean;
  delimiter: "." | ")" | "";
  number: number;
  contentColumn: number;
  text: string;
};

/** Never animate, including when Reduce Motion is off. */
export function listAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Visible marker. Ordered lists count up from `start`. */
export function listMarker(
  ordered: boolean,
  start: number,
  index: number,
  depth: number,
): string {
  if (ordered) return `${start + index}.`;
  if (depth <= 0) return "•";
  if (depth === 1) return "◦";
  return "▪";
}

/** Accessible name for the marker. Ordered lists speak the number. */
export function listMarkerLabel(
  ordered: boolean,
  start: number,
  index: number,
  depth: number,
): string {
  if (ordered) return listMarker(true, start, index, depth);
  return "Bullet";
}

/**
 * Pull lists out of completed markdown. Fences and `$$` stay
 * markdown. `completed: false` returns the text unchanged.
 * A list item's text is dedented so a nested list parses again
 * when that text is rendered.
 */
export function splitMarkdownLists(
  text: string,
  completed = true,
): ListBlock[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!completed) return [{ type: "markdown", text: src }];

  const lines = src.split("\n");
  const blocks: ListBlock[] = [];
  let mdStart = 0;
  let i = 0;
  let fence: string | null = null;
  let inMath = false;

  const pushMarkdown = (end: number) => {
    if (end <= mdStart) return;
    const chunk = trimEdgeNewlines(lines.slice(mdStart, end).join("\n"));
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
    const marker = parseMarker(line);
    if (marker && marker.column <= 3) {
      const found = readList(lines, i, marker);
      pushMarkdown(i);
      blocks.push({ type: "list", list: found.list });
      i = found.next;
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
 * Index just after a top-level list that starts at `start`.
 * Null when that line is not a list marker in the first three columns.
 * The span includes a loose continuation (`- item`, blank, indented
 * text) so a later pass does not treat list content as indented code.
 */
export function markdownListEnd(lines: string[], start: number): number | null {
  if (start < 0 || start >= lines.length) return null;
  const line = lines[start] ?? "";
  if (isThematicBreak(line)) return null;
  const marker = parseMarker(line);
  if (!marker || marker.column > 3) return null;
  return readList(lines, start, marker).next;
}

function readList(
  lines: string[],
  start: number,
  first: Marker,
): { list: MarkdownListGroup; next: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      const next = nextNonBlank(lines, i);
      if (next < 0) break;
      const sibling = parseMarker(lines[next] ?? "");
      if (sibling && sameList(sibling, first) && sibling.column <= 3) {
        i = next;
        continue;
      }
      break;
    }
    const marker = parseMarker(line);
    if (!marker || !sameList(marker, first) || marker.column > 3) break;
    const item = readItem(lines, i, marker, first);
    items.push(item.text);
    i = item.next;
  }
  return {
    list: {
      ordered: first.ordered,
      start: first.number,
      delimiter: first.delimiter,
      items,
    },
    next: i,
  };
}

function readItem(
  lines: string[],
  start: number,
  marker: Marker,
  listMarker: Marker,
): { text: string; next: number } {
  // A marker with no text is already the item's one allowed
  // blank line. Content has to be indented to the content
  // column; a second blank line ends the item.
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
      if (leadingColumns(line).columns < marker.contentColumn) break;
      fence = opened.marker;
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      i += 1;
      continue;
    }
    if (line.trim() === "$$") {
      if (leadingColumns(line).columns < marker.contentColumn) break;
      inMath = true;
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      i += 1;
      continue;
    }
    const nested = parseMarker(line);
    if (nested && nested.column >= marker.contentColumn) {
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      i += 1;
      continue;
    }
    if (nested && nested.column < marker.contentColumn) break;
    if (leadingColumns(line).columns >= marker.contentColumn) {
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      i += 1;
      continue;
    }
    if (sawContent && !sawBlank && !interruptsList(line)) {
      // A lazy line is still the open paragraph. Its partial
      // indent is not part of the text.
      body.push(line.replace(/^[ \t]+/, ""));
      i += 1;
      continue;
    }
    break;
  }
  return { text: trimEdgeNewlines(body.join("\n")), next: i };
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
  let number = 1;
  let token = "";
  const bullet = /^([-+*])/.exec(rest);
  const orderedMatch = /^(\d{1,9})([.)])/.exec(rest);
  if (bullet) {
    token = bullet[1] ?? "";
  } else if (orderedMatch) {
    ordered = true;
    token = `${orderedMatch[1] ?? ""}${orderedMatch[2] ?? ""}`;
    delimiter = orderedMatch[2] === ")" ? ")" : ".";
    number = Number(orderedMatch[1]);
    if (!Number.isFinite(number)) return null;
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
    number,
    contentColumn: padded.contentColumn,
    text: padded.text,
  };
}

/**
 * CommonMark list padding. `markerColumn` is the column just
 * after the marker. One to four columns of spaces or a tab are
 * padding. Five or more keep a single column as the separator
 * and leave the rest in `text`. A blank marker line uses one
 * column of padding and empty text, even when spaces follow
 * the marker.
 */
export function listMarkerPadding(
  line: string,
  markerIndex: number,
  markerColumn: number,
): { contentColumn: number; text: string } {
  const start = { col: markerColumn, index: markerIndex, partial: 0 };
  const cur = { col: start.col, index: start.index, partial: 0 };
  let guard = 0;
  do {
    const before = cur.col;
    advanceMarkerColumn(line, cur);
    if (cur.col === before) break;
    guard += 1;
  } while (
    cur.col - start.col < 5 &&
    isMarkerSpace(peekMarker(line, cur)) &&
    guard < 32
  );
  const spacesAfter = cur.col - start.col;
  const blank = peekMarker(line, cur) === null;
  if (spacesAfter >= 5 || spacesAfter < 1 || blank) {
    const back = { col: start.col, index: start.index, partial: 0 };
    if (isMarkerSpace(peekMarker(line, back))) advanceMarkerColumn(line, back);
    return {
      contentColumn: markerColumn + 1,
      text: blank ? "" : markerRemainder(line, back),
    };
  }
  return {
    contentColumn: markerColumn + spacesAfter,
    text: markerRemainder(line, cur),
  };
}

type MarkerCursor = { col: number; index: number; partial: number };

function advanceMarkerColumn(line: string, cur: MarkerCursor): void {
  if (cur.partial > 0) {
    cur.partial -= 1;
    cur.col += 1;
    if (cur.partial === 0) cur.index += 1;
    return;
  }
  if (cur.index >= line.length) return;
  const ch = line[cur.index] ?? "";
  if (ch === "\t") {
    const width = 4 - (cur.col % 4);
    cur.col += 1;
    if (width > 1) cur.partial = width - 1;
    else cur.index += 1;
    return;
  }
  cur.col += 1;
  cur.index += 1;
}

function peekMarker(line: string, cur: MarkerCursor): string | null {
  if (cur.partial > 0) return "\t";
  if (cur.index >= line.length) return null;
  return line[cur.index] ?? null;
}

function isMarkerSpace(ch: string | null): boolean {
  return ch === " " || ch === "\t";
}

function markerRemainder(line: string, cur: MarkerCursor): string {
  if (cur.partial > 0) return `${" ".repeat(cur.partial)}${line.slice(cur.index + 1)}`;
  return line.slice(cur.index);
}

function interruptsList(line: string): boolean {
  if (isThematicBreak(line)) return true;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  if (/^#{1,6}(?:[ \t]|$)/.test(rest)) return true;
  if (rest.startsWith(">")) return true;
  if (fenceOnLine(line)) return true;
  if (rest.trim() === "$$") return true;
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
