// SPDX-License-Identifier: Apache-2.0

/**
 * v0.82: bare http:// and https:// in chat message text are links.
 * v1.34: GFM www autolinks (`www.example.com`) are links too. The
 * visible text stays `www...`; the opened URL is `http://` plus that
 * text. Trailing sentence punctuation stays outside the link. Balanced
 * parentheses inside a URL stay. Inline code and fenced code stay
 * plain. javascript:, file:, and any other scheme stay plain. While a
 * bubble is still streaming, a URL that reaches the end of the buffer
 * stays plain so a half-typed address is not a link.
 * Keep in lockstep with `ios/SnorlaxBot/WebLinks.swift`.
 */

export type WebPiece =
  | { type: "text"; value: string }
  | { type: "link"; value: string };

const TRAILING_PUNCT = ".,;:!?)]}'\"\u201c\u201d\u2018\u2019";

const CLOSER_TO_OPEN: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

/** http and https only. javascript:, file:, data:, and ftp: are not. */
export function isSafeWebUrl(href: string | undefined | null): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Destination opened for a visible link. www autolinks gain `http://`
 * (GFM). http(s) text is already absolute.
 */
export function linkHref(visible: string): string {
  if (visible.startsWith("www.")) return `http://${visible}`;
  return visible;
}

/**
 * Split plain message text into literal runs and bare links.
 * `streaming` leaves a URL that still touches the end of the buffer as
 * text. Closed inline code and fenced code (including an unclosed fence,
 * which runs to the end) are never links.
 */
export function splitWebUrls(
  text: string,
  opts?: { streaming?: boolean },
): WebPiece[] {
  const streaming = opts?.streaming ?? false;
  const http = splitHttp(text, streaming);
  const pieces: WebPiece[] = [];
  http.forEach((piece, index) => {
    if (piece.type === "link") {
      pieces.push(piece);
      return;
    }
    const tail = streaming && index === http.length - 1;
    pieces.push(...splitWww(piece.value, tail));
  });
  if (pieces.length === 0 || pieces.map((piece) => piece.value).join("") !== text) {
    return [{ type: "text", value: text }];
  }
  return pieces;
}

function splitHttp(text: string, streaming: boolean): WebPiece[] {
  const blocked = codeRanges(text);
  const pattern = /https?:\/\/[^\s<>"'`]+/gi;
  const pieces: WebPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const idx = match.index ?? 0;
    const raw = match[0];
    if (inRanges(blocked, idx)) continue;
    if (streaming && idx + raw.length === text.length) break;
    const url = trimTrailingPunctuation(raw);
    if (!isSafeWebUrl(url)) continue;
    if (idx > last) pieces.push({ type: "text", value: text.slice(last, idx) });
    pieces.push({ type: "link", value: url });
    last = idx + url.length;
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  if (pieces.length === 0) pieces.push({ type: "text", value: text });
  return pieces;
}

const WWW_TRAIL = new Set(["?", "!", ".", ",", ":", "*", "_", "~", "'", '"']);

type WwwHit = { start: number; end: number; value: string };

/** GFM extended www autolink. Visible text has no scheme. */
function splitWww(text: string, streaming: boolean): WebPiece[] {
  const blocked = codeRanges(text);
  const pieces: WebPiece[] = [];
  let last = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const hit = nextWww(text, cursor, blocked, streaming);
    if (!hit) break;
    if (hit.start > last) pieces.push({ type: "text", value: text.slice(last, hit.start) });
    pieces.push({ type: "link", value: hit.value });
    last = hit.end;
    cursor = hit.end;
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  if (pieces.length === 0) pieces.push({ type: "text", value: text });
  if (pieces.map((piece) => piece.value).join("") !== text) {
    return [{ type: "text", value: text }];
  }
  return pieces;
}

function nextWww(
  text: string,
  from: number,
  blocked: Array<[number, number]>,
  streaming: boolean,
): WwwHit | null {
  let i = from;
  while (i < text.length) {
    const idx = text.indexOf("www.", i);
    if (idx < 0) return null;
    if (inRanges(blocked, idx) || !wwwBoundary(text, idx)) {
      i = idx + 1;
      continue;
    }
    const domainEnd = checkDomain(text, idx);
    if (domainEnd == null) {
      i = idx + 4;
      continue;
    }
    let rawEnd = domainEnd;
    while (rawEnd < text.length && !isWwwSpace(text[rawEnd]!) && text[rawEnd] !== "<") {
      rawEnd += 1;
    }
    if (streaming && rawEnd === text.length) return null;
    const end = autolinkDelim(text, idx, rawEnd);
    if (end <= idx + 4) {
      i = idx + 4;
      continue;
    }
    const value = text.slice(idx, end);
    if (!isSafeWebUrl(linkHref(value))) {
      i = idx + 4;
      continue;
    }
    return { start: idx, end, value };
  }
  return null;
}

/** Start of text, whitespace, or GFM delimiters `*_~(` . */
function wwwBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1]!;
  if (prev === "*" || prev === "_" || prev === "~" || prev === "(") return true;
  return isWwwSpace(prev);
}

function isWwwSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

/**
 * cmark-gfm `check_domain`: at least one dot in `www.…`, and no
 * underscore in the last two segments (unless there are more than
 * ten dots). Returns the index where the domain scan stopped.
 */
