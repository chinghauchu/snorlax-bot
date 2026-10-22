// SPDX-License-Identifier: Apache-2.0

/**
 * v1.40: CommonMark backslash escapes and HTML character references
 * on a completed assistant LEFT `kind=message`.
 *
 * A backslash before ASCII punctuation becomes that character and
 * must not start emphasis, a link, a list, or any other construct.
 * Named references (the common HTML5 set) and decimal / hex numeric
 * references decode to their characters. Unknown names and broken
 * references stay literal. A numeric reference that is zero, a
 * surrogate, a noncharacter, a disallowed control, or past
 * U+10FFFF becomes U+FFFD, matching CommonMark.
 *
 * Code spans, fenced code, and indented code blocks are left
 * byte-for-byte so `\*` and `&amp;` stay visible there. Call this
 * after math extraction: `\(` / `\)` and `$$` are already slots,
 * so a math delimiter is not turned into a parenthesis.
 *
 * The decoded character is stashed in a `§§SBE` token until text
 * is painted. A second pass (strikethrough, autolink, the platform
 * markdown parser) therefore cannot treat it as syntax, and the
 * character is React / SwiftUI text, never injected HTML.
 * Streaming (`completed: false`) returns the source unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownEscape.swift`.
 */

import { fenceRanges, inlineCodeRanges, type Range } from "./math.ts";

/** Placeholder. Six uppercase hex digits per Unicode scalar. */
export const ESCAPE_TOKEN = /§§SBE((?:[0-9A-F]{6})+)§§/g;

/**
 * The same placeholder after a URL encoder turns `§` (U+00A7) into
 * `%C2%A7`. Link destinations go through that encoder.
 */
const ESCAPE_TOKEN_ENCODED = /%C2%A7%C2%A7SBE((?:[0-9A-F]{6})+)%C2%A7%C2%A7/gi;

/**
 * CommonMark ASCII punctuation. A backslash escapes exactly one of
 * these. A backslash before anything else, including a newline
 * (hard break), stays a backslash.
 */
export const ASCII_PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/**
 * Common HTML5 named character references, plus the uppercase
 * aliases HTML5 actually defines and the check marks. Names are
 * case-sensitive. Anything else stays literal.
 */
const NAMED: Record<string, string> = {
  "amp": "\u0026",
  "AMP": "\u0026",
  "lt": "\u003C",
  "LT": "\u003C",
  "gt": "\u003E",
  "GT": "\u003E",
  "quot": "\u0022",
  "QUOT": "\u0022",
  "apos": "\u0027",
  "nbsp": "\u00A0",
  "copy": "\u00A9",
  "COPY": "\u00A9",
  "reg": "\u00AE",
  "REG": "\u00AE",
  "trade": "\u2122",
  "TRADE": "\u2122",
  "hellip": "\u2026",
  "mdash": "\u2014",
  "ndash": "\u2013",
  "lsquo": "\u2018",
  "rsquo": "\u2019",
  "ldquo": "\u201C",
  "rdquo": "\u201D",
  "times": "\u00D7",
  "divide": "\u00F7",
  "deg": "\u00B0",
  "plusmn": "\u00B1",
  "middot": "\u00B7",
  "bull": "\u2022",
  "euro": "\u20AC",
  "pound": "\u00A3",
  "yen": "\u00A5",
  "cent": "\u00A2",
  "sect": "\u00A7",
  "para": "\u00B6",
  "larr": "\u2190",
  "rarr": "\u2192",
  "uarr": "\u2191",
  "darr": "\u2193",
  "check": "\u2713",
  "checkmark": "\u2713",
  "cross": "\u2717",
};

const PUNCT = new Set(ASCII_PUNCT);

/**
 * Rewrite escapes and character references outside code. `completed:
 * false` returns `text` unchanged so a streaming bubble stays plain.
 */
