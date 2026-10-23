// SPDX-License-Identifier: Apache-2.0

/**
 * v1.79: character references and backslash escapes inside link and
 * image destinations on a completed assistant LEFT `kind=message`.
 *
 * Checked v1.78 on main first. That cut rewrites link titles.
 * Destinations were still the platform parser's own rules, and the
 * escape pass ran first, so `&amp;` and `&copy;` inside a destination
 * did not percent-encode the way cmark-gfm does.
 *
 * cmark cleans a destination in this order: trim space, tab, LF, and
 * CR; decode HTML character references; then drop a backslash only
 * before ASCII punctuation. The href percent-encodes every unsafe
 * byte. `&` and `'` stay characters so the HTML attribute can escape
 * them as `&amp;` and `&#x27;`. This pass writes that href back into
 * the markdown: `&` as `&#38;`, `'` as `&#x27;`, other bytes as `%HH`.
 * The escape pass leaves those destination spans alone, so the parser
 * decodes `&#38;` once.
 *
 * A numeric reference with more digits than v1.69 allows (8 or more
 * decimal, 7 or more hex) stays the source characters. In-range
 * references, including the full HTML5 named set, decode. An unknown
 * name stays literal.
 *
 * Inline links, images, and link reference definitions are rewritten.
 * An invalid title is not a link, so its destination stays as written.
 * Code, fences, indented code, and math stay literal. Streaming
 * (`completed: false`) returns the text unchanged. Copy keeps
 * markdown source. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownLinkDest.swift`.
 */

import { CMARK_NAMED_ENTITIES } from "./markdownCmarkEntities.ts";
import { fenceRanges, inRange, inlineCodeRanges, type Range } from "./math.ts";

/** CommonMark ASCII punctuation. A backslash escapes exactly these. */
const ASCII_PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const PUNCT = new Set(ASCII_PUNCT);

/**
 * Bytes houdini_escape_href leaves as themselves. `&` and `'` are
 * omitted on purpose; the HTML renderer escapes those two.
 */
const HREF_SAFE = new Set(
  "!#$%()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~"
    .split("")
    .map((ch) => ch.charCodeAt(0)),
);

const FOOTNOTE_CHAR = /^[A-Za-z0-9_-]$/;

type DestHit = { start: number; end: number; raw: string };

/**
 * Logical destination cmark-gfm would store, before href escaping.
 * `raw` is the destination slice: inside `<>` for an angle form,
 * or the bare slice including backslashes.
 */
export function cmarkLinkHref(raw: string): string {
  const trimmed = trimCmark(raw);
  if (!trimmed) return "";
  return encodeCmarkHref(unescapeDestination(trimmed));
}

/**
 * Markdown for a cmark href. `&` and `'` are character references so
 * a later entity pass decodes them once. Angle brackets wrap a
 * destination a bare `(...)` could not hold.
 */
export function markdownDestination(encoded: string): string {
  const body = encoded.replaceAll("&", "&#38;").replaceAll("'", "&#x27;");
  if (!body || bareWouldBreak(body)) return `<${body}>`;
  return body;
}

/**
 * Rewrite link and image destinations, including a reference
 * definition, to the cmark-gfm href. `completed: false` returns
 * `text`. A destination that is already in that form is left as
 * written, so a second pass is a no-op.
 */
