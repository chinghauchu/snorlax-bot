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
 * v1.62: a bare http(s) autolink uses the same GFM extended-autolink
 * delimiter as `www.`. Trailing `?`, `!`, `.`, `,`, `:`, `*`, `_`, and
 * `~` stay outside. A trailing `)` stays outside only when parentheses
 * are unbalanced. A trailing entity-like `&hl;` stays outside. `<`
 * ends the link. A trailing `]`, `}`, or curly quote on http(s) still
 * stays outside, as v0.82 already did.
 * v1.71: the http(s) scan keeps an interior apostrophe, quote,
 * backtick, or greater-than, the same way `www.` and cmark-gfm already
 * do. It stops at whitespace or `<`. A trailing `'` or `"` is still
 * peeled by that delimiter. A `>` that closes `<https://...>` stays
 * outside the link.
 * v1.45: GFM extended email autolinks on a completed assistant reply.
 * `foo@bar.baz` is a `mailto:` link whose text is the address. A
 * `mailto:` prefix stays in the text. `xmpp:` is not linked. Pass
 * `emails: true` only for that completed reply; user text and a
 * streaming bubble do not.
 * v1.85: the http(s) scan uses cmark-gfm's domain rule. An underscore
 * in either of the last two segments (ten segments or fewer) is not
 * a link. The character before the scheme cannot be an ASCII letter.
 * The first host character cannot be punctuation. A trailing
 * entity-like run is letters only, so `&hl;` stays outside and
 * `&hl1;` keeps the digits. An extended email must end in a letter.
 * Only the exact prefix `mailto:` is part of the link; `MAILTO:`
 * stays outside the address. `ftp:` and `xmpp:` stay plain.
 * v1.99: a real HTML character reference is stashed before this
 * scan. A trailing `§§SBE` token is the decoded character of a
 * reference the delimiter already trimmed, so it stays outside
 * the link. A `§§SBL` token is source text cmark keeps inside
 * the URL (`&copy;` in the path, `&#38` before a trimmed
 * semicolon, a backslash). That token is not peeled.
 * v2.00: the href percent-encodes the way cmark-gfm's HTML
 * renderer does (`houdini_escape_href`). The visible text is
 * unchanged. A `]` that stays inside a `www.` link is `%5D`.
 * Non-ASCII is UTF-8 `%HH`. `&` and `'` stay characters.
 * Keep in lockstep with `ios/SnorlaxBot/WebLinks.swift`.
 */

import { encodeCmarkHref } from "./markdownLinkDest.ts";

export type WebPiece =
  | { type: "text"; value: string }
  | { type: "link"; value: string };

/** v0.82 closers that are not part of the GFM extended-autolink set. */
const LEGACY_HTTP_TRAIL = new Set(["]", "}", "\u201c", "\u201d", "\u2018", "\u2019"]);

const CLOSER_TO_OPEN: Record<string, string> = {
  "]": "[",
  "}": "{",
};

/**
 * v1.74: a pointy-bracket link destination may contain spaces and
 * tabs. URL parsers reject those, and a literal backslash or angle
 * bracket in that destination is not a URL character. Percent-encode
 * just those. An already-encoded `%20` is left as written.
 */
export function encodeLinkDestination(dest: string): string {
  let out = "";
  for (const ch of dest) {
    if (ch === " ") out += "%20";
    else if (ch === "\t") out += "%09";
    else if (ch === "\\") out += "%5C";
    else if (ch === "<") out += "%3C";
    else if (ch === ">") out += "%3E";
    else out += ch;
  }
  return out;
}

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
 * (GFM). A bare email or `mailto:` email gains `mailto:`. http(s) text
 * is already absolute.
 */
export function linkHref(visible: string): string {
  // v2.00: cmark stores the autolink URL, then percent-encodes it
  // when writing the href. The visible run is still `visible`.
  let href = visible;
  if (visible.startsWith("www.")) href = `http://${visible}`;
  else {
    const mail = emailHref(visible);
    if (mail) href = mail;
  }
  return encodeCmarkHref(href);
}

/**
 * `mailto:` plus the address when `visible` is a GFM extended email,
 * or already starts with `mailto:`. Otherwise null.
 */
export function emailHref(visible: string): string | null {
  const address = emailAddressOf(visible);
  if (!address) return null;
  return `mailto:${address}`;
}

/**
 * Address inside a `mailto:` URL when it is a GFM extended email.
 * A query or a fragment is rejected. CommonMark addresses without a
 * dot in the domain stay on the angle-bracket path.
 */
export function extendedMailtoAddress(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "mailto:") return null;
  if (url.search || url.hash) return null;
  let address = url.pathname.replace(/^\/+/, "");
  if (!address) address = href.replace(/^mailto:/i, "").replace(/^\/+/, "");
  try {
    address = decodeURIComponent(address);
  } catch {
    return null;
  }
  if (!isExtendedEmail(address)) return null;
  return address;
}

