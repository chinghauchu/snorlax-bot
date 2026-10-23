// SPDX-License-Identifier: Apache-2.0

/**
 * v1.46: CommonMark link titles on a completed assistant
 * LEFT `kind=message`.
 *
 * `[text](https://example.com "title")`, single quotes, and
 * `(title)` put that title on the link. Desktop shows it as the
 * anchor's hover tooltip (`title`) and accessibility hint
 * (`aria-description`). The v1.35 destination pill stays the URL.
 * iOS keeps the long-press preview as the URL and uses the title
 * as that preview's accessibility hint and tooltip line.
 *
 * A link with no title, or a title that is empty after whitespace
 * is collapsed, has no tooltip. Streaming (`completed: false`)
 * shows none. Unsafe schemes never become links, so they have no
 * tooltip either. Code spans, fenced code, indented code, and
 * math are not links. Copy controls keep markdown source.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownLinkTitle.swift`.
 */

import { safeLinkHref } from "./markdownAutolink.ts";
import {
  ASCII_PUNCT,
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape.ts";
import {
  fenceRanges,
  inRange,
  inlineCodeRanges,
  type Range,
} from "./math.ts";

export type InlineLink = {
  dest: string;
  label: string;
  /** Collapsed tooltip, or null when the link has no title. */
  title: string | null;
};

/** Label swap never animates, including when Reduce Motion is off. */
export function linkTitleAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Tooltip / accessibility hint for a parsed link title.
 * `completed: false` is empty so a streaming bubble stays plain.
 * Whitespace collapses. An empty result means no tooltip.
 */
export function linkTitleHint(
  title: string | null | undefined,
  completed = true,
): string {
  if (!completed || title == null) return "";
  const restored = restoreMarkdownEscapes(title).replace(/\s+/g, " ").trim();
  return restored;
}

/** Every inline link outside code and math, including unsafe schemes. */
export function inlineLinks(text: string): InlineLink[] {
  if (!text || !text.includes("[")) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocked = blockedRanges(src);
  const links: InlineLink[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, blocked) || src[i] !== "[" || isEscaped(src, i)) {
      i += 1;
      continue;
    }
    if (i > 0 && src[i - 1] === "!" && !isEscaped(src, i - 1)) {
      i += 1;
      continue;
    }
    const parsed = parseInlineLink(src, i, blocked);
    if (!parsed) {
      i += 1;
      continue;
    }
    links.push(parsed.link);
    i = parsed.end;
  }
  return links;
}

/**
 * Inline links the bubble will actually open: http(s) with a host,
 * or a `mailto:` email. Same rule as `MdLink`.
 */
export function renderedInlineLinks(text: string): InlineLink[] {
  return inlineLinks(text).filter((link) => safeLinkHref(link.dest).length > 0);
}

function parseInlineLink(
  src: string,
  start: number,
  blocked: Range[],
): { link: InlineLink; end: number } | null {
  const label = readBracket(src, start, blocked);
  if (!label) return null;
  const open = skipLinkSpace(src, label.next, blocked);
  if (open == null || src[open] !== "(") return null;
  const destAt = skipLinkSpace(src, open + 1, blocked);
  if (destAt == null) return null;
  const dest = readDestination(src, destAt, blocked);
  if (!dest) return null;
  let k = dest.next;
  let title: string | null = null;
  const titleAt = skipLinkSpace(src, k, blocked);
  if (
    titleAt != null &&
    (src[titleAt] === '"' || src[titleAt] === "'" || src[titleAt] === "(")
  ) {
    const read = readTitle(src, titleAt, blocked);
    if (!read) return null;
    title = read.value;
    k = read.next;
  }
  const close = skipLinkSpace(src, k, blocked);
  if (close == null || src[close] !== ")") return null;
  return {
    link: {
      dest: decodeInline(dest.value),
      label: decodeInline(label.raw),
      title: cleanTitle(title),
    },
    end: close + 1,
  };
}

function cleanTitle(raw: string | null): string | null {
  if (raw == null) return null;
  const hint = linkTitleHint(decodeInline(raw), true);
  return hint.length > 0 ? hint : null;
}

function decodeInline(value: string): string {
  return restoreMarkdownEscapes(protectMarkdownEscapes(value, true));
}

function readBracket(
  src: string,
  open: number,
  blocked: Range[],
): { raw: string; next: number } | null {
  if (src[open] !== "[") return null;
  if (isEscaped(src, open) || inRange(open, blocked)) return null;
  let i = open + 1;
  let depth = 1;
  let raw = "";
  while (i < src.length) {
    if (inRange(i, blocked)) return null;
    const ch = src[i] ?? "";
    if (ch === "\\" && i + 1 < src.length) {
      raw += src[i + 1] ?? "";
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

function readDestination(
  src: string,
  i: number,
  blocked: Range[],
): { value: string; next: number } | null {
  if (inRange(i, blocked)) return null;
  if (src[i] === "<") {
    let j = i + 1;
    let value = "";
    while (j < src.length) {
      if (inRange(j, blocked)) return null;
      const ch = src[j] ?? "";
      if (ch === "\n" || ch === "<") return null;
      // v1.74: spaces stay. A backslash escapes ASCII punctuation only.
      if (ch === "\\" && j + 1 < src.length && ASCII_PUNCT.includes(src[j + 1] ?? "")) {
        value += src[j + 1];
        j += 2;
        continue;
      }
      if (ch === ">") return value ? { value, next: j + 1 } : null;
      value += ch;
      j += 1;
    }
    return null;
  }
  let j = i;
  let value = "";
  let depth = 0;
  while (j < src.length) {
    if (inRange(j, blocked)) return null;
    const ch = src[j] ?? "";
    if (ch === "\\" && j + 1 < src.length) {
      value += src[j + 1];
      j += 2;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "<") break;
    if (ch === "(") {
      depth += 1;
      value += ch;
      j += 1;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) break;
      depth -= 1;
      value += ch;
      j += 1;
      continue;
    }
    value += ch;
    j += 1;
  }
  if (!value || depth !== 0) return null;
  return { value, next: j };
}

function readTitle(
  src: string,
  i: number,
  blocked: Range[],
): { value: string; next: number } | null {
  const open = src[i];
  const close = open === "(" ? ")" : open;
  if (open !== '"' && open !== "'" && open !== "(") return null;
  let j = i + 1;
  let value = "";
  while (j < src.length) {
    if (inRange(j, blocked)) return null;
    const ch = src[j] ?? "";
    if (ch === "\\" && j + 1 < src.length) {
      value += src[j + 1];
      j += 2;
      continue;
    }
    if (ch === close) return { value, next: j + 1 };
    value += ch;
    j += 1;
  }
  return null;
}

/** Spaces, tabs, and at most one newline. CommonMark link spacing. */
function skipLinkSpace(src: string, i: number, blocked: Range[]): number | null {
  let j = i;
  let newline = false;
  while (j < src.length) {
    if (inRange(j, blocked)) return null;
    const ch = src[j] ?? "";
    if (ch === " " || ch === "\t") {
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

function isEscaped(src: string, index: number): boolean {
  let count = 0;
  let i = index - 1;
  while (i >= 0 && src[i] === "\\") {
    count += 1;
    i -= 1;
  }
  return count % 2 === 1;
}

function blockedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const indented = indentedCodeRanges(src, fences);
  const math = mathRanges(src, [...fences, ...codes, ...indented]);
  return mergeRanges([...fences, ...codes, ...indented, ...math]);
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