function checkDomain(text: string, start: number): number | null {
  const size = text.length - start;
  if (size < 4) return null;
  let np = 0;
  let uscore1 = 0;
  let uscore2 = 0;
  let i = 1;
  while (i < size - 1) {
    if (text[start + i] === "\\" && i < size - 2) i += 1;
    const c = text[start + i]!;
    if (c === "_") {
      uscore2 += 1;
    } else if (c === ".") {
      uscore1 = uscore2;
      uscore2 = 0;
      np += 1;
    } else if (!isHostChar(c) && c !== "-") {
      break;
    }
    i += 1;
  }
  if ((uscore1 > 0 || uscore2 > 0) && np <= 10) return null;
  if (np === 0) return null;
  return start + i;
}

function isHostChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

/** GFM extended-autolink path trim: trailing punct, unmatched `)`, entities. */
function autolinkDelim(text: string, start: number, linkEnd: number): number {
  let end = linkEnd;
  let opening = 0;
  let closing = 0;
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === "(") opening += 1;
    else if (c === ")") closing += 1;
  }
  while (end > start) {
    const c = text[end - 1]!;
    if (c === ")") {
      if (closing <= opening) return end;
      closing -= 1;
      end -= 1;
      continue;
    }
    if (WWW_TRAIL.has(c)) {
      end -= 1;
      continue;
    }
    if (c === ";") {
      let k = end - 2;
      while (k > start && isAlnum(text[k]!)) k -= 1;
      if (k >= start && k < end - 2 && text[k] === "&") end = k;
      else end -= 1;
      continue;
    }
    return end;
  }
  return end;
}

function isAlnum(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function trimTrailingPunctuation(url: string): string {
  const lower = url.toLowerCase();
  const min = lower.startsWith("https://")
    ? "https://".length
    : lower.startsWith("http://")
      ? "http://".length
      : url.length;
  let end = url.length;
  while (end > min && TRAILING_PUNCT.includes(url[end - 1]!)) {
    const ch = url[end - 1]!;
    const open = CLOSER_TO_OPEN[ch];
    if (open) {
      const head = url.slice(0, end);
      if (countChar(head, open) >= countChar(head, ch)) break;
    }
    end -= 1;
  }
  return url.slice(0, end);
}

function countChar(value: string, ch: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === ch) count += 1;
  }
  return count;
}

function inRanges(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** Closed inline code, and fenced code through its closer or end of text. */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i < text.length) {
    if (isLineStart(text, i)) {
      const fence = readOpeningFence(text, i);
      if (fence) {
        const close = findClosingFence(text, fence.contentStart, fence.marker);
        const end = close ?? text.length;
        ranges.push([i, end]);
        i = end;
        continue;
      }
    }
    if (text[i] === "`") {
      let run = 0;
      while (i + run < text.length && text[i + run] === "`") run += 1;
      const close = findInlineClose(text, i + run, run);
      if (close != null) {
        ranges.push([i, close]);
        i = close;
        continue;
      }
      i += run;
      continue;
    }
    i += 1;
  }
  return ranges;
}

function isLineStart(text: string, index: number): boolean {
  return index === 0 || text[index - 1] === "\n";
}

function readOpeningFence(
  text: string,
  lineStart: number,
): { contentStart: number; marker: string } | null {
  let j = lineStart;
  let spaces = 0;
  while (j < text.length && text[j] === " ") {
    spaces += 1;
    j += 1;
    if (spaces > 3) return null;
  }
  const ch = text[j];
  if (ch !== "`" && ch !== "~") return null;
  let len = 0;
  while (j + len < text.length && text[j + len] === ch) len += 1;
  if (len < 3) return null;
  const marker = ch.repeat(len);
  const lineEnd = text.indexOf("\n", j + len);
  const infoEnd = lineEnd === -1 ? text.length : lineEnd;
  const info = stripCr(text.slice(j + len, infoEnd));
  if (ch === "`" && info.includes("`")) return null;
  const contentStart = lineEnd === -1 ? text.length : lineEnd + 1;
  return { contentStart, marker };
}

function findClosingFence(
  text: string,
  from: number,
  marker: string,
): number | null {
  let i = from;
  while (i <= text.length) {
    const lineEnd = text.indexOf("\n", i);
    const end = lineEnd === -1 ? text.length : lineEnd;
    if (isClosingFenceLine(text.slice(i, end), marker)) {
      return lineEnd === -1 ? text.length : lineEnd + 1;
    }
    if (lineEnd === -1) return null;
    i = lineEnd + 1;
  }
  return null;
}

function isClosingFenceLine(line: string, marker: string): boolean {
  const body = stripCr(line);
  let j = 0;
  let spaces = 0;
  while (j < body.length && body[j] === " ") {
    spaces += 1;
    j += 1;
    if (spaces > 3) return false;
  }
  if (!body.startsWith(marker, j)) return false;
  let k = j + marker.length;
  const ch = marker[0]!;
  while (k < body.length && body[k] === ch) k += 1;
  for (let t = k; t < body.length; t++) {
    if (body[t] !== " " && body[t] !== "\t") return false;
  }
  return true;
}

function findInlineClose(text: string, from: number, run: number): number | null {
  let i = from;
  while (i < text.length) {
    if (text[i] !== "`") {
      i += 1;
      continue;
    }
    let len = 0;
    while (i + len < text.length && text[i + len] === "`") len += 1;
    if (len === run) return i + run;
    i += len;
  }
  return null;
}

function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
