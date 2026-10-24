// SPDX-License-Identifier: Apache-2.0

/**
 * v1.44: CommonMark setext headings on a completed assistant
 * LEFT `kind=message`.
 *
 * A paragraph followed by a line of `=` is an H1. A line of `-`
 * is an H2. The heading uses the same elements as an ATX heading,
 * so it picks up the same 16px / 14px semibold styles. Several
 * lines with no blank line between them are one heading. A plain
 * newline inside it is a soft break. Two trailing spaces, or a
 * backslash before the newline, is a hard break and stays inside.
 *
 * A `---` after a blank line stays a thematic break. A `---` that
 * is not indented into a list item stays a break after the list.
 * The same underline indented to the item's text is a heading
 * inside the item. A setext underline that would only match as a
 * lazy continuation of a quote or list stays literal text. A
 * backslash-escaped `\=` or `\-` stays literal. Fences, indented
 * code, `$$` math, HTML blocks, and pipe-table rows are not
 * headings. Underline-shaped lines inside a table cell stay
 * literal too.
 *
 * v1.80: the underline rules match cmark-gfm at the edges v1.44
 * still missed. A multi-line paragraph plus `===` or `---` is one
 * heading. Up to three leading spaces and any trailing spaces or
 * tabs are an underline; four or more columns are not. A solid
 * `---` closes an open paragraph as an h2, and the same line with
 * no paragraph above it stays a thematic break. A line of `=`
 * with nothing above it stays text. Internal spaces (`= =`,
 * `--- -`) are not an underline. A lazy list or quote continuation
 * is not an underline. An HTML block uses the CommonMark end
 * rule, so `<a title="a lot` then `---` is a heading, while
 * `<div>`, `<script>`, and a comment keep the underline inside
 * the block. Indented code may follow another block with no
 * blank line, so that code is not heading text.
 *
 * v1.83: hard breaks inside the heading match cmark-gfm. Checked
 * the CommonMark emphasis examples on main first. Delimiter
 * flanking, intraword `_` versus `*`, the rule of 3, nested runs,
 * unmatched delimiters, `***strong emph***`, and emphasis inside
 * code spans and links already match on both clients. v1.67 and
 * v1.68 stand. The unshipped gap was this heading. A plain newline
 * is a soft break, not a line-break element. Two or more trailing
 * spaces, or one backslash before the newline, is a hard break,
 * and those markers are not shown. The line before the underline
 * is the end of the block, so its trailing spaces disappear and a
 * backslash there stays visible. A marker inside a code span stays
 * in the code. Leading spaces and tabs on a heading line are not
 * part of the text. `headingInlineSource` runs the same hard-break
 * pass paragraphs already use.
 *
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownSetext.swift`.
 */

import { applyHardLineBreaks } from "./markdownHardBreak.ts";
import { htmlBlockEnd } from "./markdownList.ts";

export type SetextBlock =
  | { type: "markdown"; text: string }
  | { type: "heading"; level: 1 | 2; text: string };

type Mode =
  | { kind: "none" }
  | { kind: "quote" }
  | { kind: "list"; contentCol: number };

/** Never animate, including when Reduce Motion is off. */
export function setextAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/**
 * Heading body for the inline renderer. A plain newline stays a
 * soft break. Two trailing spaces, or a backslash before the
 * newline, becomes the hard-break token. A marker inside a code
 * span stays literal. The underline is not included.
 */
export function headingInlineSource(text: string): string {
  return applyHardLineBreaks(text, true);
}

/**
 * A lazy setext underline inside a quote or list is rewritten so a
 * later pass cannot promote it. The backslash is an escape: the
 * painted text is still the underline characters.
 * `completed: false` returns `text` unchanged.
 */
export function protectLazySetext(text: string, completed = true): string {
  if (!completed || !text) return text;
  const src = normalize(text);
  const lines = src.split("\n");
  const out: string[] = [];
  let mode: Mode = { kind: "none" };
  let para = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line)) {
      para = false;
      mode = { kind: "none" };
      out.push(line);
      i += 1;
      continue;
    }
    const skipped = skipOpaque(lines, i, mode.kind === "none" && !para, para);
    if (skipped > i) {
      for (let j = i; j < skipped; j += 1) out.push(lines[j] ?? "");
      para = false;
      mode = { kind: "none" };
      i = skipped;
      continue;
    }
    const raw = setextUnderline(line);
    const fits = fitsContainer(line, mode);
    if (para && mode.kind !== "none" && (raw || fits)) {
      if (fits) {
        para = false;
        out.push(line);
        i += 1;
        continue;
      }
      if (raw && isThematic(line)) {
        para = false;
        mode = { kind: "none" };
        out.push(line);
        i += 1;
        continue;
      }
      if (raw) {
        out.push(protectUnderline(line, raw.index));
        i += 1;
        continue;
      }
    }
    if (raw && para && mode.kind === "none") {
      para = false;
      out.push(line);
      i += 1;
      continue;
    }
    // v1.80: a break with no open paragraph is not paragraph text.
    if (isThematic(line)) {
      para = false;
      mode = { kind: "none" };
      out.push(line);
      i += 1;
      continue;
    }
    if (isQuoteLine(line)) {
      mode = { kind: "quote" };
      para = true;
      out.push(line);
      i += 1;
      continue;
    }
    const item = listItem(line);
    if (item && (!para || item.interrupts)) {
      mode = { kind: "list", contentCol: item.contentCol };
      para = true;
      out.push(line);
      i += 1;
      continue;
    }
    if (!para) mode = { kind: "none" };
    para = true;
    out.push(line);
    i += 1;
  }
  const next = out.join("\n");
  if (next === src) return text.includes("\r") ? src : text;
  return next;
}

