// SPDX-License-Identifier: Apache-2.0

/**
 * v1.50: GFM single-tilde strikethrough on a completed assistant
 * LEFT `kind=message`.
 *
 * v1.33 already strikes `~~text~~`. This cut is the other GFM
 * form: `~text~`. A completed reply rewrites that pair to
 * `~~text~~` so the existing strikethrough (desktop remark
 * plugin, iOS full markdown) paints it struck through and hides
 * the tildes. `~~text~~` is left alone. A run of three or more
 * tildes is not a single-tilde pair.
 *
 * The text inside cannot start or end with whitespace, and the
 * pair cannot cross a newline or a hard-break placeholder. An
 * unclosed tilde stays literal. A tilde in a URL or a link
 * destination stays literal. Fences, inline code, indented code,
 * and math stay literal. A backslash-escaped tilde is not a
 * delimiter. Streaming (`completed: false`) returns the text
 * unchanged. Copy controls keep markdown source — this module
 * does not copy. No animation. No new HTTP.
 * v1.70: a single tilde that was not promoted is stashed so the
 * markdown parser cannot pair it. `~foo~~bar~` stays literal on
 * both clients. A run of two stays `~~`. A run of three or more
 * stays the characters. A tilde in a URL, a link destination, or
 * code is not stashed.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownSingleStrike.swift`.
 */

import { stashMarkdownText } from "./markdownEscape.ts";
import { HARD_BREAK_TOKEN } from "./markdownHardBreak.ts";
import { fenceRanges, inRange, inlineCodeRanges, type Range } from "./math.ts";

