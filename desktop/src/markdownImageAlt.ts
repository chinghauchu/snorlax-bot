// SPDX-License-Identifier: Apache-2.0

/**
 * v1.77: cmark-gfm image alt text on a completed assistant
 * LEFT `kind=message`.
 *
 * An image description is parsed as inlines. The alt attribute,
 * the accessibility label, and the fallback when the image fails
 * are that text with the markup removed. Emphasis, strong,
 * strikethrough, and code spans contribute only their text.
 * A nested link or image contributes its text, not its URL.
 * A soft break or a hard break is one space. A code span turns
 * its line endings into spaces and strips one surrounding space
 * when the span is not all spaces. Backslash escapes and
 * character references decode. An unknown reference stays
 * literal. Inside a code span they stay literal too.
 *
 * `~~` is strikethrough (a run of exactly two tildes). A longer
 * run stays the characters. `~text~` is not strikethrough here;
 * cmark-gfm leaves those tildes, and the single-tilde promotion
 * does not see them after this pass stashes the alt.
 *
 * Only an image that will load is rewritten. javascript:, data:,
 * and the other literal schemes stay the original characters.
 * The rewritten alt is one stash token so a later escape, math,
 * or tilde pass cannot treat the flattened text as syntax.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source. No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownImageAlt.swift`.
 */

import { ASCII_PUNCT, readCharacterReference, stashMarkdownText } from "./markdownEscape.ts";
import { readCommonMarkTitle } from "./markdownLinkTitleForm.ts";
import { htmlTagEnd } from "./markdownHtmlLiteral.ts";
import { findInlineImages } from "./markdownImage.ts";

const AUTOLINK_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/;
const AUTOLINK_EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

type TextTok = { kind: "text"; value: string };
type MarkTok = { kind: "mark"; value: string };
type DelimTok = {
  kind: "delim";
  ch: "*" | "_" | "~";
  count: number;
  orig: number;
  canOpen: boolean;
  canClose: boolean;
};
type Tok = TextTok | MarkTok | DelimTok;

type Opener = { tokenIndex: number; image: boolean };

/**
 * Plain-text alt for one image description (the characters
 * between `[` and `]`, not including the brackets).
 */
export function flattenImageAlt(description: string): string {
  if (!description) return "";
  const src = description.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return renderTokens(scan(src));
}

/**
 * Rewrite loadable images so the parser's alt is the flattened
 * text. `completed: false` returns `text` unchanged.
 */
export function prepareImageAlts(text: string, completed = true): string {
  if (!completed || !text || !text.includes("![")) return text;
  const hits = findInlineImages(text);
  if (hits.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const hit of hits) {
    const altStart = hit.start + 2;
    const altEnd = altStart + hit.alt.length;
    if (altStart < cursor || altEnd > text.length) continue;
    out += text.slice(cursor, altStart);
    if (hit.kind === "literal") out += text.slice(altStart, altEnd);
    else {
      const flat = flattenImageAlt(hit.alt);
      out += flat ? stashMarkdownText(flat) : "";
    }
    cursor = altEnd;
  }
  out += text.slice(cursor);
  return out;
}

function renderTokens(tokens: Tok[]): string {
  applyEmphasis(tokens);
  let out = "";
  for (const tok of tokens) {
    if (tok.kind === "delim") out += tok.ch.repeat(Math.max(0, tok.count));
    else out += tok.value;
  }
  return out;
}

