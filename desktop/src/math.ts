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

/** Fenced ``` / ~~~ ranges, including an unclosed tail. */
export function fenceRanges(src: string): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  let open: { marker: string; start: number } | null = null;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const lineEnd = nl < 0 ? src.length : nl;
    const line = src.slice(i, lineEnd);
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[2] ?? "";
      const info = match[3] ?? "";
      if (!open) {
        open = { marker, start: i };
      } else {
        const sameTick = marker[0] === open.marker[0];
        if (
          sameTick &&
          marker.length >= open.marker.length &&
          info.trim() === ""
        ) {
          ranges.push({ start: open.start, end: lineEnd });
          open = null;
        }
      }
    }
    if (nl < 0) break;
    i = nl + 1;
  }
  if (open) ranges.push({ start: open.start, end: src.length });
  return ranges;
}

/** Inline `code` ranges outside fences. */
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
    while (j < src.length) {
      if (inRange(j, fences)) {
        j += 1;
        continue;
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
        break;
      }
      j += m;
    }
    if (j >= src.length) break;
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
