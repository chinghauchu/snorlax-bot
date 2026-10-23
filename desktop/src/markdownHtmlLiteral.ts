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
 * A type 7 tag that is not on the v1.75 allowlist (`x<y>`,
 * a mid-line comment) is stashed. A type 1–6 HTML block that
 * starts a line stays raw so a list or quote still ends
 * there (v1.58).
 *
 * Code spans, fenced code, indented code, angle autolinks, and
 * link destinations are left alone. Streaming (`completed:
 * false`) returns the source unchanged. Copy controls keep
 * markdown source — this module does not copy. No animation.
 * No new HTTP.
 *
 * v1.75: a bare inline `<br>`, `<kbd>`, `<sub>`, or `<sup>`
 * (no attributes, no event handlers) renders. `<br>` becomes
 * the same hard-break token v1.41 already paints. A paired
 * `<kbd>`, `<sub>`, or `<sup>` becomes a `§§SBO` / `§§SBC`
 * token that `applySafeInlineHtml` turns into that element
 * after the markdown parse, so `**bold**` inside still
 * emphasizes. An unmatched opener or closer stays the
 * characters. A tag with attributes, a comment, a script,
 * and a non-tag (`<3`, `a <b c`, `<not a tag>`, `1 < 2 > 0`)
 * stay literal text. Nothing in the tag is copied onto the
 * element.
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

/** v1.75: safe inline tags never animate either. */
export function safeInlineHtmlAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * The v1.41 hard-break placeholder. A bare `<br>` uses the same
 * token so both clients paint one line break. Kept as a literal
 * so this module does not import the hard-break pass.
 */
const SAFE_BREAK = "§§SBH§§";

const WRAP_TAGS = new Set(["kbd", "sub", "sup"]);

export type SafeInlineTag =
  | { kind: "br" }
  | { kind: "open"; tag: "kbd" | "sub" | "sup" }
  | { kind: "close"; tag: "kbd" | "sub" | "sup" }
  | { kind: "empty"; tag: "kbd" | "sub" | "sup" };

/**
 * A CommonMark tag that is safe to render. Attributes, event
 * handlers, and every other tag name return null. The caller
 * still has to know the slice is one tag; this does not scan
 * prose.
 */
export function classifySafeInline(raw: string): SafeInlineTag | null {
  if (raw.length < 3 || raw[0] !== "<" || raw[raw.length - 1] !== ">") return null;
  const body = raw.slice(1, -1).toLowerCase();
  if (isBreakBody(body)) return { kind: "br" };
  if (body.startsWith("/")) {
    const tag = wrapName(body.slice(1));
    return tag ? { kind: "close", tag } : null;
  }
  const empty = emptyWrap(body);
  if (empty) return { kind: "empty", tag: empty };
  const open = wrapName(body);
  return open ? { kind: "open", tag: open } : null;
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
        out += safeOrStash(src.slice(i, end));
        i = end;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return settleSafeTokens(out);
}

/**
 * A bare break or wrap tag becomes a render token. Every other
 * raw tag is stashed so the characters survive the parser.
 */
