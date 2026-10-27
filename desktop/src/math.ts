// SPDX-License-Identifier: Apache-2.0
import katex from "katex";

export type MathKind = "inline" | "block";

export type MathSlot = {
  id: number;
  kind: MathKind;
  /** TeX without delimiters. */
  tex: string;
  /** Source with delimiters (visible on fallback). */
  raw: string;
  closed: boolean;
};

export type MathTokenPiece =
  | { type: "text"; value: string }
  | { type: "math"; id: number; kind: MathKind };

export type Range = { start: number; end: number };

const TOKEN = /§§SBM([IB])(\d+)§§/g;

/** Closed + completed only — avoid thrashing half-drawn formulas. */
export function shouldRenderMath(opts: {
  completed: boolean;
  closed: boolean;
}): boolean {
  return opts.completed && opts.closed;
}

/** KaTeX HTML, or null on empty / failed parse. Local engine only. */
export function renderKatex(tex: string, displayMode: boolean): string | null {
  const source = tex.trim();
  if (!source) return null;
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      output: "html",
      trust: false,
      maxSize: 20,
      maxExpand: 1000,
    });
  } catch {
    return null;
  }
}

export function mathToken(slot: Pick<MathSlot, "id" | "kind">): string {
  const kind = slot.kind === "block" ? "B" : "I";
  return `§§SBM${kind}${slot.id}§§`;
}

export function splitMathTokens(text: string): MathTokenPiece[] {
  const pieces: MathTokenPiece[] = [];
  let last = 0;
  const re = new RegExp(TOKEN.source, "g");
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > last) pieces.push({ type: "text", value: text.slice(last, idx) });
    const kind: MathKind = match[1] === "B" ? "block" : "inline";
    pieces.push({ type: "math", id: Number(match[2]), kind });
    last = idx + match[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  if (pieces.length === 0) pieces.push({ type: "text", value: text });
  return pieces;
}