/**
 * GFM extended email. Local part is alphanumeric or `.` `-` `_` `+`.
 * Domain labels are alphanumeric or `-` `_`, at least one dot, and the
 * address does not end in `-` or `_`. `+` is only allowed before `@`.
 */
export function isExtendedEmail(address: string): boolean {
  const at = address.indexOf("@");
  if (at <= 0 || address.indexOf("@", at + 1) >= 0) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (!isEmailLocal(local) || !isEmailDomain(domain)) return false;
  return true;
}

/**
 * Split plain message text into literal runs and bare links.
 * `streaming` leaves a URL that still touches the end of the buffer as
 * text. Closed inline code and fenced code (including an unclosed fence,
 * which runs to the end) are never links.
 */
export function splitWebUrls(
  text: string,
  opts?: { streaming?: boolean; emails?: boolean },
): WebPiece[] {
  const streaming = opts?.streaming ?? false;
  const emails = opts?.emails ?? false;
  const http = splitHttp(text, streaming);
  const pieces: WebPiece[] = [];
  http.forEach((piece, index) => {
    if (piece.type === "link") {
      pieces.push(piece);
      return;
    }
    const tail = streaming && index === http.length - 1;
    const www = splitWww(piece.value, tail);
    if (!emails) {
      pieces.push(...www);
      return;
    }
    www.forEach((part, wwwIndex) => {
      if (part.type === "link") {
        pieces.push(part);
        return;
      }
      const emailTail = tail && wwwIndex === www.length - 1;
      pieces.push(...splitEmails(part.value, emailTail));
    });
  });
  if (pieces.length === 0 || pieces.map((piece) => piece.value).join("") !== text) {
    return [{ type: "text", value: text }];
  }
  return pieces;
}