function scan(src: string): Tok[] {
  const tokens: Tok[] = [];
  const stack: Opener[] = [];
  let noLinkOpeners = false;

  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === "text") last.value += value;
    else tokens.push({ kind: "text", value });
  };

  const pushOpener = (image: boolean) => {
    // A mark does not merge into the previous text token, so the
    // label tokens stay after this index when the bracket closes.
    tokens.push({ kind: "mark", value: image ? "![" : "[" });
    stack.push({ tokenIndex: tokens.length - 1, image });
    if (!image) noLinkOpeners = false;
  };

  let i = 0;
  while (i < src.length) {
    if (src[i] === "`") {
      const code = readCodeSpan(src, i);
      if (code) {
        pushText(code.content);
        i = code.next;
        continue;
      }
      let n = 0;
      while (src[i + n] === "`") n += 1;
      pushText("`".repeat(n));
      i += n;
      continue;
    }
    const ch = src[i] ?? "";
    if (ch === "\\" && i + 1 < src.length) {
      const next = src[i + 1] ?? "";
      if (next === "\n") {
        pushText(" ");
        i += 2;
        continue;
      }
      if (ASCII_PUNCT.includes(next)) {
        pushText(next);
        i += 2;
        continue;
      }
    }
    if (ch === "<") {
      const auto = autolinkEnd(src, i);
      if (auto != null) {
        pushText(src.slice(i + 1, auto - 1));
        i = auto;
        continue;
      }
      const html = htmlTagEnd(src, i);
      if (html > i) {
        pushText(src.slice(i, html));
        i = html;
        continue;
      }
    }
    if (ch === "&") {
      const ref = readCharacterReference(src, i);
      if (ref) {
        pushText(ref.value);
        i = ref.next;
        continue;
      }
    }
    if (ch === "\n") {
      const last = tokens[tokens.length - 1];
      if (last && last.kind === "text" && / {2,}$/.test(last.value)) {
        last.value = last.value.replace(/ +$/, "");
      }
      pushText(" ");
      i += 1;
      continue;
    }
    if (ch === "!" && src[i + 1] === "[") {
      pushOpener(true);
      i += 2;
      continue;
    }
    if (ch === "[") {
      pushOpener(false);
      i += 1;
      continue;
    }
    if (ch === "]") {
      const opener = stack.pop();
      const end = opener ? matchInlineEnd(src, i) : null;
      if (!opener || end == null || (!opener.image && noLinkOpeners)) {
        pushText("]");
        i += 1;
        continue;
      }
      const label = tokens.splice(opener.tokenIndex + 1);
      const text = renderTokens(label);
      tokens[opener.tokenIndex] = { kind: "text", value: text };
      if (!opener.image) noLinkOpeners = true;
      i = end;
      continue;
    }
    if (ch === "*" || ch === "_" || ch === "~") {
      let n = 1;
      while (src[i + n] === ch) n += 1;
      const strike = ch === "~";
      if (!strike || n === 2) {
        const flags = flanking(src, i, n, ch);
        if (flags.canOpen || flags.canClose) {
          tokens.push({
            kind: "delim",
            ch,
            count: n,
            orig: n,
            canOpen: flags.canOpen,
            canClose: flags.canClose,
          });
          i += n;
          continue;
        }
      }
      pushText(ch.repeat(n));
      i += n;
      continue;
    }
    pushText(ch);
    i += 1;
  }
  return tokens;
}

function flanking(
  src: string,
  i: number,
  n: number,
  ch: "*" | "_" | "~",
): { canOpen: boolean; canClose: boolean } {
  const before = i === 0 ? "\n" : (src[i - 1] ?? "\n");
  const after = i + n >= src.length ? "\n" : (src[i + n] ?? "\n");
  const afterWs = isWs(after);
  const beforeWs = isWs(before);
  const afterPunct = isPunct(after);
  const beforePunct = isPunct(before);
  const left = !afterWs && (!afterPunct || beforeWs || beforePunct);
  const right = !beforeWs && (!beforePunct || afterWs || afterPunct);
  if (ch === "_") {
    return {
      canOpen: left && (!right || beforePunct),
      canClose: right && (!left || afterPunct),
    };
  }
  return { canOpen: left, canClose: right };
}

function isWs(ch: string): boolean {
  return /^\s$/u.test(ch);
}

function isPunct(ch: string): boolean {
  return /^[\p{P}\p{S}]$/u.test(ch);
}

type Delim = {
  ch: string;
  num: number;
  orig: number;
  canOpen: boolean;
  canClose: boolean;
  token: DelimTok;
  prev: Delim | null;
  next: Delim | null;
};

