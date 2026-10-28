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
 *
 * v2.02: cmark-gfm 0.29.0.gfm.13 opens an HTML declaration only
 * when `<!` is followed by an ASCII uppercase letter. micromark
 * follows CommonMark 0.30 and also opens on a lowercase letter,
 * so `<!doctype *bar*>` hides the emphasis and a following `---`
 * becomes a rule. The `<` is stashed. The rest of the line stays
 * text, and an uppercase `<!DOCTYPE` is still one raw declaration.
 * A line that is indented code, including code inside a list, is
 * left alone.
 *
 * v2.03: an inline HTML comment matches that same cmark-gfm
 * scanner. `<!-->` and `<!--->` are comments. A longer `<!--`
 * is a comment only when the closer the scanner accepts is
 * present, so `<!-- *bar* -->` stays raw and `<!-- *bar*--->`
 * does not. micromark treats every `<!--` … `-->` as a comment,
 * which hides the emphasis and keeps a following `---` from
 * being a setext heading. The `<` of a rejected comment is
 * stashed. A line that begins with `<!--` is still a type 2
 * HTML block. `<!-->` and `<!--->` stay comments.
 *
 * v2.04: that declaration also needs whitespace after the
 * uppercase run. `<!DOCTYPE *bar*>` is one raw declaration.
 * `<!DOCTYPE*bar*>` and `<!HTML5 *bar*>` are not, so micromark
 * would hide the emphasis and a following `---` would stay a
 * rule. The `<` is stashed. A line that begins with `<!` plus
 * an uppercase letter is still a type 4 HTML block.
 *
 * v2.05: inline processing instructions and CDATA use the same
 * cmark-gfm closer. micromark closes at the first `?>` or `]]>`,
 * so `<? *bar*??>` and `<![CDATA[ *bar*]]]>` hide the emphasis.
 * The re2c body can consume `??>` and `]]]>`, so those are not
 * closers. The `<` is stashed. `<? *bar*?>`, `<? *bar*???>`, and
 * `<![CDATA[ *bar*]]>` stay one raw span, and a later real closer
 * still swallows the text in front of it. A line that begins
 * with `<?` or `<![CDATA[` is still an HTML block.
 *
 * v2.06: cmark-gfm spacechar includes form feed (U+000C).
 * micromark does not count it as tag whitespace, so
 * `<a\fhref="*bar*">` emphasizes and `<a href=x\f*bar*>` hides
 * the emphasis. A form feed between the name and an attribute,
 * around `=`, or before `>` keeps the span one raw tag. A form
 * feed ends an unquoted value, so the emphasis runs. A line
 * that is an HTML block only because of that form feed is
 * stashed, so a following `---` stays inside the block. A form
 * feed inside quotes was already a tag. v1.94 still stashes
 * line tabulation before this pass. `<br\f>` is not a bare
 * break.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownHtmlLiteral.swift`.
 */

import { opaqueMarkdownRanges, stashMarkdownText } from "./markdownEscape.ts";
import {
  htmlBlockEnd,
  htmlBlockInterrupts,
  htmlBlockStarts,
  htmlLineIsCompleteTag,
  htmlSearchBlockLine,
  htmlSourceBlockLine,
} from "./markdownList.ts";
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

function rewrite(input: string): string {
  const prepared = prepareCmarkHtml(input);
  const src = prepared.text;
  const opaque = opaqueMarkdownRanges(src);
  const blocked = mergeRanges([...opaque, ...prepared.protect]);
  const codeLine = indentedCodeMask(src);
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
    if (ch === "<" && isLowerHtmlDeclaration(src, i) && !codeLine[i]) {
      // micromark would open a declaration. cmark-gfm does not.
      out += stashMarkdownText("<");
      i += 1;
      continue;
    }
    if (ch === "<" && isInvalidHtmlComment(src, i) && !codeLine[i]) {
      // micromark would open a comment. cmark-gfm does not.
      out += stashMarkdownText("<");
      i += 1;
      continue;
    }
    if (ch === "<" && isInvalidHtmlDeclaration(src, i) && !codeLine[i]) {
      // micromark would open a declaration. cmark-gfm does not.
      out += stashMarkdownText("<");
      i += 1;
      continue;
    }
    if (ch === "<" && isInvalidHtmlPi(src, i) && !codeLine[i]) {
      // micromark would open a processing instruction. cmark-gfm does not.
      out += stashMarkdownText("<");
      i += 1;
      continue;
    }
    if (ch === "<" && isInvalidHtmlCdata(src, i) && !codeLine[i]) {
      // micromark would open CDATA. cmark-gfm does not.
      out += stashMarkdownText("<");
      i += 1;
      continue;
    }
    if (ch === "<" && isFormFeedUnquotedTag(src, i) && !codeLine[i]) {
      // micromark keeps the form feed inside the unquoted value.
      // cmark-gfm stops the value, so the tag does not match.
      out += stashMarkdownText("<");
      i += 1;
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
 * cmark-gfm 0.29.0.gfm.13: `<!` plus an ASCII uppercase letter.
 * A lowercase letter is not a declaration on that version.
 */
function isLowerHtmlDeclaration(src: string, index: number): boolean {
  if (src[index] !== "<" || src[index + 1] !== "!") return false;
  const ch = src[index + 2] ?? "";
  return ch >= "a" && ch <= "z";
}

/**
 * cmark-gfm 0.29.0.gfm.13 inline HTML declaration, exclusive end.
 * `[A-Z]+`, then whitespace, then anything except `>` and NUL,
 * then `>`. `<!DOCTYPE *bar*>` matches. `<!DOCTYPE*bar*>` does
 * not. `-1` when `index` is not one of those declarations.
 */
export function cmarkHtmlDeclarationEnd(src: string, index: number): number {
  if (src[index] !== "<" || src[index + 1] !== "!") return -1;
  let cursor = index + 2;
  if (!isUpper(src[cursor] ?? "")) return -1;
  cursor += 1;
  while (isUpper(src[cursor] ?? "")) cursor += 1;
  if (!isDeclSpace(src[cursor] ?? "")) return -1;
  while (isDeclSpace(src[cursor] ?? "")) cursor += 1;
  while (cursor < src.length) {
    const ch = src[cursor] ?? "";
    if (ch === ">" || ch === "\0") break;
    cursor += 1;
  }
  if (cursor >= src.length || src[cursor] !== ">") return -1;
  return cursor + 1;
}

/** `<!` plus uppercase that cmark-gfm does not accept as a declaration. */
function isInvalidHtmlDeclaration(src: string, index: number): boolean {
  if (src[index] !== "<" || src[index + 1] !== "!") return false;
  if (!isUpper(src[index + 2] ?? "")) return false;
  return cmarkHtmlDeclarationEnd(src, index) < 0;
}

/** cmark `spacechar`: space, tab, newline, CR, form feed, vertical tab. */
function isDeclSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

/**
 * cmark-gfm 0.29.0.gfm.13 inline HTML comment, exclusive end.
 * `<!-->` and `<!--->` are comments. Anything longer has to
 * match the comment scanner: a rejected closer such as
 * `<!-- *bar*--->` is not a comment. `-1` when `index` is not
 * one of those comments.
 */
export function cmarkHtmlCommentEnd(src: string, index: number): number {
  if (!src.startsWith("<!--", index)) return -1;
  if (src.startsWith("<!-->", index)) return index + 5;
  if (src.startsWith("<!--->", index)) return index + 6;
  const len = scanHtmlComment(src, index + 2);
  return len > 0 ? index + 2 + len : -1;
}

/** `<!--` that cmark-gfm does not accept as an inline comment. */
function isInvalidHtmlComment(src: string, index: number): boolean {
  return src.startsWith("<!--", index) && cmarkHtmlCommentEnd(src, index) < 0;
}

/**
 * cmark-gfm 0.29.0.gfm.13 inline processing instruction, exclusive
 * end. The body is `([^?>\0]+ | [?][^>\0] | [>])+` and the closer
 * is `?>`. `<? *bar*?>` and `<? *bar*???>` match. `<? *bar*??>`
 * does not: `??>` is body text, not a closer. `-1` when `index`
 * is not one of those instructions.
 */
export function cmarkHtmlPiEnd(src: string, index: number): number {
  if (!src.startsWith("<?", index)) return -1;
  const bodyEnd = scanHtmlPi(src, index + 2);
  return src.startsWith("?>", bodyEnd) ? bodyEnd + 2 : -1;
}

/** `<?` that cmark-gfm does not accept as a processing instruction. */
function isInvalidHtmlPi(src: string, index: number): boolean {
  return src.startsWith("<?", index) && cmarkHtmlPiEnd(src, index) < 0;
}

/**
 * Exclusive end of a PI body scanned from the character after `<?`.
 * An empty body is allowed, so `<??>` still matches.
 */
function scanHtmlPi(src: string, start: number): number {
  let cursor = start;
  while (cursor < src.length) {
    const ch = src[cursor] ?? "";
    if (ch !== "?" && ch !== ">" && ch !== "\0") {
      cursor += 1;
      while (cursor < src.length) {
        const next = src[cursor] ?? "";
        if (next === "?" || next === ">" || next === "\0") break;
        cursor += 1;
      }
      continue;
    }
    if (ch === "?" && cursor + 1 < src.length) {
      const next = src[cursor + 1] ?? "";
      if (next !== ">" && next !== "\0") {
        cursor += 2;
        continue;
      }
    }
    if (ch === ">") {
      cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
}

/**
 * cmark-gfm 0.29.0.gfm.13 inline CDATA, exclusive end. The body
 * scanner stops in front of `]]>` and may consume `]]]>` as text.
 * `<![CDATA[ *bar*]]>` matches. `<![CDATA[ *bar*]]]>` does not.
 * `-1` when `index` is not one of those sections.
 */
export function cmarkHtmlCdataEnd(src: string, index: number): number {
  if (!src.startsWith("<![CDATA[", index)) return -1;
  const bodyEnd = scanHtmlCdata(src, index + 3);
  if (bodyEnd < 0) return -1;
  return src.startsWith("]]>", bodyEnd) ? bodyEnd + 3 : -1;
}

/** `<![CDATA[` that cmark-gfm does not accept as CDATA. */
function isInvalidHtmlCdata(src: string, index: number): boolean {
  return src.startsWith("<![CDATA[", index) && cmarkHtmlCdataEnd(src, index) < 0;
}

/** Exclusive end of a CDATA body scanned from `C` of `CDATA[`, or -1. */
function scanHtmlCdata(src: string, start: number): number {
  if (!src.startsWith("CDATA[", start)) return -1;
  let cursor = start + 6;
  while (cursor < src.length) {
    const ch = src[cursor] ?? "";
    if (ch !== "]" && ch !== "\0") {
      cursor += 1;
      while (cursor < src.length) {
        const next = src[cursor] ?? "";
        if (next === "]" || next === "\0") break;
        cursor += 1;
      }
      continue;
    }
    if (ch === "]" && cursor + 1 < src.length) {
      const next = src[cursor + 1] ?? "";
      if (next !== "]" && next !== "\0") {
        cursor += 2;
        continue;
      }
      if (next === "]" && cursor + 2 < src.length) {
        const third = src[cursor + 2] ?? "";
        if (third !== ">" && third !== "\0") {
          cursor += 3;
          continue;
        }
      }
    }
    break;
  }
  return cursor;
}

/**
 * Length of a comment scanned from the first `-` of `<!--`,
 * or 0. This is the cmark-gfm 0.29.0.gfm.13 re2c machine:
 * `"--" (non-hyphen+ | "-" non-hyphen | "--" non-">")* "-->"`.
 */
function scanHtmlComment(src: string, start: number): number {
  const at = (i: number): string => (i < src.length ? src[i]! : "\0");
  const normal = (ch: string): boolean => ch !== "\0" && ch !== "-";
  if (at(start) !== "-" || at(start + 1) !== "-") return 0;
  let p = start + 1;
  while (p <= src.length + 1) {
    p += 1;
    let ch = at(p);
    if (normal(ch)) continue;
    if (ch !== "-") return 0;
    p += 1;
    ch = at(p);
    if (normal(ch)) continue;
    if (ch !== "-") return 0;
    p += 1;
    ch = at(p);
    if (ch === ">") return p + 1 - start;
    if (ch === "\0") return 0;
  }
  return 0;
}

/**
 * Lines micromark will parse as indented code. Top-level code is
 * already opaque. A code block inside a list is not, and stashing
 * its `<` would show the token in the chip. A paragraph continued
 * with four spaces is not code, so a declaration there still disarms.
 */
function indentedCodeMask(src: string): boolean[] {
  const mask = new Array<boolean>(src.length).fill(false);
  let inCode = false;
  let prevBlank = true;
  let i = 0;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const end = nl < 0 ? src.length : nl;
    const indent = lineIndent(src.slice(i, end));
    const blank = indent == null;
    if (indent != null && indent < 4) inCode = false;
    if (!inCode && prevBlank && indent != null && indent >= 4) inCode = true;
    if (inCode && !blank) {
      for (let k = i; k < end; k += 1) mask[k] = true;
    }
    prevBlank = blank;
    if (nl < 0) break;
    i = nl + 1;
  }
  return mask;
}

function lineIndent(line: string): number | null {
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
 * v1.87: shift micromark's HTML blocks onto cmark-gfm 0.29.0.gfm.13.
 * `source` is type 6 there and not in micromark, so a complete tag
 * gets a blank line in front of an open paragraph and stays raw.
 * An incomplete `source` line is stashed. `search` is not type 6;
 * an unfinished `<search` is disarmed, and a finished tag is left
 * raw only when the paragraph is already closed. A one-line safe
 * `<br>` stays out of the protected range so v1.75 can still paint
 * the hard-break token. Copy keeps the original markdown.
 */
function prepareCmarkHtml(src: string): { text: string; protect: Range[] } {
  const opaque = opaqueMarkdownRanges(src);
  const lines = lineSpans(src);
  const texts = lines.map((line) => line.text);
  const out: string[] = [];
  const spans: { start: number; end: number }[] = [];
  let para = false;
  let inMath = false;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (covered(line.start, opaque)) {
      out.push(line.text);
      para = false;
      inMath = false;
      index += 1;
      continue;
    }
    if (line.text.trim() === "$$") {
      inMath = !inMath;
      out.push(line.text);
      para = false;
      index += 1;
      continue;
    }
    if (inMath) {
      out.push(line.text);
      index += 1;
      continue;
    }
    if (isBlankLine(line.text)) {
      out.push(line.text);
      para = false;
      index += 1;
      continue;
    }
    if (htmlSourceBlockLine(line.text)) {
      const end = htmlBlockEnd(texts, index, false) ?? index + 1;
      const complete = htmlLineIsCompleteTag(line.text);
      if (para) out.push("");
      if (formFeedOpensBlock(line.text)) {
        for (let j = index; j < end; j += 1) out.push(stashMarkdownText(lines[j]!.text));
      } else {
        const start = out.length;
        for (let j = index; j < end; j += 1) {
          const text = lines[j]!.text;
          out.push(complete ? text : stashMarkdownText(text));
        }
        if (complete) spans.push({ start, end: out.length });
      }
      para = false;
      index = end;
      continue;
    }
    if (htmlSearchBlockLine(line.text) && !searchTagClosesOnLine(line.text)) {
      out.push(disarmAngle(line.text));
      para = true;
      index += 1;
      continue;
    }
    const htmlEnd = htmlBlockEnd(texts, index, para);
    if (htmlEnd != null) {
      // A one-line type 7 tag is stashed (or becomes a v1.75 break).
      // Types 1–6 stay raw even on one line so the paragraph still
      // ends. A type 7 block with following lines stays raw so those
      // lines are not parsed as markdown.
      const type7Only = !htmlBlockInterrupts(line.text);
      if (type7Only && htmlEnd === index + 1) {
        out.push(line.text);
      } else if (formFeedOpensBlock(line.text)) {
        // micromark would parse the block. cmark-gfm keeps it raw.
        if (para) out.push("");
        for (let j = index; j < htmlEnd; j += 1) out.push(stashMarkdownText(lines[j]!.text));
      } else {
        const start = out.length;
        for (let j = index; j < htmlEnd; j += 1) out.push(lines[j]!.text);
        spans.push({ start, end: out.length });
      }
      para = false;
      index = htmlEnd;
      continue;
    }
    out.push(line.text);
    para = paragraphAfter(line.text, para);
    index += 1;
  }
  return { text: out.join("\n"), protect: protectRanges(out, spans) };
}

/**
 * The line is a cmark HTML block only because a form feed is
 * tag whitespace. Replacing that form feed with `*` drops the
 * block. A form feed inside a quoted value still leaves a block,
 * and micromark already agrees there.
 */
function formFeedOpensBlock(line: string): boolean {
  if (!line.includes("\f")) return false;
  if (!htmlBlockStarts(line)) return false;
  return !htmlBlockStarts(line.replaceAll("\f", "*"));
}

/**
 * micromark would accept this as a tag only by keeping a form
 * feed inside an unquoted value. cmark-gfm does not.
 */
function isFormFeedUnquotedTag(src: string, index: number): boolean {
  if (src[index] !== "<" || htmlTagEnd(src, index) >= 0) return false;
  const blank = src.indexOf("\n\n", index);
  const end = blank < 0 ? src.length : blank;
  const slice = src.slice(index, end);
  if (!slice.includes("\f")) return false;
  return htmlTagEnd(slice.replaceAll("\f", ""), 0) > 0;
}

function searchTagClosesOnLine(line: string): boolean {
  const open = line.indexOf("<");
  if (open < 0) return false;
  const end = htmlTagEnd(line, open);
  return end > open;
}

function disarmAngle(line: string): string {
  const open = line.indexOf("<");
  if (open < 0) return line;
  return `${line.slice(0, open)}${stashMarkdownText("<")}${line.slice(open + 1)}`;
}

function paragraphAfter(line: string, open: boolean): boolean {
  if (isBlankLine(line)) return false;
  if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) return false;
  if (/^ {0,3}>/.test(line)) return false;
  if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) return false;
  if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) return false;
  if (!open && (/^ {4,}/.test(line) || line.startsWith("\t"))) return false;
  return true;
}

function protectRanges(lines: string[], spans: { start: number; end: number }[]): Range[] {
  const starts: number[] = [];
  let pos = 0;
  for (let i = 0; i < lines.length; i += 1) {
    starts.push(pos);
    pos += lines[i]!.length;
    if (i + 1 < lines.length) pos += 1;
  }
  return spans
    .map((span) => ({
      start: starts[span.start] ?? 0,
      end: span.end < lines.length ? (starts[span.end] ?? pos) : pos,
    }))
    .filter((range) => range.end > range.start);
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
 * Comments, CDATA, processing instructions, and declarations
 * count. A processing instruction closes on `?>` and CDATA on
 * `]]>` only when the cmark-gfm 0.29.0.gfm.13 body scanner
 * stopped in front of that closer. A declaration is uppercase,
 * then whitespace, then `>`. A tag name is an ASCII letter, then
 * letters, digits, and hyphens. Attributes follow the spec,
 * including one line ending in the whitespace. Form feed is
 * cmark spacechar there, and it ends an unquoted value.
 */
export function htmlTagEnd(src: string, i: number): number {
  if (src[i] !== "<") return -1;
  if (src.startsWith("<!--", i)) return cmarkHtmlCommentEnd(src, i);
  if (src.startsWith("<![CDATA[", i)) return cmarkHtmlCdataEnd(src, i);
  if (src.startsWith("<?", i)) return cmarkHtmlPiEnd(src, i);
  if (src[i + 1] === "!") {
    const decl = cmarkHtmlDeclarationEnd(src, i);
    if (decl > i) return decl;
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

/**
 * cmark `spacechar` inside a tag, with at most one line ending.
 * Form feed (U+000C) is spacechar. A second line ending is a
 * blank line and stays outside the tag. Line tabulation is
 * already a v1.94 flanking stash before this scan.
 */
function skipWs(src: string, i: number): number {
  let j = i;
  let line = false;
  while (j < src.length) {
    const ch = src[j];
    if (ch === " " || ch === "\t" || ch === "\f") {
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
    ch === "\f" ||
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
