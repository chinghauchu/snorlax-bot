// SPDX-License-Identifier: Apache-2.0

/**
 * v1.40: CommonMark backslash escapes and HTML character references
 * on a completed assistant LEFT `kind=message`.
 *
 * A backslash before ASCII punctuation becomes that character and
 * must not start emphasis, a link, a list, or any other construct.
 * Named references (the HTML5 set cmark-gfm uses) and decimal / hex
 * numeric references decode to their characters. Unknown names and
 * broken references stay literal. A numeric reference that is zero,
 * a surrogate, a noncharacter, a disallowed control, or past
 * U+10FFFF becomes U+FFFD, matching CommonMark.
 * v1.90: titles and image alts share this lookup, so `&ouml;` and
 * `&ngE;` decode there too. A fence info string is not a code body;
 * the language label keeps the decoded word.
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
 * v1.61: a raw-HTML stash can wrap one of these tokens. Restoring
 * repeats until the character shows, including inside a tag or an
 * inline comment. The character is still not markdown syntax.
 * Streaming (`completed: false`) returns the source unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * v1.67: before the early return, `__init__`-style identifiers are
 * stashed so a word-boundary dunder stays literal. `__strong__`
 * is not one of those names.
 * v1.68: BMP Unicode symbols are stashed in the same pass so `*`
 * flanking matches on both parsers. `*£50*` still emphasizes.
 * v1.69: a numeric reference with more digits than CommonMark
 * allows (8 or more decimal, 7 or more hex) is stashed as those
 * characters. cmark-gfm would turn `&#87654321;` into U+FFFD and
 * `&#x0001F600;` into an emoji. micromark already left them
 * literal. In-range references still decode.
 * No animation. No new HTTP.
 * v1.79: a link or image destination is left for the destination
 * pass. `&#38;` and `&#x27;` there must reach the markdown parser
 * so the href matches cmark-gfm. Ordinary text still decodes here.
 * v1.91: a backslash inside an angle autolink or raw HTML stays a
 * backslash. cmark-gfm does not treat it as an escape there.
 * An autolink is copied whole, so `&amp;` inside the URL stays
 * the source characters too. A raw HTML tag or HTML block still
 * decodes a character reference (v1.61). `\<` before a tag is
 * still an escape, so the following text is not raw HTML.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownEscape.swift`.
 */

import { CMARK_NAMED_ENTITIES } from "./markdownCmarkEntities.ts";
import { htmlTagEnd } from "./markdownHtmlLiteral.ts";
import { linkDestinationSpans } from "./markdownLinkDest.ts";
import { htmlBlockEnd } from "./markdownList.ts";
import { protectSymbolFlanks } from "./markdownSymbol.ts";
import { protectIntrawordUnderscores } from "./markdownUnderscore.ts";
import { fenceRanges, inRange, inlineCodeRanges, type Range } from "./math.ts";

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

const PUNCT = new Set(ASCII_PUNCT);

/**
 * Rewrite escapes and character references outside code. `completed:
 * false` returns `text` unchanged so a streaming bubble stays plain.
 */