export function prepareLinkDestinations(text: string, completed = true): string {
  if (!completed || !text || !text.includes("[")) return text;
  const edits: { start: number; end: number; text: string }[] = [];
  for (const hit of destinationHits(text)) {
    const encoded = cmarkLinkHref(hit.raw);
    const original = text.slice(hit.start, hit.end);
    if (encoded === "" && original === "") continue;
    const replacement = markdownDestination(encoded);
    if (replacement === original) continue;
    edits.push({ start: hit.start, end: hit.end, text: replacement });
  }
  if (edits.length === 0) return text;
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    out += text.slice(cursor, edit.start);
    out += edit.text;
    cursor = edit.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Destination spans, including angle brackets. The escape pass and
 * the autolink pass skip these so `&#38;` is not decoded early and
 * `<javascript:...>` inside a destination is not stashed.
 */
export function linkDestinationSpans(text: string): Range[] {
  if (!text || !text.includes("[")) return [];
  return destinationHits(text)
    .filter((hit) => hit.end > hit.start)
    .map((hit) => ({ start: hit.start, end: hit.end }));
}

function destinationHits(text: string): DestHit[] {
  const blocked = blockedRanges(text);
  const blockedAt = (index: number) => inRange(index, blocked);
  const hits: DestHit[] = [];
  let i = 0;
  while (i < text.length) {
    if (blockedAt(i)) {
      i += 1;
      continue;
    }
    const footnote = footnoteBracketEnd(text, i);
    if (footnote != null) {
      i = footnote;
      continue;
    }
    const image = text.startsWith("![", i) && !isEscaped(text, i);
    if ((image || text[i] === "[") && !isEscaped(text, i)) {
      const bracketAt = image ? i + 1 : i;
      const next = takeInline(text, bracketAt, blockedAt, hits);
      i = next > bracketAt ? next : i + 1;
      continue;
    }
    i += 1;
  }
  pushDefinitions(text, blocked, blockedAt, hits);
  return hits;
}

function takeInline(
  src: string,
  bracketAt: number,
  blockedAt: (index: number) => boolean,
  hits: DestHit[],
): number {
  const label = readBracket(src, bracketAt, blockedAt);
  if (!label || isFootnoteLabel(label.raw)) return bracketAt + 1;
  const open = skipLinkSpace(src, label.next, blockedAt);
  if (open == null || src[open] !== "(") return bracketAt + 1;
  const destAt = skipLinkSpace(src, open + 1, blockedAt);
  if (destAt == null) return bracketAt + 1;
  if (src[destAt] === ")") {
    hits.push({ start: destAt, end: destAt, raw: "" });
    return destAt + 1;
  }
  const dest = scanLinkUrl(src, destAt);
  if (!dest) return bracketAt + 1;
  let cursor = dest.end;
  const titleAt = skipLinkSpace(src, cursor, blockedAt);
  if (titleAt != null && titleAt !== cursor && isTitleOpen(src[titleAt] ?? "")) {
    const title = readTitle(src, titleAt, blockedAt);
    if (!title) return bracketAt + 1;
    cursor = title.next;
  }
  const close = skipLinkSpace(src, cursor, blockedAt);
  if (close == null || src[close] !== ")") return bracketAt + 1;
  hits.push(dest);
  return close + 1;
}

function pushDefinitions(
  src: string,
  blocked: Range[],
  blockedAt: (index: number) => boolean,
  hits: DestHit[],
): void {
  let i = 0;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const end = nl < 0 ? src.length : nl;
    if (!inRange(i, blocked)) {
      const dest = definitionDest(src, i, blockedAt);
      if (dest && !hits.some((hit) => hit.start === dest.start)) hits.push(dest);
    }
    if (nl < 0) break;
    i = end + 1;
  }
}

function definitionDest(
  src: string,
  lineStart: number,
  blockedAt: (index: number) => boolean,
): DestHit | null {
  const eol = lineEnd(src, lineStart);
  const line = src.slice(lineStart, eol);
  let i = lineStart + quotePrefixLength(line);
  let spaces = 0;
  while (src[i] === " " && spaces < 4) {
    spaces += 1;
    i += 1;
  }
  if (spaces >= 4 || src[i] === "\t") return null;
  if (src[i] !== "[" || isEscaped(src, i) || blockedAt(i)) return null;
  const bracket = readBracket(src, i, blockedAt);
  if (!bracket || !validLabel(bracket.raw) || isFootnoteLabel(bracket.raw)) return null;
  let j = skipSpTab(src, bracket.next);
  if (src[j] !== ":") return null;
  const destAt = skipDestWs(src, j + 1, blockedAt);
  if (destAt == null) return null;
  const dest = scanLinkUrl(src, destAt);
  if (!dest) return null;
  j = dest.end;
  const titleAt = skipDestWs(src, j, blockedAt);
  if (titleAt != null && titleAt !== j && isTitleOpen(src[titleAt] ?? "")) {
    const title = readTitle(src, titleAt, blockedAt);
    if (!title) return null;
    j = title.next;
  }
  j = skipSpTab(src, j);
  if (j < src.length && src[j] !== "\n") return null;
  return dest;
}

function scanLinkUrl(src: string, offset: number): DestHit | null {
  if (offset >= src.length) return null;
  if (src[offset] === "<") {
    let i = offset + 1;
    let closed = false;
    while (i < src.length) {
      const ch = src[i] ?? "";
      if (ch === ">") {
        i += 1;
        closed = true;
        break;
      }
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\n" || ch === "<") return null;
      i += 1;
    }
    // cmark rejects an angle destination that ends the input.
    if (!closed || i >= src.length) return null;
    return { raw: src.slice(offset + 1, i - 1), start: offset, end: i };
  }
  let i = offset;
  let depth = 0;
  while (i < src.length) {
    const ch = src[i] ?? "";
    if (ch === "\\" && i + 1 < src.length && PUNCT.has(src[i + 1] ?? "")) {
      i += 2;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      i += 1;
      if (depth > 32) return null;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) break;
      depth -= 1;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (i === offset) return null;
      break;
    }
    i += 1;
  }
  if (i >= src.length) return null;
  return { raw: src.slice(offset, i), start: offset, end: i };
}