function splitHttp(text: string, streaming: boolean): WebPiece[] {
  const blocked = codeRanges(text);
  // v1.71: stop at whitespace or `<` only. `'`, `"`, `` ` ``, and `>`
  // stay in the path unless the v1.62 delimiter peels a trailing quote.
  const pattern = /https?:\/\/[^\s<]+/gi;
  const pieces: WebPiece[] = [];
  let last = 0;
  let cursor = 0;
  while (cursor < text.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    if (!match) break;
    const idx = match.index;
    const scanned = match[0];
    if (inRanges(blocked, idx)) {
      cursor = idx + 1;
      continue;
    }
    // v1.85: cmark rewinds ASCII letters into the scheme. `foohttp://`
    // is not http. A digit or punctuation before the scheme still is.
    if (idx > 0 && isAsciiAlpha(text[idx - 1]!)) {
      cursor = idx + 1;
      continue;
    }
    const scheme = schemeLength(scanned);
    const hostStart = idx + scheme;
    // The first character after `://` must be a host character.
    // `http://-example.com`, `http://.com`, and `http://[::1]/` are not.
    if (hostStart >= text.length || !isAutolinkHostChar(text[hostStart]!)) {
      cursor = idx + 1;
      continue;
    }
    // Same domain scan as `www.`, but a dot is not required (`http://localhost`).
    if (checkDomain(text, hostStart, true) == null) {
      cursor = hostStart;
      continue;
    }
    const raw = clipAngleCloser(text, idx, scanned);
    if (streaming && idx + raw.length === text.length) break;
    const url = trimTrailingPunctuation(raw);
    if (!isSafeWebUrl(stripEscapeTokens(url))) {
      cursor = idx + schemeLength(scanned);
      continue;
    }
    if (idx > last) pieces.push({ type: "text", value: text.slice(last, idx) });
    pieces.push({ type: "link", value: url });
    last = idx + url.length;
    cursor = last;
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  if (pieces.length === 0) pieces.push({ type: "text", value: text });
  return pieces;
}

function schemeLength(raw: string): number {
  return raw.toLowerCase().startsWith("https://") ? "https://".length : "http://".length;
}

/**
 * A `>` that closes `<https://...>` stays outside the link. A bare
 * `https://example.com/a>b` keeps the `>`.
 */
function clipAngleCloser(text: string, index: number, raw: string): string {
  if (index <= 0 || text[index - 1] !== "<") return raw;
  const gt = raw.indexOf(">");
  if (gt < 0) return raw;
  return raw.slice(0, gt);
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
    if (!isSafeWebUrl(stripEscapeTokens(linkHref(value)))) {
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
 * cmark-gfm `check_domain`. An underscore in either of the last two
 * segments rejects the link when there are ten dots or fewer. More
 * than ten dots still links, so a long name cannot force quadratic
 * work. `allowShort` is the http(s) scan: a host with no dot
 * (`localhost`) is allowed. `www.` passes false and still needs a dot.
 * Returns the index where the domain scan stopped.
 */
function checkDomain(text: string, start: number, allowShort = false): number | null {
  const size = text.length - start;
  if (!allowShort && size < 4) return null;
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
    } else if (!isAutolinkHostChar(c) && c !== "-") {
      break;
    }
    i += 1;
  }
  if ((uscore1 > 0 || uscore2 > 0) && np <= 10) return null;
  if (allowShort || np > 0) return start + i;
  return null;
}

/** cmark ASCII punctuation, including symbols such as `$` `+` `<` `=`. */
const CMARK_ASCII_PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/**
 * cmark-gfm `is_valid_hostchar`: not a space and not punctuation.
 * ASCII uses cmark's punctuation set. Other characters use the
 * Unicode punctuation category. `-` is punctuation here; the domain
 * scan allows it on its own.
 */
function isAutolinkHostChar(ch: string): boolean {
  if (!ch || isWwwSpace(ch) || /^\p{Zs}$/u.test(ch)) return false;
  if (CMARK_ASCII_PUNCT.includes(ch) || /^\p{P}$/u.test(ch)) return false;
  return true;
}

function isAsciiAlpha(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * v1.99: spans of bare http(s) and www autolinks on raw source, after
 * the trailing-punctuation trim. A trailing `&copy;` is not included,
 * so the escape pass can decode it outside the link. Character
 * references inside the span stay source text. Emails are not spans.
 */
export function extendedAutolinkRanges(text: string): Array<{ start: number; end: number }> {
  if (!text) return [];
  const pieces = splitWebUrls(text, { emails: false });
  const ranges: Array<{ start: number; end: number }> = [];
  let offset = 0;
  for (const piece of pieces) {
    if (piece.type === "link") ranges.push({ start: offset, end: offset + piece.value.length });
    offset += piece.value.length;
  }
  return ranges;
}

/** A decoded-character stash the escape pass left in the text. */
const ESCAPE_TOKEN_TAIL = /§§SBE(?:[0-9A-F]{6})+§§$/;

function trailingEscapeToken(text: string, start: number, end: number): number | null {
  const match = ESCAPE_TOKEN_TAIL.exec(text.slice(start, end));
  if (!match) return null;
  return end - match[0].length;
}

function stripEscapeTokens(value: string): string {
  return value.replace(/§§SB[EL](?:[0-9A-F]{6})+§§/g, "");
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
    const tokenAt = trailingEscapeToken(text, start, end);
    if (tokenAt != null) {
      end = tokenAt;
      continue;
    }
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
      // cmark walks letters only. `&hl;` drops the entity. `&hl1;`
      // keeps the digits and drops the semicolon.
      let k = end - 2;
      while (k > start && isAsciiAlpha(text[k]!)) k -= 1;
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

/**
 * v1.62: GFM extended-autolink delimiter for a bare http(s) URL.
 * `autolinkDelim` is the same pass `www.` already uses. v0.82 still
 * peels a trailing `]`, `}`, or curly quote after that pass.
 */
function trimTrailingPunctuation(url: string): string {
  const lower = url.toLowerCase();
  const min = lower.startsWith("https://")
    ? "https://".length
    : lower.startsWith("http://")
      ? "http://".length
      : url.length;
  let end = url.length;
  while (end > min) {
    const gfm = autolinkDelim(url, 0, end);
    if (gfm < end) {
      end = gfm;
      continue;
    }
    const ch = url[end - 1]!;
    if (!LEGACY_HTTP_TRAIL.has(ch)) break;
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

type EmailHit = { start: number; end: number; value: string };

/**
 * GFM extended email autolink. A trailing `.` stays outside. An
 * address that still touches the end of a streaming buffer stays
 * plain. Code spans, fences, and indented code stay plain.
 */
function splitEmails(text: string, streaming: boolean): WebPiece[] {
  const blocked = emailBlocked(text);
  const pieces: WebPiece[] = [];
  let last = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const hit = nextEmail(text, cursor, blocked, streaming);
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

function nextEmail(
  text: string,
  from: number,
  blocked: Array<[number, number]>,
  streaming: boolean,
): EmailHit | null {
  let i = from;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) return null;
    if (inRanges(blocked, at)) {
      i = at + 1;
      continue;
    }
    let local = at;
    while (local > 0 && isEmailLocalChar(text[local - 1]!) && !inRanges(blocked, local - 1)) {
      local -= 1;
    }
    if (local === at) {
      i = at + 1;
      continue;
    }
    const domainEnd = readEmailDomain(text, at + 1, blocked);
    if (domainEnd == null || !isExtendedEmail(text.slice(local, domainEnd))) {
      i = at + 1;
      continue;
    }
    if (streaming && domainEnd === text.length) return null;
    const visible = mailtoPrefixStart(text, local, blocked);
    if (visible === local && local > 0 && text[local - 1] === ":") {
      if (!isMailtoCaseVariant(text, local - 1)) {
        i = at + 1;
        continue;
      }
    }
    return { start: visible, end: domainEnd, value: text.slice(visible, domainEnd) };
  }
  return null;
}

function emailAddressOf(visible: string): string | null {
  let address = visible;
  if (visible.length >= 7 && visible.slice(0, 7).toLowerCase() === "mailto:") {
    address = visible.slice(7);
  }
  if (!isExtendedEmail(address)) return null;
  return address;
}

function isEmailLocal(local: string): boolean {
  if (!local) return false;
  for (const ch of local) {
    if (!isEmailLocalChar(ch)) return false;
  }
  return true;
}

function isEmailDomain(domain: string): boolean {
  // cmark requires the last character to be a letter. `foo@bar.com2`
  // and `foo@bar.b2` stay plain. A digit earlier in a label stays.
  if (!domain || !isAsciiAlpha(domain[domain.length - 1]!)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label) return false;
    for (const ch of label) {
      if (!isEmailDomainChar(ch)) return false;
    }
  }
  return true;
}

function isEmailLocalChar(ch: string): boolean {
  return isAlnum(ch) || ch === "." || ch === "-" || ch === "_" || ch === "+";
}

function isEmailDomainChar(ch: string): boolean {
  return isAlnum(ch) || ch === "-" || ch === "_";
}

/** Domain after `@`, or null when it has no dot. Trailing `.` stays out. */
function readEmailDomain(
  text: string,
  start: number,
  blocked: Array<[number, number]>,
): number | null {
  let j = start;
  let labels = 0;
  let dots = 0;
  if (j >= text.length || inRanges(blocked, j) || !isEmailDomainChar(text[j]!)) return null;
  while (j < text.length && !inRanges(blocked, j)) {
    if (isEmailDomainChar(text[j]!)) {
      if (labels === dots) labels += 1;
      j += 1;
      continue;
    }
    if (
      text[j] === "." &&
      j + 1 < text.length &&
      !inRanges(blocked, j + 1) &&
      isEmailDomainChar(text[j + 1]!)
    ) {
      dots += 1;
      j += 1;
      continue;
    }
    break;
  }
  if (dots < 1 || labels < 2) return null;
  return j;
}

/** Include a leading `mailto:` when it is its own token. */
function mailtoPrefixStart(
  text: string,
  localStart: number,
  blocked: Array<[number, number]>,
): number {
  if (localStart < 7) return localStart;
  const prefixStart = localStart - 7;
  // Exact `mailto:` only. `MAILTO:` is not this prefix.
  if (text.slice(prefixStart, localStart) !== "mailto:") return localStart;
  if (inRanges(blocked, prefixStart)) return localStart;
  if (prefixStart > 0 && isAlnum(text[prefixStart - 1]!)) return localStart;
  return prefixStart;
}

/**
 * `MAILTO:` and `Mailto:` are not the prefix, but the address after
 * them is still an email. `xmpp:` and `notmailto:` stay plain.
 */
function isMailtoCaseVariant(text: string, colon: number): boolean {
  let i = colon;
  while (i > 0 && isAsciiAlpha(text[i - 1]!)) i -= 1;
  const scheme = text.slice(i, colon);
  return scheme.length === 6 && scheme.toLowerCase() === "mailto" && scheme !== "mailto";
}

function emailBlocked(text: string): Array<[number, number]> {
  const fences = codeRanges(text);
  return fences.concat(indentedEmailRanges(text, fences));
}

/** Indented code (blank line, then 4 columns) so an address there stays plain. */
function indentedEmailRanges(
  text: string,
  fences: Array<[number, number]>,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let inCode = false;
  let codeStart = 0;
  let prevBlank = true;
  let i = 0;
  while (i <= text.length) {
    const nl = text.indexOf("\n", i);
    const end = nl < 0 ? text.length : nl;
    const inFence = fences.some(([start, stop]) => i >= start && i < stop);
    if (inFence) {
      if (inCode) {
        ranges.push([codeStart, i]);
        inCode = false;
      }
      prevBlank = false;
    } else {
      const line = text.slice(i, end);
      const indent = emailIndent(line);
      const blank = line.trim() === "";
      if (inCode && !blank && indent < 4) {
        ranges.push([codeStart, i]);
        inCode = false;
      }
      if (!inCode && prevBlank && !blank && indent >= 4) {
        inCode = true;
        codeStart = i;
      }
      prevBlank = blank;
    }
    if (nl < 0) break;
    i = nl + 1;
  }
  if (inCode) ranges.push([codeStart, text.length]);
  return ranges;
}

function emailIndent(line: string): number {
  let columns = 0;
  for (const ch of line) {
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}