function safeOrStash(raw: string): string {
  const safe = classifySafeInline(raw);
  if (safe?.kind === "br") return SAFE_BREAK;
  if (safe?.kind === "empty") {
    return safeToken("O", `<${safe.tag}>`) + safeToken("C", `</${safe.tag}>`);
  }
  if (safe?.kind === "open") return safeToken("O", raw);
  if (safe?.kind === "close") return safeToken("C", raw);
  return stashMarkdownText(raw);
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

type WrapTag = "kbd" | "sub" | "sup";

function isBreakBody(body: string): boolean {
  if (!body.startsWith("br")) return false;
  let i = 2;
  i = skipSpace(body, i);
  if (body[i] === "/") {
    i += 1;
    i = skipSpace(body, i);
  }
  return i === body.length;
}

/** A wrap name and nothing but whitespace. A slash is not a name. */
function wrapName(body: string): WrapTag | null {
  const name = readName(body);
  if (!name || !WRAP_TAGS.has(name)) return null;
  const rest = body.slice(name.length);
  if (rest.includes("/")) return null;
  return onlySpace(rest) ? (name as WrapTag) : null;
}

function emptyWrap(body: string): WrapTag | null {
  const name = readName(body);
  if (!name || !WRAP_TAGS.has(name)) return null;
  let i = skipSpace(body, name.length);
  if (body[i] !== "/") return null;
  i = skipSpace(body, i + 1);
  return i === body.length ? (name as WrapTag) : null;
}

function readName(body: string): string {
  const first = body[0] ?? "";
  if (first < "a" || first > "z") return "";
  let i = 1;
  while (i < body.length) {
    const ch = body[i] ?? "";
    const ok = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "-";
    if (!ok) break;
    i += 1;
  }
  return body.slice(0, i);
}

function skipSpace(body: string, index: number): number {
  let i = index;
  while (i < body.length) {
    const ch = body[i];
    if (ch !== " " && ch !== "\t" && ch !== "\n") break;
    i += 1;
  }
  return i;
}

function onlySpace(body: string): boolean {
  return skipSpace(body, 0) === body.length;
}

function safeToken(kind: "O" | "C", raw: string): string {
  return `§§SB${kind}${encodeHex(raw)}§§`;
}

function encodeHex(value: string): string {
  let hex = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    hex += cp.toString(16).toUpperCase().padStart(6, "0");
  }
  return hex;
}

function decodeHex(hex: string): string | null {
  if (hex.length === 0 || hex.length % 6 !== 0) return null;
  let out = "";
  for (let i = 0; i < hex.length; i += 6) {
    const cp = Number.parseInt(hex.slice(i, i + 6), 16);
    if (!Number.isFinite(cp) || cp > 0x10ffff) return null;
    out += String.fromCodePoint(cp);
  }
  return out;
}

const SAFE_TOKEN = /§§SB([OC])((?:[0-9A-F]{6})+)§§/g;

type SafeHit = {
  kind: "O" | "C";
  raw: string;
  tag: WrapTag | "";
  start: number;
  end: number;
};

/**
 * Pair open and close tokens with a strict stack. A closer that
 * is not the current opener stays the original characters, and
 * so does an opener that never closes. Matched tokens stay so
 * the markdown parser can still see the text between them.
 */
function settleSafeTokens(src: string): string {
  const hits: SafeHit[] = [];
  SAFE_TOKEN.lastIndex = 0;
  for (const match of src.matchAll(SAFE_TOKEN)) {
    if (match.index == null) continue;
    const kind: "O" | "C" = match[1] === "C" ? "C" : "O";
    const raw = decodeHex(match[2] ?? "");
    if (raw == null) continue;
    const safe = classifySafeInline(raw);
    let tag: WrapTag | "" = "";
    if (safe && kind === "O" && safe.kind === "open") tag = safe.tag;
    if (safe && kind === "C" && safe.kind === "close") tag = safe.tag;
    hits.push({
      kind,
      raw,
      tag,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  if (hits.length === 0) return src;
  const matched = new Set<number>();
  const stack: number[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i]!;
    if (!hit.tag) continue;
    if (hit.kind === "O") {
      stack.push(i);
      continue;
    }
    const top = stack[stack.length - 1];
    if (top == null || hits[top]!.tag !== hit.tag) continue;
    matched.add(top);
    matched.add(i);
    stack.pop();
  }
  let out = "";
  let cursor = 0;
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i]!;
    out += src.slice(cursor, hit.start);
    out += matched.has(i) ? src.slice(hit.start, hit.end) : stashMarkdownText(hit.raw);
    cursor = hit.end;
  }
  out += src.slice(cursor);
  return out;
}

