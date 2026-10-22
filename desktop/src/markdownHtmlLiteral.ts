// SPDX-License-Identifier: Apache-2.0

/**
 * v1.60: raw HTML stays literal text in a completed assistant
 * LEFT `kind=message`.
 *
 * Setext headings already shipped in v1.44. ATX closing hashes
 * (`## Title ##`, `# C#`, `# foo#`, a closing run escaped as
 * `\#`) already match CommonMark in react-markdown and in
 * cmark-gfm. Nested `***bold italic***` and `___bold italic___`
 * already render as bold italic on both. This cut is the
 * remaining mismatch: desktop shows an inline tag as characters,
 * and the iOS parser drops it.
 *
 * The whole tag is stashed in a `§§SBE` token, then painted back
 * as text. A character reference inside the tag is already its
 * own token; restore unwraps that too (v1.61), so the character
 * shows and is not markdown syntax. Characters inside the tag stay literal, including
 * `*` in an attribute and the body of an inline comment.
 * Inline tags and type 7 (`<br>`, `<kbd>`, `x<y>`, a mid-line
 * comment) are stashed. A type 1–6 HTML block that starts a
 * line stays raw so a list or quote still ends there (v1.58).
 *
 * Code spans, fenced code, indented code, angle autolinks, and
 * link destinations are left alone. Streaming (`completed:
 * false`) returns the source unchanged. Copy controls keep
 * markdown source — this module does not copy. No animation.
 * No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownHtmlLiteral.swift`.
 */

import { opaqueMarkdownRanges, stashMarkdownText } from "./markdownEscape.ts";
import { htmlBlockInterrupts, htmlUntilBlockEnd } from "./markdownList.ts";
import type { Range } from "./math.ts";

/** Never animate, including when Reduce Motion is off. */
export function htmlLiteralAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Stash inline and type-7 raw HTML outside code and link
 * destinations. `completed: false` returns `text` unchanged.
 */
export function literalizeRawHtml(text: string, completed = true): string {
  if (!completed || !text || !text.includes("<")) return text;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const next = rewrite(src);
  if (next === src) return text.includes("\r") ? src : text;
  return next;
}

