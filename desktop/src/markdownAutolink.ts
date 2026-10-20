// SPDX-License-Identifier: Apache-2.0

/**
 * v1.43: CommonMark angle-bracket autolinks on a completed assistant
 * LEFT `kind=message`.
 *
 * `<https://example.com/path>` is a link whose text is the URL.
 * `<user@example.com>` is a `mailto:` link whose text is the address.
 * The destination preview, the click, and the http(s) rules are the
 * ones already used for other links. A `mailto:` link is opened only
 * when the destination is `mailto:` plus that email and nothing else.
 *
 * An absolute URI with any other scheme (`javascript:`, `file:`,
 * `ftp:`, `data:`, `mailto:user@example.com` written as a URI) stays
 * the literal characters, brackets included. So does `<not a link>`,
 * a space inside the brackets, and a backslash-escaped `\<`.
 *
 * Code spans, fenced code, indented code, and math stay literal.
 * A code span in a table cell stays literal too. Streaming
 * (`completed: false`) returns the text unchanged. Copy controls
 * keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownAutolink.swift`.
 */

import { isSafeWebUrl } from "./linkify.ts";
import { stashMarkdownText } from "./markdownEscape.ts";
import { fenceRanges, inRange, inlineCodeRanges, type Range } from "./math.ts";

/**
 * CommonMark email autolink. The whole address must match.
 * A domain without a dot (`foo@bar`) is included, matching the spec.
 */
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** Scheme is 2–32 characters: letter, then letters, digits, `+`, `.`, `-`. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/;

/**
 * Destination a rendered link may open. http(s) use the existing
 * host check. `mailto:` is only an email address, with no query
 * and no fragment.
 */
export function safeLinkHref(href: string | null | undefined): string {
  if (!href) return "";
  if (isSafeWebUrl(href) || isSafeMailto(href)) return href;
  return "";
}

/** `mailto:user@example.com` and nothing after the address. */
export function isSafeMailto(href: string): boolean {
  return mailtoAddress(href) != null;
}

/** Email address inside a safe mailto URL, or null. */
export function mailtoAddress(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "mailto:") return null;
  if (url.search || url.hash) return null;
  let address = url.pathname.replace(/^\/+/, "");
  if (!address) {
    address = href.replace(/^mailto:/i, "").replace(/^\/+/, "");
  }
  try {
    address = decodeURIComponent(address);
  } catch {
    return null;
  }
  if (!EMAIL.test(address)) return null;
  return address;
}

/**
 * Replace unsafe absolute-URI autolinks with a literal token.
 * http(s) autolinks and email autolinks are left for the markdown
 * parser. `completed: false` returns `text` unchanged.
 */
export function prepareAngleAutolinks(text: string, completed = true): string {
  if (!completed || !text || !text.includes("<")) return text;
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
    while (bi < blocked.length && blocked[bi]!.end <= i) bi += 1;
    if (text[i] === "<" && !isEscaped(text, i)) {
      const end = unsafeAutolinkEnd(text, i);
      if (end != null) {
        out += stashMarkdownText(text.slice(i, end));
        i = end;
        continue;
      }
    }
    out += text[i] ?? "";
    i += 1;
  }
  return out;
}

/** True when `<...>` is an absolute URI autolink the safe-scheme rules reject. */
function unsafeAutolinkEnd(text: string, start: number): number | null {
  const close = readClose(text, start);
  if (close == null) return null;
  const inner = text.slice(start + 1, close);
  if (!inner || EMAIL.test(inner)) return null;
  if (!SCHEME.test(inner)) return null;
  if (isSafeWebUrl(inner)) return null;
  return close + 1;
}

/** Index of the closing `>`, or null when this is not an autolink candidate. */
function readClose(text: string, start: number): number | null {
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (ch === ">") return i;
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "<" || code <= 32 || code === 127) return null;
  }
  return null;
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
  const math = mathRanges(src, skip);
  return mergeRanges([...skip, ...math]);
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
