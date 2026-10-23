// SPDX-License-Identifier: Apache-2.0

/**
 * v1.42: CommonMark inline images on a completed assistant
 * LEFT `kind=message`.
 *
 * `![alt](url)` and `![alt](url "title")` render as an image when
 * the URL is http(s) or an existing local attachment path
 * (`/v1/attachments/{id}`, `/v1/images/{id}`). Reference images
 * are already rewritten to that inline form by v1.39.
 * v1.77: the alt is the cmark-gfm plain-text flattening of the
 * description (`prepareImageAlts`). The accessibility label and
 * the failure fallback use that string. The title is the tooltip.
 * While the bytes load, the bubble shows a muted placeholder.
 * If they fail, the alt text (or the URL when the alt is empty)
 * shows as muted link-like text. A click or tap opens the v0.79
 * lightbox, except when the image is the content of a link: that
 * click opens the link destination, the same as any other link.
 *
 * javascript:, data:, file:, and any other scheme stay the
 * literal characters. Code spans, fenced code, indented code,
 * and math stay literal too. A code span inside a table cell
 * stays literal. Streaming (`completed: false`) returns the
 * text unchanged. Copy controls keep markdown source.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownImage.swift`.
 */

import { ASCII_PUNCT } from "./markdownEscape.ts";
import { commonMarkTitleHint, readCommonMarkTitle } from "./markdownLinkTitleForm.ts";
import { encodeLinkDestination } from "./linkify.ts";
import {
  fenceRanges,
  inRange,
  inlineCodeRanges,
  type Range,
} from "./math.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";

export type ImageSourceKind = "remote" | "attachment" | "literal";

export type MarkdownImageHit = {
  /** Index of `!`. */
  start: number;
  end: number;
  alt: string;
  url: string;
  title: string | null;
  kind: ImageSourceKind;
};

export type MarkdownImagePiece =
  | { type: "text"; value: string }
  | {
      type: "image";
      alt: string;
      url: string;
      title: string | null;
      /** http(s) destination when this image is the whole link. */
      link: string | null;
    };

const ATTACHMENT_PATH = /^\/v1\/(?:attachments|images)\/[A-Za-z0-9._~-]+$/;

/**
 * http(s) with a host, or a same-host attachment / legacy image
 * path the app already fetches with the session. Everything else
 * stays literal text.
 */