function rewrite(src: string): string {
  const opaque = opaqueMarkdownRanges(src);
  const blocked = mergeRanges([...opaque, ...htmlBlockRanges(src, opaque)]);
  let out = "";
  let i = 0;
  let bi = 0;
  let depth = 0;
  while (i < src.length) {
    if (bi < blocked.length && i >= blocked[bi]!.start && i < blocked[bi]!.end) {
      out += src.slice(i, blocked[bi]!.end);
      i = blocked[bi]!.end;
      bi += 1;
      continue;
    }
    while (bi < blocked.length && i >= blocked[bi]!.end) bi += 1;
    const ch = src[i] ?? "";
    if (depth > 0) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "]" && src[i + 1] === "(") {
      out += "](";
      depth = 1;
      i += 2;
      continue;
    }
    if (ch === "<") {
      const end = htmlTagEnd(src, i);
      if (end > i && !overlaps(i, end, blocked)) {
        out += stashMarkdownText(src.slice(i, end));
        i = end;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * A type 1–6 HTML block, from the opening line through the line
 * before whatever follows the block. The `<` stays so the parser
 * still ends a list or a quote there. Type 7 is not included.
 */
function htmlBlockRanges(src: string, opaque: Range[]): Range[] {
  const lines = lineSpans(src);
  const texts = lines.map((line) => line.text);
  const ranges: Range[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (covered(line.start, opaque) || !htmlBlockInterrupts(line.text)) {
      index += 1;
      continue;
    }
    const until = htmlUntilBlockEnd(texts, index, true);
    let next = until;
    if (next == null) {
      next = index + 1;
      while (next < lines.length && !isBlankLine(lines[next]!.text)) next += 1;
    }
    const end = next < lines.length ? lines[next]!.start : src.length;
    if (end > line.start) ranges.push({ start: line.start, end });
    index = Math.max(next, index + 1);
  }
  return ranges;
}

function lineSpans(src: string): { start: number; end: number; text: string }[] {
  const lines: { start: number; end: number; text: string }[] = [];
  let i = 0;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const end = nl < 0 ? src.length : nl;
    lines.push({ start: i, end, text: src.slice(i, end) });
    if (nl < 0) break;
    i = nl + 1;
  }
  return lines;
}

function isBlankLine(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function covered(index: number, ranges: Range[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function overlaps(start: number, end: number, ranges: Range[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
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

/**
 * End of a CommonMark raw HTML tag starting at `i`, or -1.
 * Comments, CDATA, processing instructions, and uppercase
 * declarations count. A tag name is an ASCII letter, then
 * letters, digits, and hyphens. Attributes follow the spec,
 * including one line ending in the whitespace.
 */
function htmlTagEnd(src: string, i: number): number {
  if (src[i] !== "<") return -1;
  if (src.startsWith("<!--", i)) {
    const close = src.indexOf("-->", i + 2);
    return close < 0 ? -1 : close + 3;
  }
  if (src.startsWith("<![CDATA[", i)) {
    const close = src.indexOf("]]>", i + 9);
    return close < 0 ? -1 : close + 3;
  }
  if (src.startsWith("<?", i)) {
    const close = src.indexOf("?>", i + 2);
    return close < 0 ? -1 : close + 2;
  }
  if (src[i + 1] === "!" && isUpper(src[i + 2] ?? "")) {
    const close = src.indexOf(">", i + 3);
    return close < 0 ? -1 : close + 1;
  }
  let j = i + 1;
  const closing = src[j] === "/";
  if (closing) j += 1;
  if (!isLetter(src[j] ?? "")) return -1;
  j += 1;
  while (isTagNameChar(src[j] ?? "")) j += 1;
  if (closing) {
    j = skipWs(src, j);
    if (src[j] !== ">") return -1;
    return j + 1;
  }
  for (;;) {
    const afterWs = skipWs(src, j);
    if (afterWs === j) break;
    const nameEnd = attrNameEnd(src, afterWs);
    if (nameEnd < 0) {
      j = afterWs;
      break;
    }
    j = nameEnd;
    const eq = skipWs(src, j);
    if (src[eq] !== "=") continue;
    const valEnd = attrValueEnd(src, skipWs(src, eq + 1));
    if (valEnd < 0) return -1;
    j = valEnd;
  }
  j = skipWs(src, j);
  if (src[j] === "/") {
    j += 1;
    j = skipWs(src, j);
  }
  if (src[j] !== ">") return -1;
  return j + 1;
}

/** Spaces, tabs, and at most one line ending. */
function skipWs(src: string, i: number): number {
  let j = i;
  let line = false;
  while (j < src.length) {
    const ch = src[j];
    if (ch === " " || ch === "\t") {
      j += 1;
      continue;
    }
    if (ch === "\n" && !line) {
      line = true;
      j += 1;
      continue;
    }
    break;
  }
  return j;
}

function attrNameEnd(src: string, i: number): number {
  if (!isAttrNameStart(src[i] ?? "")) return -1;
  let j = i + 1;
  while (isAttrNameChar(src[j] ?? "")) j += 1;
  return j;
}

function attrValueEnd(src: string, i: number): number {
  const ch = src[i] ?? "";
  if (ch === "'" || ch === '"') {
    const close = src.indexOf(ch, i + 1);
    return close < 0 ? -1 : close + 1;
  }
  if (!ch || isUnquotedStop(ch)) return -1;
  let j = i + 1;
  while (j < src.length && !isUnquotedStop(src[j] ?? "")) j += 1;
  return j;
}

function isLetter(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}

function isUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

function isTagNameChar(ch: string): boolean {
  return isLetter(ch) || (ch >= "0" && ch <= "9") || ch === "-";
}

function isAttrNameStart(ch: string): boolean {
  return isLetter(ch) || ch === "_" || ch === ":";
}

function isAttrNameChar(ch: string): boolean {
  return isAttrNameStart(ch) || (ch >= "0" && ch <= "9") || ch === "." || ch === "-";
}

function isUnquotedStop(ch: string): boolean {
  return (
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === '"' ||
    ch === "'" ||
    ch === "=" ||
    ch === "<" ||
    ch === ">" ||
    ch === "`"
  );
}