/**
 * Pull top-level setext headings out of completed markdown.
 * Quote- and list-internal underlines stay in the markdown so the
 * quote or list renderer can see them. `completed: false` returns
 * the text unchanged.
 */
export function splitSetextHeadings(
  text: string,
  completed = true,
): SetextBlock[] {
  if (!text) return [];
  const src = normalize(text);
  if (!completed) return [{ type: "markdown", text: src }];
  const lines = src.split("\n");
  const blocks: SetextBlock[] = [];
  let md: string[] = [];
  let para: string[] = [];
  let mode: Mode = { kind: "none" };
  let i = 0;

  const flushMd = () => {
    if (md.length === 0) return;
    const chunk = md.join("\n");
    md = [];
    if (chunk.trim()) blocks.push({ type: "markdown", text: chunk });
  };
  const dumpPara = () => {
    if (para.length === 0) return;
    md.push(...para);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line)) {
      dumpPara();
      md.push(line);
      mode = { kind: "none" };
      i += 1;
      continue;
    }
    const paragraphOpen = para.length > 0;
    const skipped = skipOpaque(
      lines,
      i,
      mode.kind === "none" && !paragraphOpen,
      paragraphOpen,
    );
    if (skipped > i) {
      dumpPara();
      for (let j = i; j < skipped; j += 1) md.push(lines[j] ?? "");
      mode = { kind: "none" };
      i = skipped;
      continue;
    }
    const raw = setextUnderline(line);
    if (raw && para.length > 0 && mode.kind === "none") {
      const body = headingText(para);
      para = [];
      flushMd();
      if (body) blocks.push({ type: "heading", level: raw.level, text: body });
      else md.push(line);
      i += 1;
      continue;
    }
    if (fitsContainer(line, mode)) {
      dumpPara();
      md.push(line);
      i += 1;
      continue;
    }
    // v1.80: `---` closes an open paragraph above. With no paragraph
    // it is a thematic break, not the first line of a later heading.
    if (isThematic(line)) {
      dumpPara();
      mode = { kind: "none" };
      md.push(line);
      i += 1;
      continue;
    }
    if (isAtx(line)) {
      dumpPara();
      mode = { kind: "none" };
      md.push(line);
      i += 1;
      continue;
    }
    if (isQuoteLine(line)) {
      dumpPara();
      mode = { kind: "quote" };
      md.push(line);
      i += 1;
      continue;
    }
    const item = listItem(line);
    if (item && (para.length === 0 || item.interrupts)) {
      dumpPara();
      mode = { kind: "list", contentCol: item.contentCol };
      md.push(line);
      i += 1;
      continue;
    }
    if (mode.kind === "none") para.push(line);
    else md.push(line);
    i += 1;
  }
  dumpPara();
  flushMd();
  if (blocks.length === 0) return [{ type: "markdown", text: src }];
  return blocks;
}

/**
 * An underline-shaped line inside a table cell stays the characters,
 * not a heading and not a rule. The leading backslash is an escape.
 */
export function literalizeSetextLines(text: string): string {
  if (!text) return text;
  const src = normalize(text);
  const lines = src.split("\n");
  let changed = false;
  const out = lines.map((line) => {
    const raw = setextUnderline(line);
    if (!raw) return line;
    changed = true;
    return protectUnderline(line, raw.index);
  });
  if (!changed) return text.includes("\r") ? src : text;
  return out.join("\n");
}

function headingText(lines: string[]): string {
  if (lines.length === 0) return "";
  // A trailing run of spaces and tabs is not heading text. When
  // that run ends in two or more spaces, keep the spaces so the
  // hard-break pass can see them and drop the tabs in the run.
  // A run that ends in a tab or a single space is dropped. A tab
  // between words stays. Leading spaces and tabs are the heading's
  // indent, including on a code-span continuation.
  return lines.map(normalizeHeadingLine).join("\n").trim();
}

function normalizeHeadingLine(line: string): string {
  let body = line.replace(/^[ \t]+/, "");
  let spaces = 0;
  while (body.endsWith(" ")) {
    spaces += 1;
    body = body.slice(0, -1);
  }
  body = body.replace(/\t+$/, "");
  if (spaces >= 2) return `${body}${" ".repeat(spaces)}`;
  return body.replace(/[ \t]+$/, "");
}

function protectUnderline(line: string, index: number): string {
  return `${line.slice(0, index)}\\${line.slice(index)}`;
}