export function protectMarkdownEscapes(text: string, completed = true): string {
  if (!completed || !text) return text;
  const prepared = protectSymbolFlanks(protectIntrawordUnderscores(text, true), true);
  if (!prepared.includes("\\") && !prepared.includes("&")) return prepared;
  const blocked = blockedRanges(prepared);
  // v1.91: raw HTML keeps a backslash, and still decodes `&`.
  const literal = slashLiteralRanges(prepared, blocked);
  let out = "";
  let i = 0;
  let bi = 0;
  let li = 0;
  while (i < prepared.length) {
    while (bi < blocked.length && i >= blocked[bi]!.end) bi += 1;
    while (li < literal.length && i >= literal[li]!.end) li += 1;
    if (bi < blocked.length && i >= blocked[bi]!.start && i < blocked[bi]!.end) {
      out += prepared.slice(i, blocked[bi]!.end);
      i = blocked[bi]!.end;
      bi += 1;
      continue;
    }
    if (li < literal.length && i >= literal[li]!.start && i < literal[li]!.end) {
      const end = literal[li]!.end;
      while (i < end) {
        while (bi < blocked.length && i >= blocked[bi]!.end) bi += 1;
        if (bi < blocked.length && i >= blocked[bi]!.start && blocked[bi]!.start < end) {
          const stop = Math.min(blocked[bi]!.end, end);
          out += prepared.slice(i, stop);
          i = stop;
          continue;
        }
        if (prepared[i] === "&") {
          const ref = readReference(prepared, i);
          if (ref && ref.next <= end) {
            out += escapeToken(ref.value);
            i = ref.next;
            continue;
          }
        }
        out += prepared[i] ?? "";
        i += 1;
      }
      li += 1;
      continue;
    }
    const ch = prepared[i] ?? "";
    if (ch === "\\" && i + 1 < prepared.length && PUNCT.has(prepared[i + 1] ?? "")) {
      out += escapeToken(prepared[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "&") {
      const ref = readReference(prepared, i);
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

/**
 * Paint tokens as characters. A string with no token is unchanged.
 * Repeats so a token wrapped by another stash (a raw HTML tag that
 * already held an entity token) paints the character, not the token.
 * Eight passes is past any wrap this pipeline builds.
 */
export function restoreMarkdownEscapes(text: string): string {
  if (!text) return text;
  let out = text;
  for (let pass = 0; pass < 8; pass += 1) {
    const encoded = /%C2%A7%C2%A7SBE/i.test(out);
    if (!out.includes("§§SBE") && !encoded) break;
    const before = out;
    if (out.includes("§§SBE")) {
      ESCAPE_TOKEN.lastIndex = 0;
      out = out.replace(ESCAPE_TOKEN, (raw, hex: string) => decodeHex(hex) ?? raw);
    }
    if (/%C2%A7%C2%A7SBE/i.test(out)) {
      ESCAPE_TOKEN_ENCODED.lastIndex = 0;
      out = out.replace(ESCAPE_TOKEN_ENCODED, (raw, hex: string) => decodeHex(hex) ?? raw);
    }
    if (out === before) break;
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

/** Named or numeric character reference at `index`, or null. */
export function readCharacterReference(
  src: string,
  index: number,
): { value: string; next: number } | null {
  return readReference(src, index);
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
  if (!name || src[j] !== ";" || !Object.prototype.hasOwnProperty.call(CMARK_NAMED_ENTITIES, name)) {
    return null;
  }
  return { value: CMARK_NAMED_ENTITIES[name] ?? "", next: j + 1 };
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
  while (j < src.length && isRefDigit(src[j] ?? "", hex)) j += 1;
  const digits = j - start;
  if (digits === 0 || src[j] !== ";") return null;
  // More digits than CommonMark allows is not a reference.
  // cmark-gfm still consumes it. Stash the source characters.
  if (digits > max) {
    return { value: src.slice(i, j + 1), next: j + 1 };
  }
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

/**
 * Fences, inline code, and indented code blocks stay literal.
 * v1.79: link and image destinations stay literal too, so a
 * character reference in the href is not decoded before the parser.
 */
function blockedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const indented = indentedCodeRanges(src, fences);
  const code = mergeRanges([...fences, ...codes, ...indented]);
  // v1.91: an angle autolink is not an escape context. Copy it
  // whole so `\*` and `&amp;` stay the source characters.
  return mergeRanges([...code, ...linkDestinationSpans(src), ...autolinkRanges(src, code)]);
}

/**
 * Raw HTML where a backslash stays, and a character reference
 * still decodes. HTML blocks and inline tags. Not code, not an
 * autolink, not a link destination.
 */
function slashLiteralRanges(src: string, blocked: Range[]): Range[] {
  const blocks = rawHtmlBlockRanges(src);
  const tags = inlineTagRanges(src, mergeRanges([...blocked, ...blocks]));
  return mergeRanges([...blocks, ...tags]);
}

const AUTOLINK_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/;
const AUTOLINK_EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** CommonMark angle autolinks. An escaped `\<` is not one. */
function autolinkRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (src[i] !== "<" || escapedAt(src, i)) {
      i += 1;
      continue;
    }
    const end = autolinkEnd(src, i);
    if (end == null) {
      i += 1;
      continue;
    }
    ranges.push({ start: i, end });
    i = end;
  }
  return ranges;
}

function autolinkEnd(src: string, start: number): number | null {
  let j = start + 1;
  while (j < src.length) {
    const ch = src[j] ?? "";
    if (ch === ">") break;
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "<" || code <= 32 || code === 127) return null;
    j += 1;
  }
  if (src[j] !== ">") return null;
  const inner = src.slice(start + 1, j);
  if (!inner || (!AUTOLINK_SCHEME.test(inner) && !AUTOLINK_EMAIL.test(inner))) return null;
  return j + 1;
}

type LineSpan = { text: string; start: number; nl: number };

/** cmark HTML blocks. A backslash in the block is not an escape. */
function rawHtmlBlockRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const lines = splitLineSpans(src);
  const texts = lines.map((line) => line.text);
  const ranges: Range[] = [];
  let para = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (fences.some((fence) => line.start >= fence.start && line.start < fence.end)) {
      para = false;
      i += 1;
      continue;
    }
    if (line.text.trim() === "$$") {
      para = false;
      i += 1;
      while (i < lines.length && lines[i]!.text.trim() !== "$$") i += 1;
      if (i < lines.length) i += 1;
      continue;
    }
    const end = htmlBlockEnd(texts, i, para);
    if (end != null && end > i) {
      const last = lines[end - 1]!;
      ranges.push({ start: line.start, end: last.nl < 0 ? src.length : last.nl });
      para = false;
      i = end;
      continue;
    }
    para = !isBlankLine(line.text) && !blockClosesParagraph(line.text, para);
    i += 1;
  }
  return ranges;
}

function splitLineSpans(src: string): LineSpan[] {
  const parts = src.split("\n");
  const lines: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const text = parts[i] ?? "";
    const nl = i + 1 < parts.length ? start + text.length : -1;
    lines.push({ text, start, nl });
    start += text.length + 1;
  }
  return lines;
}

function inlineTagRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (src[i] === "<" && !escapedAt(src, i)) {
      const end = htmlTagEnd(src, i);
      if (end > i) {
        ranges.push({ start: i, end });
        i = end;
        continue;
      }
    }
    i += 1;
  }
  return ranges;
}

function escapedAt(src: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i -= 1) count += 1;
  return count % 2 === 1;
}

function isBlankLine(line: string): boolean {
  return contentIndent(line) == null;
}

/** A line that ends an open paragraph, or is not a paragraph itself. */
function blockClosesParagraph(line: string, para: boolean): boolean {
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) return true;
  if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) return true;
  const indent = contentIndent(line);
  return !para && indent != null && indent >= 4;
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