function readTitle(
  src: string,
  index: number,
  blockedAt: (index: number) => boolean,
): { next: number } | null {
  const open = src[index];
  if (open !== '"' && open !== "'" && open !== "(") return null;
  const close = open === "(" ? ")" : open;
  let j = index + 1;
  let raw = "";
  while (j < src.length) {
    if (blockedAt(j)) return null;
    const ch = src[j] ?? "";
    if (ch === "\0") return null;
    if (ch === "\\" && j + 1 < src.length) {
      const next = src[j + 1] ?? "";
      if (next !== "\0" && PUNCT.has(next)) {
        if (blockedAt(j + 1)) return null;
        raw += ch + next;
        j += 2;
        continue;
      }
    }
    if (open === "(" && ch === "(") return null;
    if (ch === close) {
      if (/\n[ \t]*\n/.test(raw)) return null;
      return { next: j + 1 };
    }
    raw += ch;
    j += 1;
  }
  return null;
}

function readBracket(
  src: string,
  open: number,
  blockedAt: (index: number) => boolean,
): { raw: string; next: number } | null {
  if (src[open] !== "[" || isEscaped(src, open) || blockedAt(open)) return null;
  let i = open + 1;
  let depth = 1;
  let raw = "";
  while (i < src.length) {
    if (blockedAt(i)) return null;
    const ch = src[i] ?? "";
    if (ch === "\\" && i + 1 < src.length) {
      raw += ch + src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "[") {
      depth += 1;
      raw += ch;
      i += 1;
      continue;
    }
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return { raw, next: i + 1 };
      raw += ch;
      i += 1;
      continue;
    }
    if (ch === "\n" && src[i + 1] === "\n") return null;
    raw += ch;
    i += 1;
  }
  return null;
}

function unescapeDestination(raw: string): string {
  let entities = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "&") {
      const ref = readEntity(raw, i);
      if (ref) {
        entities += ref.value;
        i = ref.next;
        continue;
      }
    }
    entities += raw[i] ?? "";
    i += 1;
  }
  let out = "";
  for (let j = 0; j < entities.length; j += 1) {
    const ch = entities[j] ?? "";
    if (ch === "\\" && j + 1 < entities.length && PUNCT.has(entities[j + 1] ?? "")) {
      out += entities[j + 1];
      j += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function readEntity(src: string, i: number): { value: string; next: number } | null {
  if (src[i] !== "&") return null;
  const next = src[i + 1] ?? "";
  if (next === "#") return readNumeric(src, i);
  const limit = Math.min(src.length, i + 1 + 32);
  for (let j = i + 1 + 2; j < limit; j += 1) {
    const ch = src[j] ?? "";
    if (ch === " ") break;
    if (ch === ";") {
      const name = src.slice(i + 1, j);
      const value = CMARK_NAMED_ENTITIES[name];
      if (value != null) return { value, next: j + 1 };
      break;
    }
  }
  return null;
}

function readNumeric(src: string, i: number): { value: string; next: number } | null {
  let j = i + 2;
  let hex = false;
  if (src[j] === "x" || src[j] === "X") {
    hex = true;
    j += 1;
  }
  const max = hex ? 6 : 7;
  const start = j;
  while (j < src.length && isRefDigit(src[j] ?? "", hex)) j += 1;
  const digits = j - start;
  if (digits === 0 || src[j] !== ";") return null;
  // v1.69: 8+ decimal digits and 7+ hex digits stay characters.
  if (digits > max) return null;
  let code = 0;
  const base = hex ? 16 : 10;
  for (let k = start; k < j; k += 1) {
    code = code * base + parseInt(src[k] ?? "0", base);
    if (code >= 0x110000) code = 0x110000;
  }
  if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code >= 0x110000) {
    return { value: "\uFFFD", next: j + 1 };
  }
  return { value: String.fromCodePoint(code), next: j + 1 };
}

function encodeCmarkHref(value: string): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    for (const byte of utf8Bytes(cp)) {
      if (byte === 0x26) out += "&";
      else if (byte === 0x27) out += "'";
      else if (HREF_SAFE.has(byte)) out += String.fromCharCode(byte);
      else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

function utf8Bytes(cp: number): number[] {
  if (cp === 0xfffe) return [0xfe];
  if (cp === 0xffff) return [0xff];
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) {
    return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  }
  return [
    0xf0 | (cp >> 18),
    0x80 | ((cp >> 12) & 0x3f),
    0x80 | ((cp >> 6) & 0x3f),
    0x80 | (cp & 0x3f),
  ];
}

function trimCmark(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isTrim(value[start] ?? "")) start += 1;
  while (end > start && isTrim(value[end - 1] ?? "")) end -= 1;
  return value.slice(start, end);
}