/** 0–3 spaces, then `=` or `-`, then trailing space or tab. A lone `-` is a list item. */
export function setextUnderline(
  line: string,
): { level: 1 | 2; index: number } | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const ch = line[i];
  if (ch !== "=" && ch !== "-") return null;
  const start = i;
  while (i < line.length && line[i] === ch) i += 1;
  const count = i - start;
  if (ch === "-" && count < 2) return null;
  for (let j = i; j < line.length; j += 1) {
    const c = line[j];
    if (c !== " " && c !== "\t") return null;
  }
  return { level: ch === "=" ? 1 : 2, index: start };
}

function fitsContainer(line: string, mode: Mode): boolean {
  if (mode.kind === "quote") return quoteRemainderIsUnderline(line);
  if (mode.kind === "list") {
    if (leadingColumns(line) < mode.contentCol) return false;
    return setextUnderline(dedent(line, mode.contentCol)) != null;
  }
  return false;
}

function quoteRemainderIsUnderline(line: string): boolean {
  let i = 0;
  let saw = false;
  while (i < line.length) {
    let s = i;
    let spaces = 0;
    while (s < line.length && spaces < 3 && line[s] === " ") {
      s += 1;
      spaces += 1;
    }
    if (line[s] !== ">") break;
    saw = true;
    s += 1;
    if (line[s] === " ") s += 1;
    i = s;
  }
  if (!saw) return false;
  return setextUnderline(line.slice(i)) != null;
}

function skipOpaque(
  lines: string[],
  index: number,
  allowCode: boolean,
  paragraphOpen: boolean,
): number {
  const line = lines[index] ?? "";
  const fence = openingFence(line);
  if (fence) return skipFence(lines, index, fence);
  if (line.trim() === "$$") return skipMath(lines, index);
  const html = htmlBlockEnd(lines, index, paragraphOpen);
  if (html != null && html > index) return html;
  if (allowCode && isIndentedCodeLine(line)) return skipIndented(lines, index);
  return index;
}

function skipFence(lines: string[], index: number, open: string): number {
  let i = index + 1;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    i += 1;
    if (isClosingFence(line, open)) break;
  }
  return i;
}

function skipMath(lines: string[], index: number): number {
  let i = index + 1;
  while (i < lines.length && (lines[i] ?? "").trim() !== "$$") i += 1;
  if (i < lines.length) i += 1;
  return i;
}

function skipIndented(lines: string[], index: number): number {
  let i = index + 1;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line) || isIndentedCodeLine(line)) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function openingFence(line: string): string | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const marker = match[2] ?? "";
  if (marker[0] === "`" && (match[3] ?? "").includes("`")) return null;
  return marker;
}

function isClosingFence(line: string, open: string): boolean {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return false;
  const marker = match[2] ?? "";
  if (!marker || marker[0] !== open[0]) return false;
  if (marker.length < open.length) return false;
  return (match[3] ?? "").trim() === "";
}

function isIndentedCodeLine(line: string): boolean {
  if (isBlank(line)) return false;
  if (line.startsWith("\t")) return true;
  return /^ {4,}/.test(line);
}

function isAtx(line: string): boolean {
  return /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line);
}

function isQuoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line);
}

function isThematic(line: string): boolean {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const ch = line[i];
  if (ch !== "-" && ch !== "*" && ch !== "_") return false;
  let count = 0;
  for (let j = i; j < line.length; j += 1) {
    const c = line[j];
    if (c === ch) count += 1;
    else if (c === " " || c === "\t") continue;
    else return false;
  }
  return count >= 3;
}

function listItem(
  line: string,
): { contentCol: number; interrupts: boolean } | null {
  let index = 0;
  let columns = 0;
  while (index < line.length && line[index] === " " && columns < 3) {
    index += 1;
    columns += 1;
  }
  const rest = line.slice(index);
  let token = 0;
  let ordered = false;
  let number = 1;
  if (/^[-+*](?:[ \t]|$)/.test(rest)) {
    token = 1;
    if (rest.length > 1 && rest[1] !== " " && rest[1] !== "\t") return null;
  } else {
    const match = /^(\d{1,9})([.)])(?:[ \t]|$)/.exec(rest);
    if (!match) return null;
    token = (match[1]?.length ?? 0) + 1;
    ordered = true;
    number = Number(match[1]);
    const sepAt = token;
    if (sepAt < rest.length && rest[sepAt] !== " " && rest[sepAt] !== "\t") {
      return null;
    }
  }
  columns += token;
  const sep = rest[token];
  if (sep === " ") columns += 1;
  else if (sep === "\t") columns += 4 - (columns % 4);
  else columns += 1;
  const interrupts = !ordered || number === 1;
  return { contentCol: columns, interrupts };
}

function leadingColumns(line: string): number {
  let columns = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

function dedent(line: string, columns: number): string {
  let col = 0;
  let i = 0;
  while (i < line.length && col < columns) {
    const ch = line[i];
    if (ch === " ") {
      col += 1;
      i += 1;
      continue;
    }
    if (ch === "\t") {
      const width = 4 - (col % 4);
      if (col + width > columns) break;
      col += width;
      i += 1;
      continue;
    }
    break;
  }
  return line.slice(i);
}

function isBlank(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