export function imageSourceKind(raw: string): ImageSourceKind {
  const url = encodeLinkDestination(raw.trim());
  if (!url) return "literal";
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "literal";
      if (!parsed.hostname) return "literal";
      return "remote";
    } catch {
      return "literal";
    }
  }
  const path = url.split(/[?#]/, 1)[0] ?? "";
  if (ATTACHMENT_PATH.test(path) && !path.includes("..")) return "attachment";
  return "literal";
}

/** Alt text, or the URL when the alt is empty. */
export function imageFallbackLabel(alt: string, url: string): string {
  const label = alt.trim();
  return label.length > 0 ? label : url;
}

export function literalImageText(alt: string, src: string, title: string): string {
  if (title) {
    const escaped = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `![${alt}](${src} "${escaped}")`;
  }
  return `![${alt}](${src})`;
}

export type ImageRenderPlan =
  | { type: "hidden" }
  | { type: "alt"; text: string }
  | { type: "literal"; text: string }
  | {
      type: "image";
      alt: string;
      src: string;
      title: string;
      kind: "remote" | "attachment";
    };

/** What a completed (or still-streaming) image node should paint. */
export function imageRenderPlan(
  completed: boolean,
  alt: string,
  src: string,
  title: string,
): ImageRenderPlan {
  if (!completed) return alt ? { type: "alt", text: alt } : { type: "hidden" };
  const kind = imageSourceKind(src);
  if (kind === "literal") return { type: "literal", text: literalImageText(alt, src, title) };
  return { type: "image", alt, src, title, kind };
}

/**
 * Escape punctuation in an unsafe image so a later escape pass
 * paints the original characters and the markdown parser does
 * not turn them into an image or a link.
 */
export function neutralizeUnsafeImages(text: string, completed = true): string {
  if (!completed || !text || !text.includes("![")) return text;
  const hits = findInlineImages(text);
  if (hits.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const hit of hits) {
    out += text.slice(cursor, hit.start);
    if (hit.kind === "literal") out += escapePunctuation(text.slice(hit.start, hit.end));
    else out += text.slice(hit.start, hit.end);
    cursor = hit.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Pull loadable images out of completed markdown. An image that
 * is the entire label of a link becomes an image piece whose
 * `link` is that destination, and the link syntax is not left
 * behind. An image that shares a label with other text stays in
 * the text so the link still parses. Unsafe images are escaped
 * in place. `completed: false` returns the text unchanged.
 */
export function splitMarkdownImages(text: string, completed = true): MarkdownImagePiece[] {
  if (!completed || !text) return [{ type: "text", value: text }];
  if (!text.includes("![")) return [{ type: "text", value: text }];
  const hits = findInlineImages(text);
  if (hits.length === 0) return [{ type: "text", value: text }];
  const blocked = blockedRanges(text);
  const links = findLinks(text, blocked);
  const pieces: MarkdownImagePiece[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.kind === "literal") continue;
    const wrap = imageLink(text, hit, links);
    if (wrap?.kind === "mixed") continue;
    const from = wrap ? wrap.start : hit.start;
    const to = wrap ? wrap.end : hit.end;
    if (from < cursor) continue;
    pushText(pieces, maskLiteralImages(text.slice(cursor, from), cursor, hits));
    pieces.push({
      type: "image",
      alt: decodeInline(hit.alt),
      url: hit.url,
      title: hit.title == null ? null : titleHint(hit.title),
      link: wrap?.href ? wrap.href : null,
    });
    cursor = to;
  }
  pushText(pieces, maskLiteralImages(text.slice(cursor), cursor, hits));
  if (pieces.length === 0) return [{ type: "text", value: text }];
  return pieces;
}

function maskLiteralImages(slice: string, offset: number, hits: MarkdownImageHit[]): string {
  if (!slice || hits.length === 0) return slice;
  let out = "";
  let cursor = 0;
  for (const hit of hits) {
    if (hit.kind !== "literal") continue;
    const start = hit.start - offset;
    const end = hit.end - offset;
    if (start < 0 || end > slice.length || start < cursor) continue;
    out += slice.slice(cursor, start);
    out += escapePunctuation(slice.slice(start, end));
    cursor = end;
  }
  out += slice.slice(cursor);
  return out;
}

function pushText(pieces: MarkdownImagePiece[], value: string): void {
  if (!value) return;
  const last = pieces[pieces.length - 1];
  if (last && last.type === "text") last.value += value;
  else pieces.push({ type: "text", value });
}

function imageLink(
  src: string,
  hit: MarkdownImageHit,
  links: LinkSpan[],
): { kind: "sole" | "mixed"; start: number; end: number; href: string } | null {
  for (const link of links) {
    if (hit.start < link.labelStart || hit.end > link.labelEnd) continue;
    const rest =
      src.slice(link.labelStart, hit.start) + src.slice(hit.end, link.labelEnd);
    if (rest.trim() !== "") {
      return { kind: "mixed", start: link.start, end: link.end, href: link.href };
    }
    // An unsafe destination is not a link. Drop the markers and
    // show the image, matching the existing safe-scheme rule.
    const opened = encodeLinkDestination(link.href);
    const href = imageSourceKind(opened) === "remote" ? opened : "";
    return { kind: "sole", start: link.start, end: link.end, href };
  }
  return null;
}

type LinkSpan = {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  href: string;
};

function findLinks(src: string, blocked: Range[]): LinkSpan[] {
  const links: LinkSpan[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, blocked) || src[i] !== "[" || isEscaped(src, i)) {
      i += 1;
      continue;
    }
    if (src[i - 1] === "!" && !isEscaped(src, i - 1)) {
      i += 1;
      continue;
    }
    const label = readBracket(src, i, blocked);
    if (!label) {
      i += 1;
      continue;
    }
    const open = skipLinkSpace(src, label.next, blocked);
    if (open == null || src[open] !== "(") {
      i += 1;
      continue;
    }
    const destAt = skipLinkSpace(src, open + 1, blocked);
    if (destAt == null) {
      i += 1;
      continue;
    }
    const dest = readDestination(src, destAt, blocked);
    if (!dest) {
      i += 1;
      continue;
    }
    let k = dest.next;
    const titleAt = skipLinkSpace(src, k, blocked);
    if (
      titleAt != null &&
      titleAt !== k &&
      (src[titleAt] === '"' || src[titleAt] === "'" || src[titleAt] === "(")
    ) {
      const title = readTitle(src, titleAt);
      if (!title) {
        i += 1;
        continue;
      }
      k = title.next;
    }
    const close = skipLinkSpace(src, k, blocked);
    if (close == null || src[close] !== ")") {
      i += 1;
      continue;
    }
    links.push({
      start: i,
      end: close + 1,
      labelStart: i + 1,
      labelEnd: label.next - 1,
      href: decodeInline(dest.value),
    });
    i = close + 1;
  }
  return links;
}

export function findInlineImages(text: string): MarkdownImageHit[] {
  const blocked = blockedRanges(text);
  const hits: MarkdownImageHit[] = [];
  let i = 0;
  while (i < text.length) {
    if (inRange(i, blocked) || !text.startsWith("![", i) || isEscaped(text, i)) {
      i += 1;
      continue;
    }
    const image = parseInlineImage(text, i, blocked);
    if (!image) {
      i += 1;
      continue;
    }
    hits.push(image);
    i = image.end;
  }
  return hits;
}

function parseInlineImage(src: string, bang: number, blocked: Range[]): MarkdownImageHit | null {
  const alt = readBracket(src, bang + 1, blocked);
  if (!alt) return null;
  const open = skipLinkSpace(src, alt.next, blocked);
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
    titleAt !== k &&
    (src[titleAt] === '"' || src[titleAt] === "'" || src[titleAt] === "(")
  ) {
    const read = readTitle(src, titleAt);
    if (!read) return null;
    title = read.value;
    k = read.next;
  }
  const close = skipLinkSpace(src, k, blocked);
  if (close == null || src[close] !== ")") return null;
  const decoded = decodeInline(dest.value);
  const opened = encodeLinkDestination(decoded);
  const kind = imageSourceKind(opened);
  return {
    start: bang,
    end: close + 1,
    alt: alt.raw,
    url: kind === "remote" ? opened : decoded,
    title,
    kind,
  };
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

function titleHint(raw: string): string | null {
  const hint = commonMarkTitleHint(raw);
  return hint.length > 0 ? hint : null;
}

function readTitle(src: string, i: number): { value: string; next: number } | null {
  // A title is a string. `\(` is an escaped parenthesis, not math.
  const read = readCommonMarkTitle(src, i);
  if (!read) return null;
  return { value: read.raw, next: read.next };
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

function escapePunctuation(raw: string): string {
  let out = "";
  for (const ch of raw) {
    out += ASCII_PUNCT.includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

function decodeInline(value: string): string {
  return restoreMarkdownEscapes(protectMarkdownEscapes(value, true));
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
      if (inCode && !blank && indent < 4) {
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
