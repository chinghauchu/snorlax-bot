// SPDX-License-Identifier: Apache-2.0

/**
 * v1.68: CommonMark Unicode symbols are punctuation for emphasis
 * on a completed assistant LEFT `kind=message`.
 *
 * Desktop react-markdown (micromark) treats a BMP symbol
 * (`£` `©` `±` `™` `°` `¥` `×` `→`) as punctuation when it
 * decides whether `*` can open or close emphasis. iOS full
 * markdown (cmark-gfm) does not, so `*£*bravo`, `*±*1`,
 * `a*©*b`, and `**£**bravo` became emphasis there and stayed
 * literal asterisks on desktop.
 *
 * The symbol is stashed in a `§§SBE` token. The token begins
 * and ends with `§`, which both parsers already count as
 * punctuation, so the flanking rule matches. Restore paints
 * the symbol again. `*£50*`, `(*©*)`, `**©** notice`, `*foo*`,
 * and a non-BMP emoji such as `*😀*bravo` still emphasize.
 * ASCII symbols (tilde, pipe, dollar, backtick) stay in the
 * source: both parsers already treat them as punctuation, and
 * stashing them would hide strikethrough, tables, and code
 * fences. Code, link destinations, URLs, and email addresses
 * are left alone. A symbol in a link label is still stashed.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownSymbol.swift`.
 */

import { fenceRanges, inlineCodeRanges, type Range } from "./math.ts";

const URL_CHAR = /[A-Za-z0-9:/?#\[\]@!$&'()*+,;=%._~-]/;

/** Never animate, including when Reduce Motion is off. */
export function symbolFlankAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Stash BMP Unicode symbols outside code, link destinations, and
 * URLs. `completed: false` returns `text` unchanged.
 */
export function protectSymbolFlanks(text: string, completed = true): string {
  if (!completed || !text || !hasBmpSymbol(text)) return text;
  const blocked = blockedRanges(text);
  let out = "";
  let i = 0;
  while (i < text.length) {
    const span = blockAt(i, blocked);
    if (span) {
      out += text.slice(i, span.end);
      i = span.end;
      continue;
    }
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    if (isBmpSymbol(ch) && !skip(text, i)) out += stash(ch);
    else out += ch;
    i += ch.length;
  }
  return out;
}

function hasBmpSymbol(text: string): boolean {
  for (const ch of text) {
    if (isBmpSymbol(ch)) return true;
  }
  return false;
}

/**
 * Non-ASCII BMP `S` category. ASCII symbols and non-BMP emoji
 * stay in the source.
 */
function isBmpSymbol(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp <= 0x7f || cp > 0xffff || ch.length !== 1) return false;
  return /^\p{S}$/u.test(ch);
}

function stash(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `§§SBE${cp.toString(16).toUpperCase().padStart(6, "0")}§§`;
}

function skip(src: string, index: number): boolean {
  return inLinkDestination(src, index) || inUrlOrEmail(src, index);
}

function inUrlOrEmail(src: string, index: number): boolean {
  let a = index;
  let b = index + 1;
  while (a > 0 && URL_CHAR.test(src[a - 1] ?? "")) a -= 1;
  while (b < src.length && URL_CHAR.test(src[b] ?? "")) b += 1;
  const left = src.slice(a, index);
  const right = src.slice(index + 1, b);
  // The scheme has to sit in the run that reaches this symbol.
  // `[` `]` `(` `)` are URL characters, so a later destination
  // must not pull a link label into the URL.
  if (/https?:\/\//i.test(left)) return true;
  if (/(^|[^A-Za-z0-9])www\./i.test(left) || /^www\./i.test(left)) return true;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(`${left}a${right}`);
}

function inLinkDestination(src: string, index: number): boolean {
  let depth = 0;
  for (let j = index - 1; j >= 0; j -= 1) {
    const ch = src[j];
    if (ch === "\n" || ch === "\r") return false;
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

function blockedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  return mergeRanges([...fences, ...codes, ...indentedCodeRanges(src, fences)]);
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
    if (fences.some((fence) => i >= fence.start && i < fence.end)) {
      if (inCode) {
        ranges.push({ start: codeStart, end: i });
        inCode = false;
      }
      prevBlank = false;
    } else {
      const indent = contentIndent(src.slice(i, end));
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

function blockAt(index: number, ranges: Range[]): Range | null {
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