function isTrim(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function bareWouldBreak(body: string): boolean {
  if (!body) return true;
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] ?? "";
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "<" || ch === ">") {
      return true;
    }
    if (ch === "\\" && i + 1 < body.length && PUNCT.has(body[i + 1] ?? "")) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      if (depth > 32) return true;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) return true;
      depth -= 1;
    }
  }
  return depth !== 0;
}

function isTitleOpen(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === "(";
}

function isRefDigit(ch: string, hex: boolean): boolean {
  if (ch >= "0" && ch <= "9") return true;
  if (!hex) return false;
  return (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

function skipLinkSpace(
  src: string,
  i: number,
  blockedAt: (index: number) => boolean,
): number | null {
  let j = i;
  let newline = false;
  while (j < src.length) {
    if (blockedAt(j)) return null;
    const ch = src[j] ?? "";
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\v" || ch === "\f") {
      j += 1;
      continue;
    }
    if (ch === "\n" && !newline) {
      newline = true;
      j += 1;
      continue;
    }
    break;
  }
  return j;
}

function skipDestWs(
  src: string,
  i: number,
  blockedAt: (index: number) => boolean,
): number | null {
  let j = i;
  while (src[j] === " " || src[j] === "\t") j += 1;
  if (src[j] !== "\n") return j;
  const nextLine = j + 1;
  if (nextLine >= src.length || src[nextLine] === "\n") return null;
  if (blockedAt(nextLine)) return null;
  let k = nextLine;
  while (src[k] === " " || src[k] === "\t") k += 1;
  if (k >= src.length || src[k] === "\n") return null;
  return k;
}

function skipSpTab(src: string, i: number): number {
  let j = i;
  while (src[j] === " " || src[j] === "\t") j += 1;
  return j;
}

function lineEnd(src: string, i: number): number {
  const nl = src.indexOf("\n", i);
  return nl < 0 ? src.length : nl;
}

function quotePrefixLength(line: string): number {
  let i = 0;
  while (i < line.length) {
    let j = i;
    let spaces = 0;
    while (j < line.length && line[j] === " " && spaces < 3) {
      j += 1;
      spaces += 1;
    }
    if (line[j] !== ">") break;
    j += 1;
    if (line[j] === " ") j += 1;
    i = j;
  }
  return i;
}

function validLabel(raw: string): boolean {
  if (!raw || raw.length > 999) return false;
  let has = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    if (ch === "\\" && i + 1 < raw.length) {
      has = true;
      i += 1;
      continue;
    }
    if (ch === "[" || ch === "]") return false;
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") has = true;
  }
  return has;
}

function isFootnoteLabel(raw: string): boolean {
  if (!raw.startsWith("^") || raw.length < 2) return false;
  for (let i = 1; i < raw.length; i += 1) {
    if (!FOOTNOTE_CHAR.test(raw[i] ?? "")) return false;
  }
  return true;
}

function footnoteBracketEnd(src: string, open: number): number | null {
  if (src[open] !== "[" || src[open + 1] !== "^" || isEscaped(src, open)) return null;
  let j = open + 2;
  if (!FOOTNOTE_CHAR.test(src[j] ?? "")) return null;
  while (j < src.length && FOOTNOTE_CHAR.test(src[j] ?? "")) j += 1;
  if (src[j] !== "]") return null;
  const after = src[j + 1];
  if (after === "(" || after === ":") return null;
  return j + 1;
}

function isEscaped(src: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i -= 1) count += 1;
  return count % 2 === 1;
}

function blockedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const indented = indentedCodeRanges(src, fences);
  const skip = [...fences, ...codes, ...indented];
  return mergeRanges([...skip, ...mathRanges(src, skip)]);
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
      if (inCode && indent != null && indent < 4) {
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

function mathRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (src.startsWith("\\(", i)) {
      const close = src.indexOf("\\)", i + 2);
      if (close >= 0) {
        ranges.push({ start: i, end: close + 2 });
        i = close + 2;
        continue;
      }
    }
    if (src.startsWith("$$", i)) {
      const close = src.indexOf("$$", i + 2);
      if (close >= 0) {
        ranges.push({ start: i, end: close + 2 });
        i = close + 2;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
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