export function inRange(index: number, ranges: Range[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

/**
 * A backtick fence cannot contain a backtick in its info string.
 * Tilde fences can. A line that fails this is not a fence, so a
 * multi-backtick code span such as ``` `` ``` stays inline code.
 */
export function fenceInfoAllowsOpen(marker: string, info: string): boolean {
  if (marker.startsWith("`") && info.includes("`")) return false;
  return true;
}

/**
 * v1.98: a fence that is the text of a list marker is open until
 * its closer, which may sit in the first three columns. That
 * closer is not a new fence. A top-level fence is unchanged.
 */
export type DocumentFence = {
  top: string | null;
  list: { marker: string; contentColumn: number } | null;
};

export type FenceEvent =
  | "none"
  | "top-open"
  | "top-inside"
  | "top-close"
  | "list-open"
  | "list-inside"
  | "list-close"
  | "list-ended";

export function emptyDocumentFence(): DocumentFence {
  return { top: null, list: null };
}

/** One source line. `list-ended` reprocesses the line; read `state` after. */
export function stepDocumentFence(state: DocumentFence, line: string): FenceEvent {
  if (state.top) {
    if (closesFence(line, state.top, 0)) {
      state.top = null;
      return "top-close";
    }
    return "top-inside";
  }
  if (state.list) {
    const open = state.list;
    if (itemEnded(line, open.contentColumn)) {
      state.list = null;
      stepDocumentFence(state, line);
      return "list-ended";
    }
    if (closesFence(line, open.marker, open.contentColumn)) {
      state.list = null;
      return "list-close";
    }
    return "list-inside";
  }
  const top = fenceAtMargin(line);
  if (top) {
    state.top = top.marker;
    return "top-open";
  }
  const list = listMarkerFence(line);
  if (list) {
    state.list = list;
    return "list-open";
  }
  return "none";
}

/** Fenced ``` / ~~~ ranges, including an unclosed tail. */
export function fenceRanges(src: string): Range[] {
  const ranges: Range[] = [];
  const state = emptyDocumentFence();
  let openAt: number | null = null;
  let i = 0;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const lineEnd = nl < 0 ? src.length : nl;
    const line = src.slice(i, lineEnd);
    const event = stepDocumentFence(state, line);
    if (event === "top-open" || event === "list-open") {
      openAt = i;
    } else if (event === "top-close" || event === "list-close") {
      if (openAt != null) ranges.push({ start: openAt, end: lineEnd });
      openAt = null;
    } else if (event === "list-ended") {
      if (openAt != null) ranges.push({ start: openAt, end: i });
      openAt = state.top || state.list ? i : null;
    }
    if (nl < 0) break;
    i = nl + 1;
  }
  if (openAt != null) ranges.push({ start: openAt, end: src.length });
  return ranges;
}

type FenceHit = { marker: string; info: string };

function fenceAtMargin(line: string): FenceHit | null {
  let indent = 0;
  while (indent < line.length && indent < 4 && line[indent] === " ") indent += 1;
  if (indent > 3) return null;
  return fenceRun(line.slice(indent));
}

function fenceRun(text: string): FenceHit | null {
  const match = /^(`{3,}|~{3,})(.*)$/.exec(text);
  if (!match) return null;
  const marker = match[1] ?? "";
  const info = match[2] ?? "";
  if (!fenceInfoAllowsOpen(marker, info)) return null;
  return { marker, info };
}

function closesFence(line: string, marker: string, contentColumn: number): boolean {
  if (line.trim() === "") return false;
  if (contentColumn > 0 && leadingColumns(line).columns < contentColumn) return false;
  const body = contentColumn > 0 ? dedentColumns(line, contentColumn) : line;
  const fence = fenceAtMargin(body);
  if (!fence) return false;
  if (fence.marker[0] !== marker[0]) return false;
  if (fence.marker.length < marker.length) return false;
  return fence.info.trim() === "";
}

function itemEnded(line: string, contentColumn: number): boolean {
  if (line.trim() === "") return false;
  return leadingColumns(line).columns < contentColumn;
}

function listMarkerFence(line: string): { marker: string; contentColumn: number } | null {
  if (isMarginThematicBreak(line)) return null;
  const lead = leadingColumns(line);
  if (lead.columns > 3) return null;
  const rest = line.slice(lead.index);
  const bullet = /^([-+*])/.exec(rest);
  const ordered = /^(\d{1,9})([.)])/.exec(rest);
  const token = bullet?.[1] ?? ordered?.[0] ?? "";
  if (!token) return null;
  const after = lead.index + token.length;
  if (after >= line.length) return null;
  const sep = line[after];
  if (sep !== " " && sep !== "\t") return null;
  const padded = markerPadding(line, after, lead.columns + token.length);
  if (!padded.text) return null;
  const fence = fenceAtMargin(padded.text);
  if (!fence) return null;
  return { marker: fence.marker, contentColumn: padded.contentColumn };
}

function isMarginThematicBreak(line: string): boolean {
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

type ColCursor = { col: number; index: number; partial: number };

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

function dedentColumns(line: string, columns: number): string {
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

function markerPadding(
  line: string,
  markerIndex: number,
  markerColumn: number,
): { contentColumn: number; text: string } {
  const start = { col: markerColumn, index: markerIndex, partial: 0 };
  const cur = { col: start.col, index: start.index, partial: 0 };
  let guard = 0;
  do {
    const before = cur.col;
    advanceColumn(line, cur);
    if (cur.col === before) break;
    guard += 1;
  } while (cur.col - start.col < 5 && isPadSpace(peekColumn(line, cur)) && guard < 32);
  const spacesAfter = cur.col - start.col;
  const blank = peekColumn(line, cur) == null;
  if (spacesAfter >= 5 || spacesAfter < 1 || blank) {
    const back = { col: start.col, index: start.index, partial: 0 };
    if (isPadSpace(peekColumn(line, back))) advanceColumn(line, back);
    return {
      contentColumn: markerColumn + 1,
      text: blank ? "" : remainder(line, back),
    };
  }
  return { contentColumn: markerColumn + spacesAfter, text: remainder(line, cur) };
}

function advanceColumn(line: string, cur: ColCursor): void {
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

function peekColumn(line: string, cur: ColCursor): string | null {
  if (cur.partial > 0) return "\t";
  if (cur.index >= line.length) return null;
  return line[cur.index] ?? null;
}

function isPadSpace(ch: string | null): boolean {
  return ch === " " || ch === "\t";
}

function remainder(line: string, cur: ColCursor): string {
  if (cur.partial > 0) return `${" ".repeat(cur.partial)}${line.slice(cur.index + 1)}`;
  return line.slice(cur.index);
}

/**
 * Inline code spans outside fences. A run of N backticks closes at
 * the next run of exactly N, so `` `code` `` is one span. A span
 * stays inside one paragraph: a blank line ends the search and the
 * opener stays literal. An unmatched opener stays literal and
 * scanning continues after it.
 */
export function inlineCodeRanges(src: string, fences: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, fences)) {
      i += 1;
      continue;
    }
    if (src[i] !== "`") {
      i += 1;
      continue;
    }
    let n = 1;
    while (i + n < src.length && src[i + n] === "`") n += 1;
    let j = i + n;
    let matched = false;
    while (j < src.length) {
      if (inRange(j, fences)) {
        j += 1;
        continue;
      }
      if (src[j] === "\n") {
        let k = j + 1;
        while (k < src.length && (src[k] === " " || src[k] === "\t")) k += 1;
        if (k < src.length && src[k] === "\n") break;
      }
      if (src[j] !== "`") {
        j += 1;
        continue;
      }
      let m = 1;
      while (j + m < src.length && src[j + m] === "`") m += 1;
      if (m === n) {
        ranges.push({ start: i, end: j + m });
        i = j + m;
        matched = true;
        break;
      }
      j += m;
    }
    if (!matched) i += n;
  }
  return ranges;
}

