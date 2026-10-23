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
 * any text ends the item.
 *
 * v1.56: a list marker does not interrupt an open paragraph
 * unless CommonMark allows it. An ordered marker interrupts
 * only when its digits are exactly `1` (`1.` or `1)`), so
 * `9.`, `14.`, `0.`, `01.`, and `2)` stay paragraph text.
 * An empty marker (`1.` or `*` with no item text) stays text
 * too. A bullet that has text still interrupts. A blank line,
 * an ATX heading, a fence, a block quote, a thematic break,
 * or the start of the chunk lets any start number begin a
 * list, including `0.` and `01.`.
 *
 * v1.57: `-`, `*`, and `+` are different lists, matching
 * react-markdown. A later margin item stays in the list only
 * when it uses that same bullet. A nested marker of another
 * character stays inside the item. Ordered `.` and `)` were
 * already different lists.
 *
 * v1.58: a CommonMark HTML block ends the list the way
 * react-markdown does. Types 1–6 (`<div>`, `<script>`, a
 * comment, and the other block tags) interrupt the item, so
 * the tag line and everything the block owns stay outside it.
 * A type 7 tag such as `<br>` cannot interrupt a paragraph,
 * but on a lazy continuation it stays in the item and stops
 * further lazy lines. A marker inside the block, including
 * `9.`, is not a list. Four or more leading columns stay
 * indented code. Tags stay literal text. Streaming
 * (`completed: false`) returns the text unchanged. Copy
 * controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 *
 * v1.72: indented code inside a list item keeps cmark-gfm tab
 * stops. A tab is measured from its column on the original
 * line, not from column 0 after the marker is stripped.
 * A tab that crosses the code indent becomes the leftover
 * spaces, and a later tab stays a tab. A line that continues
 * an open paragraph is not code. A fence whose indent is
 * under four columns is unchanged. Streaming stays plain text.
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
  /** `-`, `*`, or `+`. Ordered markers use "". */
  bullet: "-" | "*" | "+" | "";
  number: number;
  /** Digit characters of an ordered marker. Empty for a bullet. */
  digits: string;
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
  let paragraph = false;

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
      paragraph = false;
      i += 1;
      continue;
    }
    const htmlEnd = htmlBlockEnd(lines, i, paragraph);
    if (htmlEnd != null) {
      paragraph = false;
      i = htmlEnd;
      continue;
    }
    const marker = parseMarker(line);
    if (marker && marker.column <= 3 && (!paragraph || markerInterruptsParagraph(marker))) {
      const found = readList(lines, i, marker);
      pushMarkdown(i);
      blocks.push({ type: "list", list: found.list });
      i = found.next;
      mdStart = i;
      paragraph = false;
      continue;
    }
    paragraph = nextParagraphOpen(line, paragraph);
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
  const state = paragraphStateAt(lines, start);
  if (state.insideHtml) return null;
  if (state.open && !markerInterruptsParagraph(marker)) return null;
  return readList(lines, start, marker).next;
}

/**
 * v1.59: end of an ordered list at `start`, or null when that
 * line is not one. Bullet lists stay null so `- [ ]` extraction
 * still owns them. A nested task indented into this list is part
 * of the item, not a following task list.
 */
export function orderedListEnd(lines: string[], start: number): number | null {
  const end = markdownListEnd(lines, start);
  if (end == null || end <= start) return null;
  const marker = parseMarker(lines[start] ?? "");
  if (!marker?.ordered) return null;
  return end;
}

/**
 * CommonMark only lets some markers interrupt a paragraph.
 * An ordered marker interrupts only when its digits are `1`,
 * so `01.` and `9.` stay text. A marker with no item text
 * (`1.` / `*` alone) stays text too.
 */
function markerInterruptsParagraph(marker: Marker): boolean {
  if (marker.text === "") return false;
  if (marker.ordered && marker.digits !== "1") return false;
  return true;
}

/**
 * Paragraph state at `index`, and whether that line sits inside
 * an HTML block that started earlier. A marker on a covered line
 * is text inside the block, not a new list.
 */
function paragraphStateAt(
  lines: string[],
  index: number,
): { open: boolean; insideHtml: boolean } {
  let paragraph = false;
  let fence: string | null = null;
  let inMath = false;
  let i = 0;
  while (i < index && i < lines.length) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      paragraph = false;
      i += 1;
      continue;
    }
    const htmlEnd = htmlBlockEnd(lines, i, paragraph);
    if (htmlEnd != null) {
      if (htmlEnd > index) return { open: false, insideHtml: true };
      paragraph = false;
      i = htmlEnd;
      continue;
    }
    const marker = parseMarker(line);
    if (marker && marker.column <= 3 && (!paragraph || markerInterruptsParagraph(marker))) {
      paragraph = false;
      i += 1;
      continue;
    }
    paragraph = nextParagraphOpen(line, paragraph);
    i += 1;
  }
  return { open: paragraph, insideHtml: false };
}