/** Drop matched `*` / `_` / `~~` delimiters. Unmatched marks stay. */
function applyEmphasis(tokens: Tok[]): void {
  let head: Delim | null = null;
  let tail: Delim | null = null;
  for (const tok of tokens) {
    if (tok.kind !== "delim") continue;
    const delim: Delim = {
      ch: tok.ch,
      num: tok.count,
      orig: tok.orig,
      canOpen: tok.canOpen,
      canClose: tok.canClose,
      token: tok,
      prev: tail,
      next: null,
    };
    if (tail) tail.next = delim;
    else head = delim;
    tail = delim;
  }
  if (!head) return;

  const openersBottom: Array<Delim | null> = Array.from({ length: 20 }, () => null);
  let closer: Delim | null = head;
  let guard = 0;
  while (closer && guard < 10000) {
    guard += 1;
    if (!closer.canClose || closer.num <= 0) {
      closer = closer.next;
      continue;
    }
    const closerCh = closer.ch;
    const index =
      closerCh === "_"
        ? 2 + (closer.canOpen ? 3 : 0) + (closer.orig % 3)
        : closerCh === "*"
          ? 8 + (closer.canOpen ? 3 : 0) + (closer.orig % 3)
          : 14 + (closer.canOpen ? 3 : 0) + (closer.orig % 3);
    let opener: Delim | null = closer.prev;
    let openerFound = false;
    const floor = openersBottom[index] ?? null;
    while (opener && opener !== floor) {
      const odd =
        (closer.canOpen || opener.canClose) &&
        closer.orig % 3 !== 0 &&
        (opener.orig + closer.orig) % 3 === 0;
      const strike = closerCh === "~" && (opener.orig !== closer.orig || opener.orig !== 2);
      if (opener.ch === closerCh && opener.canOpen && opener.num > 0 && !odd && !strike) {
        openerFound = true;
        break;
      }
      opener = opener.prev;
    }
    const old = closer;
    if (!openerFound || !opener) {
      closer = closer.next;
      openersBottom[index] = old.prev;
      if (!old.canOpen) unlink(old, (next) => {
        if (head === old) head = next;
        if (tail === old) tail = old.prev;
      });
      continue;
    }
    const use = closer.num >= 2 && opener.num >= 2 ? 2 : 1;
    opener.num -= use;
    closer.num -= use;
    opener.token.count = opener.num;
    closer.token.count = closer.num;
    unlinkBetween(opener, closer);
    if (opener.num === 0) {
      unlink(opener, (next) => {
        if (head === opener) head = next;
        if (tail === opener) tail = opener.prev;
      });
    }
    if (closer.num === 0) {
      const removed = closer;
      const next = removed.next;
      unlink(removed, (after) => {
        if (head === removed) head = after;
        if (tail === removed) tail = removed.prev;
      });
      closer = next;
    }
  }
}

function unlink(delim: Delim, note: (next: Delim | null) => void): void {
  if (delim.prev) delim.prev.next = delim.next;
  if (delim.next) delim.next.prev = delim.prev;
  note(delim.next);
}

function unlinkBetween(bottom: Delim, top: Delim): void {
  bottom.next = top;
  top.prev = bottom;
}

function readCodeSpan(src: string, i: number): { content: string; next: number } | null {
  if (src[i] !== "`") return null;
  let n = 0;
  while (src[i + n] === "`") n += 1;
  let j = i + n;
  while (j < src.length) {
    if (src[j] === "\n") {
      let k = j + 1;
      while (src[k] === " " || src[k] === "\t") k += 1;
      if (src[k] === "\n") return null;
    }
    if (src[j] !== "`") {
      j += 1;
      continue;
    }
    let m = 0;
    while (src[j + m] === "`") m += 1;
    if (m === n) {
      let content = src.slice(i + n, j).replace(/\n/g, " ");
      // One leading and trailing space come off unless the span is all spaces.
      if (content.length >= 2 && content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) {
        content = content.slice(1, -1);
      }
      return { content, next: j + m };
    }
    j += m;
  }
  return null;
}

function autolinkEnd(src: string, start: number): number | null {
  if (src[start] !== "<") return null;
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

/** Index just after the inline link or image that closes at `]`. */
function matchInlineEnd(src: string, close: number): number | null {
  const open = skipLinkSpace(src, close + 1);
  if (open == null || src[open] !== "(") return null;
  const destAt = skipLinkSpace(src, open + 1);
  if (destAt == null) return null;
  const dest = readDestination(src, destAt);
  if (!dest) return null;
  let k = dest.next;
  const titleAt = skipLinkSpace(src, k);
  if (
    titleAt != null &&
    titleAt !== k &&
    (src[titleAt] === '"' || src[titleAt] === "'" || src[titleAt] === "(")
  ) {
    const title = readTitle(src, titleAt);
    if (!title) return null;
    k = title;
  }
  const end = skipLinkSpace(src, k);
  if (end == null || src[end] !== ")") return null;
  return end + 1;
}

function readDestination(src: string, i: number): { next: number } | null {
  if (src[i] === "<") {
    let j = i + 1;
    let value = "";
    while (j < src.length) {
      const ch = src[j] ?? "";
      if (ch === "\n" || ch === "<") return null;
      if (ch === "\\" && j + 1 < src.length && ASCII_PUNCT.includes(src[j + 1] ?? "")) {
        value += src[j + 1];
        j += 2;
        continue;
      }
      if (ch === ">") return value ? { next: j + 1 } : null;
      value += ch;
      j += 1;
    }
    return null;
  }
  let j = i;
  let value = "";
  let depth = 0;
  while (j < src.length) {
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
  return { next: j };
}

function readTitle(src: string, i: number): number | null {
  return readCommonMarkTitle(src, i)?.next ?? null;
}

function skipLinkSpace(src: string, i: number): number | null {
  let j = i;
  let newline = false;
  while (j < src.length) {
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