function lineStart(src: string, index: number): number {
  const nl = src.lastIndexOf("\n", index - 1);
  return nl < 0 ? 0 : nl + 1;
}

function lineEnd(src: string, index: number): number {
  const nl = src.indexOf("\n", index);
  return nl < 0 ? src.length : nl;
}

/** `$$` is at the start of its line (optional leading whitespace). */
function dollarDollarAtLineStart(src: string, index: number): boolean {
  if (!src.startsWith("$$", index)) return false;
  return /^\s*$/.test(src.slice(lineStart(src, index), index));
}

function findClosingOwnLineDollarDollar(
  src: string,
  from: number,
  skip: Range[],
): number {
  let i = from;
  while (i <= src.length) {
    const end = lineEnd(src, i);
    const line = src.slice(i, end);
    if (!inRange(i, skip) && line.trim() === "$$") return end;
    if (end >= src.length) break;
    i = end + 1;
  }
  return -1;
}

type Hit = {
  kind: MathKind;
  start: number;
  end: number;
  tex: string;
  raw: string;
  closed: boolean;
};

function findBlockMath(src: string, skip: Range[]): Hit[] {
  const hits: Hit[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (!dollarDollarAtLineStart(src, i)) {
      i += 1;
      continue;
    }
    const start = lineStart(src, i);
    const end = lineEnd(src, i);
    const line = src.slice(start, end);
    const trimmed = line.trim();
    if (trimmed === "$$") {
      const bodyStart = end < src.length ? end + 1 : src.length;
      const close = findClosingOwnLineDollarDollar(src, bodyStart, skip);
      if (close >= 0) {
        const closeStart = lineStart(src, close === 0 ? 0 : close - 1);
        const after = close < src.length && src[close] === "\n" ? close + 1 : close;
        const tex = src.slice(bodyStart, closeStart);
        const raw = src.slice(start, after).replace(/\n$/, "");
        hits.push({
          kind: "block",
          start,
          end: after,
          tex: tex.replace(/\n$/, ""),
          raw,
          closed: true,
        });
        i = after;
        continue;
      }
      hits.push({
        kind: "block",
        start,
        end: src.length,
        tex: src.slice(bodyStart),
        raw: src.slice(start),
        closed: false,
      });
      break;
    }
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      const tex = trimmed.slice(2, -2).trim();
      const after = end < src.length ? end + 1 : end;
      hits.push({
        kind: "block",
        start,
        end: after,
        tex,
        raw: line.trimEnd(),
        closed: true,
      });
      i = after;
      continue;
    }
    i += 1;
  }
  return hits;
}

function findInlineMath(src: string, skip: Range[]): Hit[] {
  const hits: Hit[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (src[i] !== "\\" || src[i + 1] !== "(") {
      i += 1;
      continue;
    }
    let j = i + 2;
    let closed = -1;
    while (j < src.length - 1) {
      if (inRange(j, skip)) {
        j += 1;
        continue;
      }
      if (src[j] === "\\" && src[j + 1] === ")") {
        closed = j;
        break;
      }
      j += 1;
    }
    if (closed >= 0) {
      hits.push({
        kind: "inline",
        start: i,
        end: closed + 2,
        tex: src.slice(i + 2, closed),
        raw: src.slice(i, closed + 2),
        closed: true,
      });
      i = closed + 2;
      continue;
    }
    hits.push({
      kind: "inline",
      start: i,
      end: src.length,
      tex: src.slice(i + 2),
      raw: src.slice(i),
      closed: false,
    });
    break;
  }
  return hits;
}

/**
 * Replace `\( ... \)` and own-line `$$ ... $$` with placeholders so markdown
 * does not eat backslashes. Single `$...$` is never a delimiter.
 */
export function extractMath(src: string): { text: string; slots: MathSlot[] } {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const protectedRanges = [...fences, ...codes];
  const blocks = findBlockMath(src, protectedRanges);
  const afterBlocks = [
    ...protectedRanges,
    ...blocks.map((hit) => ({ start: hit.start, end: hit.end })),
  ];
  const inlines = findInlineMath(src, afterBlocks);
  const hits = [...blocks, ...inlines].sort((a, b) => a.start - b.start);
  const slots: MathSlot[] = hits.map((hit, id) => ({
    id,
    kind: hit.kind,
    tex: hit.tex,
    raw: hit.raw,
    closed: hit.closed,
  }));
  let text = src;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i]!;
    const slot = slots[i]!;
    const token = mathToken(slot);
    const replacement = slot.kind === "block" ? `\n\n${token}\n\n` : token;
    text = text.slice(0, hit.start) + replacement + text.slice(hit.end);
  }
  return { text, slots };
}