/**
 * Paragraph state after a line that is not taken as a new list.
 * A blank line, heading, quote, or rule closes it. Indented
 * code closes it only when no paragraph is already open.
 */
function nextParagraphOpen(line: string, open: boolean): boolean {
  if (isBlank(line)) return false;
  if (isThematicBreak(line) || isAtxHeadingLine(line) || isBlockQuoteLine(line)) return false;
  if (!open && isIndentedCodeLine(line)) return false;
  return true;
}

function isBlank(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function isAtxHeadingLine(line: string): boolean {
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

function isBlockQuoteLine(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3 || lead.index >= line.length) return false;
  return line[lead.index] === ">";
}

function isIndentedCodeLine(line: string): boolean {
  if (isBlank(line)) return false;
  return leadingColumns(line).columns >= 4;
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

/**
 * Indented-code body of a list line, or null when the line is
 * not indented four columns past `contentColumn`.
 *
 * Columns are the original line, so a tab keeps its stop. The
 * marker's own characters sit before `contentColumn` and are
 * skipped. A tab that starts before the code indent and ends
 * after it contributes the leftover spaces. A tab that starts
 * at or after that indent stays in the returned text.
 */
export function listItemIndentedCode(line: string, contentColumn: number): string | null {
  const limit = contentColumn + 4;
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
      if (next <= limit) {
        col = next;
        index += 1;
        continue;
      }
      return `${" ".repeat(next - limit)}${line.slice(index + 1)}`;
    }
    if (col < contentColumn) {
      col += 1;
      index += 1;
      continue;
    }
    return null;
  }
  if (col < limit) return null;
  return line.slice(index);
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
  // v1.72: a code line is stored as four spaces plus the text
  // cmark-gfm would keep, so the indented-code pass (which
  // starts at column 0) does not remeasure a shifted tab.
  const openingCode = listItemIndentedCode(lines[start] ?? "", marker.contentColumn);
  const body: string[] = [];
  let paragraph = false;
  if (marker.text !== "") {
    if (openingCode != null) body.push(`    ${openingCode}`);
    else {
      body.push(marker.text);
      paragraph = true;
    }
  }
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
        paragraph = false;
        i += 1;
        continue;
      }
      break;
    }
    if (!paragraph) {
      const code = listItemIndentedCode(line, marker.contentColumn);
      if (code != null) {
        body.push(`    ${code}`);
        sawContent = true;
        paragraph = false;
        i += 1;
        continue;
      }
    }
    const opened = fenceOnLine(line);
    if (opened) {
      if (leadingColumns(line).columns < marker.contentColumn) break;
      fence = opened.marker;
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      paragraph = false;
      i += 1;
      continue;
    }
    if (line.trim() === "$$") {
      if (leadingColumns(line).columns < marker.contentColumn) break;
      inMath = true;
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      paragraph = false;
      i += 1;
      continue;
    }
    const nested = parseMarker(line);
    if (nested && nested.column >= marker.contentColumn) {
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      paragraph = true;
      i += 1;
      continue;
    }
    if (nested && nested.column < marker.contentColumn) break;
    if (leadingColumns(line).columns >= marker.contentColumn) {
      body.push(dedent(line, marker.contentColumn));
      sawContent = true;
      paragraph = true;
      i += 1;
      continue;
    }
    if (sawContent && !sawBlank && !interruptsList(line)) {
      // A lazy line is still the open paragraph. Its partial
      // indent is not part of the text. A type 7 tag (`<br>`)
      // stays in the item and ends further lazy lines.
      body.push(line.replace(/^[ \t]+/, ""));
      paragraph = true;
      if (htmlLazyTag(line)) sawBlank = true;
      i += 1;
      continue;
    }
    break;
  }
  return { text: trimEdgeNewlines(body.join("\n")), next: i };
}

function sameList(marker: Marker, first: Marker): boolean {
  return (
    marker.ordered === first.ordered &&
    marker.delimiter === first.delimiter &&
    marker.bullet === first.bullet
  );
}

