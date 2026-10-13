// SPDX-License-Identifier: Apache-2.0

/**
 * v0.82: bare http:// and https:// in chat message text are links.
 * Trailing sentence punctuation stays outside the link. Inline code and
 * fenced code stay plain. javascript:, file:, and any other scheme stay
 * plain. While a bubble is still streaming, a URL that reaches the end
 * of the buffer stays plain so a half-typed address is not a link.
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
 * Split plain message text into literal runs and bare http(s) links.
 * `streaming` leaves a URL that still touches the end of the buffer as
 * text. Closed inline code and fenced code (including an unclosed fence,
 * which runs to the end) are never links.
 */
export function splitWebUrls(
  text: string,
  opts?: { streaming?: boolean },
): WebPiece[] {
  const streaming = opts?.streaming ?? false;
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