type InlineNode = {
  type: string;
  value?: string;
  children?: InlineNode[];
  data?: {
    hName?: string;
    hProperties?: { className?: string[] };
  };
};

/**
 * Turn paired `§§SBO` / `§§SBC` tokens into `<kbd>`, `<sub>`, or
 * `<sup>` after hard breaks have been split. Call this from the
 * hard-break remark plugin so every completed markdown tree
 * (paragraph, heading, table cell) shares one pass. The element
 * gets a class and no other attributes.
 */
export function applySafeInlineHtml(node: InlineNode): void {
  if (node.type === "code" || node.type === "inlineCode") return;
  if (!node.children) return;
  for (const child of node.children) applySafeInlineHtml(child);
  const wrapped = wrapSafeTokens(node.children);
  if (wrapped) node.children = wrapped;
}

type Piece =
  | { t: "text"; v: string }
  | { t: "node"; n: InlineNode }
  | { t: "mark"; kind: "O" | "C"; tag: WrapTag; raw: string };

function wrapSafeTokens(nodes: InlineNode[]): InlineNode[] | null {
  let saw = false;
  for (const node of nodes) {
    if (node.type === "text" && node.value?.includes("§§SB")) {
      saw = true;
      break;
    }
  }
  if (!saw) return null;
  const pieces: Piece[] = [];
  for (const node of nodes) {
    if (node.type !== "text" || !node.value) {
      pieces.push({ t: "node", n: node });
      continue;
    }
    const value = node.value;
    const re = /§§SB([OC])((?:[0-9A-F]{6})+)§§/g;
    let cursor = 0;
    for (const match of value.matchAll(re)) {
      const index = match.index ?? 0;
      if (index > cursor) pieces.push({ t: "text", v: value.slice(cursor, index) });
      const kind: "O" | "C" = match[1] === "C" ? "C" : "O";
      const decoded = decodeHex(match[2] ?? "");
      const safe = decoded == null ? null : classifySafeInline(decoded);
      const tag =
        safe && kind === "O" && safe.kind === "open"
          ? safe.tag
          : safe && kind === "C" && safe.kind === "close"
            ? safe.tag
            : null;
      if (tag) pieces.push({ t: "mark", kind, tag, raw: decoded ?? "" });
      else if (decoded != null) pieces.push({ t: "text", v: decoded });
      else pieces.push({ t: "text", v: match[0] });
      cursor = index + match[0].length;
    }
    if (cursor < value.length) pieces.push({ t: "text", v: value.slice(cursor) });
  }
  const closeAt = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i]!;
    if (piece.t !== "mark") continue;
    if (piece.kind === "O") {
      stack.push(i);
      continue;
    }
    const top = stack[stack.length - 1];
    const open = top == null ? undefined : pieces[top];
    if (open?.t === "mark" && open.tag === piece.tag) {
      closeAt.set(top, i);
      stack.pop();
    }
  }
  const build = (from: number, to: number): InlineNode[] => {
    const out: InlineNode[] = [];
    let i = from;
    while (i < to) {
      const piece = pieces[i]!;
      if (piece.t === "text") {
        if (piece.v) out.push({ type: "text", value: piece.v });
        i += 1;
        continue;
      }
      if (piece.t === "node") {
        out.push(piece.n);
        i += 1;
        continue;
      }
      const close = piece.kind === "O" ? closeAt.get(i) : undefined;
      if (close != null) {
        out.push(tagNode(piece.tag, build(i + 1, close)));
        i = close + 1;
        continue;
      }
      if (piece.raw) out.push({ type: "text", value: piece.raw });
      i += 1;
    }
    return out;
  };
  return build(0, pieces.length);
}

function tagNode(tag: WrapTag, children: InlineNode[]): InlineNode {
  return {
    type: "inlineHtml",
    data: {
      hName: tag,
      hProperties: { className: [`md-${tag}`] },
    },
    children,
  };
}
