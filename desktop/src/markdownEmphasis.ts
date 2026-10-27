// SPDX-License-Identifier: Apache-2.0

/**
 * v1.94: cmark-gfm emphasis delimiter runs on a completed
 * assistant LEFT `kind=message`.
 *
 * Checked spec section 6.4 (6.2 in newer numbering) on main
 * first, against cmark-gfm 0.29.0.gfm.13. These already match
 * on both clients and stay as they are: the rule of 3 on
 * `*foo**bar**baz*`, `*foo**bar*`, and `foo***bar***baz`;
 * punctuation flanking (`a*"foo"*`, `foo-_(bar)_`, `*(bar)*.`);
 * intraword `*` versus `_` (`foo*bar*`, `foo_bar_`, `5_6_78`);
 * and the process-emphasis order (`**foo*bar**`,
 * `*foo _bar* baz_`, `***foo** bar*`). v1.67 intraword
 * dunders and v1.68 symbol punctuation stand.
 *
 * Two edges did not match cmark-gfm's HTML.
 *
 * micromark treats U+000B, U+0085, U+2028, U+2029, and
 * U+FEFF as whitespace when it decides whether `*` or `_`
 * can open or close. cmark-gfm does not: its space set is
 * Zs plus tab, line feed, form feed, and carriage return.
 * `*\u000ba\u000b*` is emphasis there and was literal
 * asterisks here. The character is stashed in a token whose
 * ends are U+E000, which neither parser counts as whitespace
 * or punctuation, so the flanking rule matches. Restore
 * paints the character again. A real cmark space (NBSP,
 * em space, ideographic space) stays whitespace.
 *
 * cmark-gfm's HTML renderer emits one `<strong>` when strong
 * is nested inside strong. `****foo****`,
 * `foo******bar*********baz`, and `__foo, __bar__, baz__`
 * are one strong, not several. `remarkHardBreaks` already
 * runs on every completed reply parse, and it flattens
 * those nodes after the tree is built. Emphasis nested in
 * emphasis stays nested. iOS full markdown paints
 * `.stronglyEmphasized` as one run, which is the same
 * single strong.
 *
 * Code, link destinations, and URLs are left alone.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownEmphasis.swift`.
 */

import { fenceRanges, inlineCodeRanges, type Range } from "./math.ts";

/**
 * Code points cmark-gfm 0.29.0.gfm.13 counts as Unicode
 * whitespace. The same values live in `MarkdownEmphasis.swift`.
 */
export const CMARK_SPACE_CODES = [
  0x0009, 0x000a, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
] as const;

/**
 * Whitespace in micromark or Unicode White_Space that cmark-gfm
 * does not count. The same values, in this order, live in
 * `MarkdownEmphasis.swift`.
 */
export const NON_CMARK_SPACE_CODES = [0x000b, 0x0085, 0x2028, 0x2029, 0xfeff] as const;

const CMARK_SPACE = new Set<number>(CMARK_SPACE_CODES);
const NON_CMARK_SPACE = new Set<number>(NON_CMARK_SPACE_CODES);

/** Marker. U+E000 is neither cmark whitespace nor punctuation. */
export const EMPHASIS_SPACE_MARK = "\uE000SBW";

const URL_CHAR = /[A-Za-z0-9:/?#\[\]@!$&'()*+,;=%._~-]/;

/** Never animate, including when Reduce Motion is off. */
export function emphasisAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** True when `ch` is whitespace for cmark-gfm flanking. */
export function isCmarkUnicodeSpace(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (ch.length !== 1 && cp <= 0xffff) return false;
  return CMARK_SPACE.has(cp);
}

/**
 * Stash whitespace micromark would count and cmark-gfm does not.
 * `completed: false` returns `text` unchanged.
 */
export function protectEmphasisWhitespace(text: string, completed = true): string {
  if (!completed || !text || !hasNonCmarkSpace(text)) return text;
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
    if (NON_CMARK_SPACE.has(cp) && !skip(text, i)) out += stash(cp);
    else out += ch;
    i += ch.length;
  }
  return out;
}

/** Paint stashed whitespace back to the character. */
export function restoreEmphasisSpaces(text: string): string {
  if (!text.includes(EMPHASIS_SPACE_MARK)) return text;
  return text.replace(/\uE000SBW([0-9A-F]{6})\uE000/g, (raw, hex: string) => {
    const cp = Number.parseInt(hex, 16);
    if (!Number.isFinite(cp) || cp > 0x10ffff) return raw;
    return String.fromCodePoint(cp);
  });
}

type Tree = {
  type: string;
  children?: Tree[];
};

/**
 * cmark-gfm HTML emits one `<strong>` for strong nested in strong.
 * One bottom-up pass is enough: each strong unwraps a strong child
 * after that child has already unwrapped its own.
 */
export function flattenNestedStrong(node: Tree): void {
  const kids = node.children;
  if (!kids) return;
  for (const child of kids) flattenNestedStrong(child);
  if (node.type !== "strong") return;
  const next: Tree[] = [];
  for (const child of kids) {
    if (child.type === "strong" && child.children) next.push(...child.children);
    else next.push(child);
  }
  node.children = next;
}

function hasNonCmarkSpace(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (NON_CMARK_SPACE.has(cp)) return true;
  }
  return false;
}

function stash(cp: number): string {
  return `\uE000SBW${cp.toString(16).toUpperCase().padStart(6, "0")}\uE000`;
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