const URL_CHAR = /[A-Za-z0-9:/?#\[\]@!$&'()*+,;=%._~-]/;

/**
 * Rewrite `~text~` to `~~text~~` outside code and math.
 * `completed: false` returns `text` unchanged.
 */
export function promoteSingleTilde(text: string, completed = true): string {
  if (!completed || !text || !text.includes("~")) return text;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocked = protectedRanges(src);
  let out = "";
  let i = 0;
  while (i < src.length) {
    const span = rangeAt(i, blocked);
    if (span) {
      out += src.slice(i, span.end);
      i = span.end;
      continue;
    }
    if (!isSingleOpener(src, i)) {
      out += src[i] ?? "";
      i += 1;
      continue;
    }
    const close = findCloser(src, i + 1, blocked);
    if (close < 0) {
      out += src[i] ?? "";
      i += 1;
      continue;
    }
    out += "~~";
    out += src.slice(i + 1, close);
    out += "~~";
    i = close + 1;
  }
  return shieldStrayTildes(out);
}

/**
 * Hide a leftover length-1 tilde. cmark-gfm would match it across
 * an inner `~~` (`~foo~~bar~`). The visible character comes back
 * when escapes are restored. Length 2 is the strikethrough marker.
 * Length 3+ is not a marker either, and stays visible so a fence
 * of tildes is unchanged.
 */
function shieldStrayTildes(src: string): string {
  if (!src.includes("~")) return src;
  const blocked = protectedRanges(src);
  let out = "";
  let i = 0;
  while (i < src.length) {
    const span = rangeAt(i, blocked);
    if (span) {
      out += src.slice(i, span.end);
      i = span.end;
      continue;
    }
    if (src[i] !== "~" || isEscaped(src, i)) {
      out += src[i] ?? "";
      i += 1;
      continue;
    }
    let end = i + 1;
    while (
      end < src.length &&
      src[end] === "~" &&
      !isEscaped(src, end) &&
      !rangeAt(end, blocked)
    ) {
      end += 1;
    }
    if (end - i === 1 && !tildeInUrl(src, i) && !inLinkDestination(src, i)) {
      out += stashMarkdownText("~");
    } else {
      out += src.slice(i, end);
    }
    i = end;
  }
  return out;
}

function isSingleOpener(src: string, i: number): boolean {
  if (src[i] !== "~" || isEscaped(src, i)) return false;
  if (src[i - 1] === "~" || src[i + 1] === "~") return false;
  const next = src[i + 1];
  if (next == null || isWs(next)) return false;
  if (tildeInUrl(src, i) || inLinkDestination(src, i)) return false;
  return true;
}

/**
 * Index of the closing single tilde, or -1. A `~` that belongs to
 * `~~`, a newline, or a hard-break placeholder ends the search
 * without a match so those markers stay as they are.
 */
function findCloser(src: string, from: number, blocked: Range[]): number {
  let j = from;
  while (j < src.length) {
    const span = rangeAt(j, blocked);
    if (span) {
      j = span.end;
      continue;
    }
    if (src[j] === "\n" || src.startsWith(HARD_BREAK_TOKEN, j)) return -1;
    if (src[j] === "~") {
      if (isEscaped(src, j) || src[j - 1] === "~" || src[j + 1] === "~") return -1;
      if (isWs(src[j - 1])) return -1;
      if (tildeInUrl(src, j) || inLinkDestination(src, j)) return -1;
      return j;
    }
    j += 1;
  }
  return -1;
}

function tildeInUrl(src: string, index: number): boolean {
  let j = index - 1;
  while (j >= 0 && URL_CHAR.test(src[j] ?? "")) j -= 1;
  const prefix = src.slice(j + 1, index);
  return /https?:\/\//i.test(prefix) || /www\./i.test(prefix);
}

function inLinkDestination(src: string, index: number): boolean {
  let depth = 0;
  for (let j = index - 1; j >= 0; j -= 1) {
    const ch = src[j];
    if (ch === "\n" || src.startsWith(HARD_BREAK_TOKEN, j)) return false;
    if (ch === ")") {
      depth += 1;
      continue;
    }
    if (ch !== "(") continue;
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    let k = j - 1;
    while (k >= 0 && (src[k] === " " || src[k] === "\t")) k -= 1;
    return src[k] === "]";
  }
  return false;
}

function isWs(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

function isEscaped(src: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function protectedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const indented = indentedCodeRanges(src, fences);
  const skip = [...fences, ...codes, ...indented];
  return mergeRanges([...skip, ...mathRanges(src, skip)]);
}

function mathRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  const token = /§§SBM[IB]\d+§§/g;
  for (const match of src.matchAll(token)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip) || inRange(i, ranges)) {
      i += 1;
      continue;
    }
    if (src.startsWith("$$", i) || src.startsWith("\\(", i)) {
      const marker = src.startsWith("$$", i) ? "$$" : "\\)";
      const from = i + 2;
      let close = -1;
      let j = from;
      while (j < src.length) {
        if (inRange(j, skip)) {
          j += 1;
          continue;
        }
        if (src.startsWith(marker, j)) {
          close = j;
          break;
        }
        j += 1;
      }
      if (close >= 0) {
        ranges.push({ start: i, end: close + marker.length });
        i = close + marker.length;
        continue;
      }
      ranges.push({ start: i, end: src.length });
      break;
    }
    i += 1;
  }
  return ranges;
}

function indentedCodeRanges(src: string, fences: Range[]): Range[] {
  const ranges: Range[] = [];
  let inCode = false;
  let codeStart = 0;
  let prevBlank = true;
  let i = 0;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const end = nl < 0 ? src.length : nl;
    const inFence = fences.some((fence) => i >= fence.start && i < fence.end);
    if (inFence) {
      if (inCode) {
        ranges.push({ start: codeStart, end: i });
        inCode = false;
      }
      prevBlank = false;
    } else {
      const line = src.slice(i, end);
      const indent = contentIndent(line);
      const blank = indent == null;
      if (inCode && !blank && (indent ?? 0) < 4) {
        ranges.push({ start: codeStart, end: i });
        inCode = false;
      }
      if (!inCode && prevBlank && indent != null && indent >= 4) {
        inCode = true;
        codeStart = i;
      }
      prevBlank = blank;
    }
    if (nl < 0) break;
    i = nl + 1;
  }
  if (inCode) ranges.push({ start: codeStart, end: src.length });
  return ranges;
}

function contentIndent(line: string): number | null {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") {
      col += 1;
      continue;
    }
    if (ch === "\t") {
      col += 4 - (col % 4);
      continue;
    }
    return col;
  }
  return null;
}

function rangeAt(index: number, ranges: Range[]): Range | null {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) return range;
  }
  return null;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ start: range.start, end: range.end });
  }
  return out;
}