function parseMarker(line: string): Marker | null {
  if (isThematicBreak(line)) return null;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  let ordered = false;
  let delimiter: "." | ")" | "" = "";
  let bullet: "-" | "*" | "+" | "" = "";
  let number = 1;
  let digits = "";
  let token = "";
  const bulletMatch = /^([-+*])/.exec(rest);
  const orderedMatch = /^(\d{1,9})([.)])/.exec(rest);
  if (bulletMatch) {
    const mark = bulletMatch[1];
    if (mark !== "-" && mark !== "*" && mark !== "+") return null;
    token = mark;
    bullet = mark;
  } else if (orderedMatch) {
    ordered = true;
    digits = orderedMatch[1] ?? "";
    token = `${digits}${orderedMatch[2] ?? ""}`;
    delimiter = orderedMatch[2] === ")" ? ")" : ".";
    number = Number(digits);
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
    bullet,
    number,
    digits,
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
  if (htmlBlockInterrupts(line)) return true;
  return false;
}

const HTML_BLOCK_TAGS = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body",
  "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
  "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem",
  "nav", "noframes", "ol", "optgroup", "option", "p", "param", "search",
  "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead",
  "title", "tr", "track", "ul",
]);

type HtmlKind = { type: "until"; needle: string } | { type: "blank" };

/**
 * CommonMark HTML block start. Types 1–6 interrupt a paragraph.
 * Type 7 (any other complete tag) starts only when the paragraph
 * is already closed. Four or more leading columns are indented
 * code, not HTML. The optional slash lets `<br/>` be type 7.
 */
function htmlBlockKind(line: string, paragraphOpen: boolean): HtmlKind | null {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return null;
  const body = line.slice(lead.index);
  const open = /^<(pre|script|style|textarea)(\s|>|$)/i.exec(body);
  if (open) {
    const name = (open[1] ?? "").toLowerCase();
    return { type: "until", needle: `</${name}>` };
  }
  if (body.startsWith("<!--")) return { type: "until", needle: "-->" };
  if (body.startsWith("<?")) return { type: "until", needle: "?>" };
  if (body.startsWith("<![CDATA[")) return { type: "until", needle: "]]>" };
  if (/^<![A-Z]/.test(body)) return { type: "until", needle: ">" };
  const tag = htmlBlockTagName(body);
  if (tag && HTML_BLOCK_TAGS.has(tag)) return { type: "blank" };
  if (!paragraphOpen && htmlCompleteTag(body)) return { type: "blank" };
  return null;
}

function htmlBlockTagName(body: string): string | null {
  const match = /^<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(body);
  if (!match) return null;
  const rest = body.slice(match[0].length);
  if (rest !== "" && !/^[\s/>]/.test(rest)) return null;
  return (match[1] ?? "").toLowerCase();
}

function htmlCompleteTag(body: string): boolean {
  return /^<\/?[A-Za-z][A-Za-z0-9-]*(\s[^>]*)?\/?>\s*$/.test(body);
}

function skipHtmlBlock(lines: string[], start: number, kind: HtmlKind): number {
  if (kind.type === "until") {
    const needle = kind.needle.toLowerCase();
    let i = start;
    while (i < lines.length) {
      const has = (lines[i] ?? "").toLowerCase().includes(needle);
      i += 1;
      if (has) break;
    }
    return i;
  }
  let i = start + 1;
  while (i < lines.length && !isBlank(lines[i] ?? "")) i += 1;
  return i;
}

/** Index just after an HTML block that starts at `index`, or null. */
export function htmlBlockEnd(
  lines: string[],
  index: number,
  paragraphOpen: boolean,
): number | null {
  const kind = htmlBlockKind(lines[index] ?? "", paragraphOpen);
  if (!kind) return null;
  return skipHtmlBlock(lines, index, kind);
}

/**
 * End index of a type 1–5 HTML block (comment, script, style, pre,
 * textarea, processing instruction, declaration, CDATA). Those
 * blocks keep their blank lines. Type 6 and 7 end at a blank line,
 * so that blank still splits bubbles. Null when this line is not
 * one of those blocks.
 */
export function htmlUntilBlockEnd(
  lines: string[],
  index: number,
  paragraphOpen: boolean,
): number | null {
  const kind = htmlBlockKind(lines[index] ?? "", paragraphOpen);
  if (!kind || kind.type !== "until") return null;
  return skipHtmlBlock(lines, index, kind);
}

/** Types 1–6. They end a list item or a lazy quote before this line. */
export function htmlBlockInterrupts(line: string): boolean {
  return htmlBlockKind(line, true) != null;
}

/**
 * Type 7: a complete tag such as `<br>` that cannot interrupt a
 * paragraph. On a lazy list or quote line it stays in the block
 * and ends further lazy lines.
 */
export function htmlLazyTag(line: string): boolean {
  if (htmlBlockKind(line, true) != null) return false;
  return htmlBlockKind(line, false)?.type === "blank";
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
