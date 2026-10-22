// SPDX-License-Identifier: Apache-2.0

/**
 * v1.67: CommonMark intraword underscores in a completed assistant
 * LEFT `kind=message`.
 *
 * Desktop react-markdown (micromark) and iOS full markdown
 * (cmark-gfm) already leave an intraword `_` literal.
 * `snake_case_name`, `foo_bar_baz`, and `foo__bar__baz` are not
 * emphasis. `_emphasis_` and `__strong__` at a word boundary still
 * render. `foo*bar*baz` still emphasizes, because `*` has no
 * intraword ban.
 *
 * The parsers still treat a word-boundary dunder as strong
 * emphasis, so `__init__` became bold `init`. This pass stashes
 * that identifier, and the other Python data-model names, so the
 * underscores stay. A name that itself contains `_`
 * (`__init_subclass__`, `__foo_bar__`) is the same kind of
 * identifier. `__strong__` is not one of those names, so it stays
 * strong. Code, link destinations, and URLs are left alone.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownUnderscore.swift`.
 */

import { fenceRanges, inlineCodeRanges, type Range } from "./math.ts";

/**
 * Python data-model and module names, without the surrounding
 * underscores. `__strong__` is not in this list.
 * The same words, in this order, live in `MarkdownUnderscore.swift`.
 */
export const DUNDER_WORD_LIST =
  "abs add aenter aexit aiter all anext annotations await bases bool builtins bytes cached call ceil class complex contains copy debug deepcopy del delattr delete delitem dict dir divmod doc enter eq exit file float floor floordiv format future ge get getattr getattribute getitem gt hash iadd iand ifloordiv ilshift imatmul imod imul index init instancecheck int invert ior ipow irshift isub iter itruediv ixor le len loader lshift lt main matmul missing mod module mro mul name ne neg new next or package path pos pow prepare qualname radd rand rdivmod repr reversed rfloordiv rlshift rmatmul rmod rmul ror round rpow rrshift rshift rsub rtruediv rxor set setattr setitem sizeof slots spec str sub subclasscheck subclasses truediv trunc weakref xor";

const DUNDER_NAMES = new Set(DUNDER_WORD_LIST.split(" "));

const URL_CHAR = /[A-Za-z0-9:/?#\[\]@!$&'()*+,;=%._~-]/;
const PUNCT = /^(?:\p{P}|\p{S})$/u;

/** Never animate, including when Reduce Motion is off. */
export function intrawordUnderscoreAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Stash `__init__`-style identifiers outside code and URLs.
 * `completed: false` returns `text` unchanged. Intraword `_` is
 * already literal in both parsers, so `snake_case_name` is unchanged.
 */
export function protectIntrawordUnderscores(text: string, completed = true): string {
  if (!completed || !text || !text.includes("_")) return text;
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
    const end = dunderEnd(text, i);
    if (end != null && !skip(text, i)) {
      out += stash(text.slice(i, end));
      i = end;
      continue;
    }
    out += text[i] ?? "";
    i += 1;
  }
  return out;
}

function dunderEnd(src: string, i: number): number | null {
  if (src[i] !== "_" || src[i + 1] !== "_" || src[i + 2] === "_") return null;
  if (isEscaped(src, i)) return null;
  if (i > 0 && src[i - 1] === "_" && !isEscaped(src, i - 1)) return null;
  const open = flank(src, i, i + 2);
  if (!open.open) return null;
  const name = readName(src, i + 2);
  if (!name) return null;
  const closeAt = name.end;
  if (src[closeAt] !== "_" || src[closeAt + 1] !== "_" || src[closeAt + 2] === "_") return null;
  if (isEscaped(src, closeAt)) return null;
  const close = flank(src, closeAt, closeAt + 2);
  if (!close.close) return null;
  if (!name.value.includes("_") && !DUNDER_NAMES.has(name.value)) return null;
  return closeAt + 2;
}

function readName(src: string, start: number): { value: string; end: number } | null {
  if (!isIdentStart(src[start])) return null;
  let k = start + 1;
  while (isIdentPart(src[k])) k += 1;
  while (src[k] === "_" && src[k + 1] !== "_" && isIdentPart(src[k + 1])) {
    k += 1;
    while (isIdentPart(src[k])) k += 1;
  }
  return { value: src.slice(start, k), end: k };
}

function flank(src: string, start: number, end: number): { open: boolean; close: boolean } {
  const before = start > 0 ? src[start - 1] : undefined;
  const after = end < src.length ? src[end] : undefined;
  const beforeWs = isWs(before);
  const afterWs = isWs(after);
  const beforePunct = before != null && isPunct(before);
  const afterPunct = after != null && isPunct(after);
  const left = !afterWs && (!afterPunct || beforeWs || beforePunct);
  const right = !beforeWs && (!beforePunct || afterWs || afterPunct);
  return {
    open: left && (!right || beforePunct),
    close: right && (!left || afterPunct),
  };
}

function skip(src: string, index: number): boolean {
  return inLinkDestination(src, index) || inUrlOrEmail(src, index);
}

function inUrlOrEmail(src: string, index: number): boolean {
  let a = index;
  let b = index + 1;
  while (a > 0 && URL_CHAR.test(src[a - 1] ?? "")) a -= 1;
  while (b < src.length && URL_CHAR.test(src[b] ?? "")) b += 1;
  const span = src.slice(a, b);
  if (/https?:\/\//i.test(span) || /(^|[^A-Za-z0-9])www\./i.test(span)) return true;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(span);
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

function isEscaped(src: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function isWs(ch: string | undefined): boolean {
  if (ch == null) return true;
  if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
    return true;
  }
  return /^\p{Zs}$/u.test(ch);
}

function isPunct(ch: string): boolean {
  return PUNCT.test(ch);
}

function isIdentStart(ch: string | undefined): boolean {
  return ch != null && ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z"));
}

function isIdentPart(ch: string | undefined): boolean {
  return isIdentStart(ch) || (ch != null && ch >= "0" && ch <= "9");
}

function stash(value: string): string {
  let hex = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    hex += cp.toString(16).toUpperCase().padStart(6, "0");
  }
  return `§§SBE${hex}§§`;
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