export function protectMarkdownEscapes(text: string, completed = true): string {
  if (!completed || !text) return text;
  if (!text.includes("\\") && !text.includes("&")) return text;
  const blocked = blockedRanges(text);
  let out = "";
  let i = 0;
  let bi = 0;
  while (i < text.length) {
    if (bi < blocked.length && i >= blocked[bi]!.start && i < blocked[bi]!.end) {
      out += text.slice(i, blocked[bi]!.end);
      i = blocked[bi]!.end;
      bi += 1;
      continue;
    }
    while (bi < blocked.length && i >= blocked[bi]!.end) bi += 1;
    const ch = text[i] ?? "";
    if (ch === "\\" && i + 1 < text.length && PUNCT.has(text[i + 1] ?? "")) {
      out += escapeToken(text[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "&") {
      const ref = readReference(text, i);
      if (ref) {
        out += escapeToken(ref.value);
        i = ref.next;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Paint tokens as characters. A string with no token is unchanged. */
export function restoreMarkdownEscapes(text: string): string {
  if (!text) return text;
  const encoded = /%C2%A7%C2%A7SBE/i.test(text);
  if (!text.includes("§§SBE") && !encoded) return text;
  let out = text;
  if (out.includes("§§SBE")) {
    out = out.replace(ESCAPE_TOKEN, (raw, hex: string) => decodeHex(hex) ?? raw);
  }
  if (encoded) {
    out = out.replace(ESCAPE_TOKEN_ENCODED, (raw, hex: string) => decodeHex(hex) ?? raw);
  }
  return out;
}

function escapeToken(value: string): string {
  let hex = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    hex += cp.toString(16).toUpperCase().padStart(6, "0");
  }
  return `§§SBE${hex}§§`;
}

/**
 * Hide a literal from the markdown parser. `restoreMarkdownEscapes`
 * paints it again. Same token as a backslash escape.
 */
export function stashMarkdownText(value: string): string {
  return escapeToken(value);
}

function decodeHex(hex: string): string | null {
  if (hex.length % 6 !== 0) return null;
  let out = "";
  for (let i = 0; i < hex.length; i += 6) {
    const cp = Number.parseInt(hex.slice(i, i + 6), 16);
    if (!Number.isFinite(cp) || cp > 0x10ffff) return null;
    out += String.fromCodePoint(cp);
  }
  return out;
}

/**
 * CommonMark / micromark numeric reference. Disallowed controls,
 * surrogates, noncharacters, and out-of-range values are U+FFFD.
 * Tab, line feed, form feed, carriage return, and space pass through.
 */
export function decodeNumericReference(code: number): string {
  if (
    code < 9 ||
    code === 11 ||
    (code > 13 && code < 32) ||
    (code > 126 && code < 160) ||
    (code > 55295 && code < 57344) ||
    (code > 64975 && code < 65008) ||
    (code & 65535) === 65535 ||
    (code & 65535) === 65534 ||
    code > 1114111
  ) {
    return "\uFFFD";
  }
  return String.fromCodePoint(code);
}

function readReference(
  src: string,
  i: number,
): { value: string; next: number } | null {
  if (src[i] !== "&") return null;
  if (src[i + 1] === "#") return readNumeric(src, i);
  let j = i + 1;
  let name = "";
  while (j < src.length && name.length < 31 && isNameChar(src[j] ?? "")) {
    name += src[j];
    j += 1;
  }
  if (!name || src[j] !== ";" || !Object.prototype.hasOwnProperty.call(NAMED, name)) {
    return null;
  }
  return { value: NAMED[name] ?? "", next: j + 1 };
}

function readNumeric(
  src: string,
  i: number,
): { value: string; next: number } | null {
  let j = i + 2;
  let hex = false;
  if (src[j] === "x" || src[j] === "X") {
    hex = true;
    j += 1;
  }
  const max = hex ? 6 : 7;
  const start = j;
  while (j < src.length && j - start < max && isRefDigit(src[j] ?? "", hex)) j += 1;
  if (j === start || src[j] !== ";") return null;
  const code = Number.parseInt(src.slice(start, j), hex ? 16 : 10);
  if (!Number.isFinite(code)) return null;
  return { value: decodeNumericReference(code), next: j + 1 };
}

function isNameChar(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
}

function isRefDigit(ch: string, hex: boolean): boolean {
  if (ch >= "0" && ch <= "9") return true;
  if (!hex) return false;
  return (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

/** Fences, inline code, and indented code blocks stay literal. */
function blockedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const indented = indentedCodeRanges(src, fences);
  return mergeRanges([...fences, ...codes, ...indented]);
}

/**
 * Spans the raw-HTML pass must not rewrite. Same ranges as
 * `protectMarkdownEscapes`: fences, inline code, indented code.
 */
export function opaqueMarkdownRanges(src: string): Range[] {
  return blockedRanges(src);
}

/**
 * A top-level indented code block (blank line, then a line indented
 * four or more columns). List continuations that micromark still
 * treats as paragraphs are left for the inline parser when they are
 * not indented code. Fences are skipped; those lines are already
 * blocked.
 */
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
      if (inCode) {
        if (!blank && indent < 4) {
          ranges.push({ start: codeStart, end: i });
          inCode = false;
        }
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

/** Column of the first non-space, or null when the line is blank. */
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
