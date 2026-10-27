// SPDX-License-Identifier: Apache-2.0

/**
 * v1.41: CommonMark hard line breaks on a completed assistant
 * LEFT `kind=message`.
 *
 * A line that ends in two or more spaces, or in an unescaped
 * backslash, followed by a newline inside a paragraph renders as
 * a visible line break. The spaces and the backslash are not
 * shown. Leading spaces on the next line are ignored. The same
 * marker at the end of a paragraph or other block is not a break:
 * trailing spaces disappear, and a backslash stays visible.
 *
 * A plain single newline is a soft break. It stays a newline in
 * the markdown and renders as a space, so the paragraph is one
 * wrapping block. That matches CommonMark and Grok Bot's chat:
 * blank lines already split bubbles, and the "real line breaks
 * instead of stray backslashes" fix is this hard-break rule.
 *
 * Code spans, fenced code, indented code, raw HTML, math
 * (`\(` `\)` and `$$`), and pipe-table rows keep their markers.
 * Call this after math extraction and after backslash escapes, so
 * `\\` plus a newline is a literal backslash and a soft break.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * v1.94: after the tree is built, strong nested inside strong
 * becomes one strong. cmark-gfm's HTML emits one `<strong>`
 * for that nest. Emphasis nested in emphasis stays nested.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownHardBreak.swift`.
 */

import { flattenNestedStrong } from "./markdownEmphasis.ts";
import { applySafeInlineHtml } from "./markdownHtmlLiteral.ts";
import { htmlBlockEnd, htmlBlockInterrupts, htmlBlockStarts } from "./markdownList.ts";
import { fenceInfoAllowsOpen, fenceRanges, inRange, inlineCodeRanges, type Range } from "./math.ts";

/** Placeholder swapped for a `<br>` / newline after the markdown parse. */
export const HARD_BREAK_TOKEN = "§§SBH§§";

type Line = {
  text: string;
  start: number;
  /** Index of the newline, or -1 on the last line. */
  nl: number;
};

type ListFrame = {
  markerCol: number;
  contentCol: number;
  ordered: boolean;
};

type Marker = {
  col: number;
  contentCol: number;
  ordered: boolean;
  number: number;
};

/**
 * Rewrite hard breaks outside code and math. `completed: false`
 * returns `text` unchanged so a streaming bubble stays plain.
 */
export function applyHardLineBreaks(text: string, completed = true): string {
  if (!completed || !text) return text;
  if (!text.includes("\n") && !text.includes("\r")) return text;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const next = rewriteHardBreaks(src);
  if (next === src) return text.includes("\r") ? src : text;
  return next;
}

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

/**
 * Turn hard-break placeholders into `break` nodes before other
 * inline rewrites. A break stops strikethrough, the same way a
 * CommonMark hard break does.
 */
export function remarkHardBreaks(): (tree: MdastNode) => void {
  return (tree) => {
    rewriteHardNodes(tree);
    // v1.75: paired kbd / sub / sup tokens become elements after
    // a bare <br> has already been split into a break node.
    applySafeInlineHtml(tree);
    // v1.94: cmark-gfm HTML collapses strong-in-strong to one tag.
    flattenNestedStrong(tree);
  };
}

function rewriteHardNodes(node: MdastNode): void {
  if (!node.children) return;
  const next: MdastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value?.includes(HARD_BREAK_TOKEN)) {
      const parts = child.value.split(HARD_BREAK_TOKEN);
      parts.forEach((part, index) => {
        if (index > 0) next.push({ type: "break" });
        if (part) next.push({ type: "text", value: part });
      });
      continue;
    }
    rewriteHardNodes(child);
    next.push(child);
  }
  node.children = next;
}

/** Split painted text on the placeholder. `null` when there is none. */
export function splitHardBreakToken(text: string): string[] | null {
  if (!text.includes(HARD_BREAK_TOKEN)) return null;
  return text.split(HARD_BREAK_TOKEN);
}

function rewriteHardBreaks(src: string): string {
  const lines = splitLines(src);
  if (lines.length < 2) return src;
  const blocked = blockedRanges(src);
  const masked = maskRanges(src, inlineMasks(src));
  const maskedLines = splitLines(masked);
  const breaks = new Map<number, number>();
  const texts = lines.map((line) => line.text);
  let para = false;
  let quote = 0;
  let stack: ListFrame[] = [];
  let prevBlank = true;
  let i = 0;

  const arm = (index: number, next: string) => {
    if (!para) return;
    const line = lines[index];
    if (!line || line.nl < 0 || inRange(line.nl, blocked)) return;
    if (!hardMarker(line.text)) return;
    breaks.set(index, continuationSkip(next, quote));
  };

  while (i < lines.length) {
    const raw = lines[i]!.text;
    const line = maskedLines[i]!.text;
    if (isBlank(raw)) {
      para = false;
      quote = 0;
      prevBlank = true;
      i += 1;
      continue;
    }

    const fence = fenceOpen(raw);
    if (fence) {
      para = false;
      quote = 0;
      i = skipFence(lines, i, fence);
      prevBlank = false;
      continue;
    }
    if (raw.trim() === "$$") {
      para = false;
      quote = 0;
      i += 1;
      while (i < lines.length && lines[i]!.text.trim() !== "$$") i += 1;
      if (i < lines.length) i += 1;
      prevBlank = false;
      continue;
    }
    // v1.87: a type 7 tag at the list or quote margin closes that
    // container and owns the following lines. An indented type 7
    // tag stays in the open paragraph, so a hard break there still
    // fires. A type 1–6 block inside the item still swallows breaks.
    const top = stack[stack.length - 1];
    const leavingList = !!top && contentIndent(raw) < top.contentCol;
    const leavingQuote = quote > 0 && quoteDepth(raw) < quote;
    const htmlPara = leavingList || leavingQuote ? false : para;
    const htmlEnd = htmlBlockEnd(texts, i, htmlPara);
    if (htmlEnd != null) {
      if (leavingList || leavingQuote) {
        stack = [];
        quote = 0;
      }
      para = false;
      i = htmlEnd;
      prevBlank = false;
      continue;
    }
    if (!para && stack.length === 0 && contentIndent(raw) >= 4 && prevBlank) {
      para = false;
      quote = 0;
      i += 1;
      while (i < lines.length) {
        const upcoming = lines[i]!.text;
        if (isBlank(upcoming) || contentIndent(upcoming) >= 4) {
          i += 1;
          continue;
        }
        break;
      }
      prevBlank = false;
      continue;
    }
    if (!para && isTableStart(lines, i)) {
      para = false;
      quote = 0;
      i = skipTable(lines, i);
      prevBlank = false;
      continue;
    }

    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const indent = contentIndent(raw);
      if (indent >= top.contentCol) break;
      if (para && !interruptsParagraph(raw, true) && !htmlBlockStarts(raw)) break;
      stack.pop();
    }

    const marker = parseMarker(stripQuote(line));
    const continues = continuesParagraph(line, para, quote, stack);
    if (i > 0 && continues) arm(i - 1, lines[i]!.text);

    if (marker && startsListItem(marker, para, stack)) {
      const top = stack[stack.length - 1];
      if (top && marker.col >= top.contentCol) {
        stack.push({
          markerCol: marker.col,
          contentCol: marker.contentCol,
          ordered: marker.ordered,
        });
      } else {
        while (stack.length > 0) {
          const frame = stack[stack.length - 1]!;
          if (marker.col > frame.markerCol) break;
          stack.pop();
        }
        stack.push({
          markerCol: marker.col,
          contentCol: marker.contentCol,
          ordered: marker.ordered,
        });
      }
      para = true;
      quote = quoteDepth(line);
    } else if (isAtx(line) || isThematic(line) || isMathLine(line)) {
      para = false;
      quote = 0;
    } else if (isSetext(line) && para) {
      para = false;
      quote = 0;
    } else {
      para = true;
      const depth = quoteDepth(line);
      if (depth > 0) quote = depth;
    }
    prevBlank = false;
    i += 1;
  }

  if (breaks.size === 0) return src;
  let out = "";
  let skip = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let text = lines[index]!.text;
    if (skip > 0) {
      text = text.slice(Math.min(skip, text.length));
      skip = 0;
    }
    const eat = breaks.get(index);
    if (eat == null) {
      out += text;
      if (lines[index]!.nl >= 0) out += "\n";
      continue;
    }
    out += stripHardMarker(text);
    out += HARD_BREAK_TOKEN;
    skip = eat;
  }
  return out;
}

function splitLines(src: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i <= src.length; i += 1) {
    if (i === src.length || src[i] === "\n") {
      lines.push({ text: src.slice(start, i), start, nl: i === src.length ? -1 : i });
      start = i + 1;
    }
  }
  if (src.endsWith("\n")) lines.pop();
  return lines;
}

function hardMarker(line: string): boolean {
  return trailingSlashes(line) % 2 === 1 || trailingSpaces(line) >= 2;
}

function trailingSlashes(line: string): number {
  let slashes = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === "\\"; i -= 1) slashes += 1;
  return slashes;
}

function trailingSpaces(line: string): number {
  let spaces = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === " "; i -= 1) spaces += 1;
  return spaces;
}

function stripHardMarker(line: string): string {
  if (trailingSlashes(line) % 2 === 1) return line.slice(0, line.length - 1);
  return line.slice(0, line.length - trailingSpaces(line));
}

function continuationSkip(line: string, quote: number): number {
  let i = 0;
  for (let q = 0; q < quote; q += 1) {
    const prefix = quotePrefixAt(line, i);
    if (prefix === 0) break;
    i += prefix;
  }
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i += 1;
  return i;
}

function quotePrefixAt(line: string, from: number): number {
  let i = from;
  let spaces = 0;
  while (i < line.length && spaces < 3 && line[i] === " ") {
    i += 1;
    spaces += 1;
  }
  if (line[i] !== ">") return 0;
  i += 1;
  if (line[i] === " ") i += 1;
  return i - from;
}

function quoteDepth(line: string): number {
  let i = 0;
  let depth = 0;
  while (i < line.length) {
    const prefix = quotePrefixAt(line, i);
    if (prefix === 0) break;
    depth += 1;
    i += prefix;
  }
  return depth;
}

function continuesParagraph(
  line: string,
  para: boolean,
  quote: number,
  stack: ListFrame[],
): boolean {
  if (!para || isBlank(line)) return false;
  if (fenceOpen(line) || isAtx(line) || isMathLine(line)) return false;
  if (isThematic(line) || isSetext(line)) return false;
  if (htmlBlockInterrupts(line)) return false;
  const depth = quoteDepth(line);
  if (depth > 0 && quote === 0) return false;
  const marker = parseMarker(stripQuote(line));
  if (marker && startsListItem(marker, true, stack)) return false;
  return true;
}

function lineStartsQuote(line: string): boolean {
  return quotePrefixAt(line, 0) > 0;
}

function stripQuote(line: string): string {
  let i = 0;
  while (i < line.length) {
    const prefix = quotePrefixAt(line, i);
    if (prefix === 0) break;
    i += prefix;
  }
  return line.slice(i);
}

function startsListItem(marker: Marker, para: boolean, stack: ListFrame[]): boolean {
  const interrupts = !marker.ordered || marker.number === 1;
  const top = stack[stack.length - 1];
  if (!top) {
    if (marker.col > 3) return false;
    if (!para) return true;
    return interrupts;
  }
  if (marker.col >= top.contentCol) return interrupts;
  if (marker.col <= 3 && marker.col <= top.markerCol) return true;
  return false;
}

function interruptsParagraph(line: string, para: boolean): boolean {
  if (fenceOpen(line) || isAtx(line) || isMathLine(line)) return true;
  if (isThematic(line)) return true;
  if (para ? htmlBlockInterrupts(line) : htmlBlockStarts(line)) return true;
  if (lineStartsQuote(line)) return true;
  const marker = parseMarker(line);
  if (!marker) return false;
  return !marker.ordered || marker.number === 1;
}

function parseMarker(line: string): Marker | null {
  if (isThematic(line)) return null;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index);
  let ordered = false;
  let number = 1;
  let token = "";
  const bullet = rest[0];
  if (bullet === "-" || bullet === "+" || bullet === "*") {
    token = bullet;
  } else {
    let digits = "";
    let j = 0;
    while (j < rest.length && digits.length < 9 && isDigit(rest[j] ?? "")) {
      digits += rest[j];
      j += 1;
    }
    if (!digits || (rest[j] !== "." && rest[j] !== ")")) return null;
    token = `${digits}${rest[j]}`;
    ordered = true;
    number = Number.parseInt(digits, 10);
  }
  let contentCol = lead.columns + token.length;
  const after = lead.index + token.length;
  if (after >= line.length) contentCol += 1;
  else if (line[after] === " ") contentCol += 1;
  else if (line[after] === "\t") contentCol += 4 - (contentCol % 4);
  else return null;
  return { col: lead.columns, contentCol, ordered, number };
}

function isAtx(line: string): boolean {
  return /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line);
}

function isMathLine(line: string): boolean {
  return line.trim() === "$$";
}

function isSetext(line: string): boolean {
  return /^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
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

function isBlank(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function fenceOpen(line: string): string | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const marker = match[2] ?? "";
  if (!fenceInfoAllowsOpen(marker, match[3] ?? "")) return null;
  return marker;
}

function skipFence(lines: Line[], start: number, marker: string): number {
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i]!.text;
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (
      match &&
      match[2]![0] === marker[0] &&
      match[2]!.length >= marker.length &&
      (match[3] ?? "").trim() === ""
    ) {
      return i + 1;
    }
    i += 1;
  }
  return i;
}

function contentIndent(line: string): number {
  const lead = leadingColumns(line);
  if (lead.index >= line.length) return 0;
  return lead.columns;
}

function leadingColumns(line: string): { columns: number; index: number } {
  let columns = 0;
  let index = 0;
  while (index < line.length) {
    const ch = line[index];
    if (ch === " ") {
      columns += 1;
      index += 1;
      continue;
    }
    if (ch === "\t") {
      columns += 4 - (columns % 4);
      index += 1;
      continue;
    }
    break;
  }
  return { columns, index };
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isTableStart(lines: Line[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  const header = lines[index]!.text;
  const delim = lines[index + 1]!.text;
  if (!isTableRow(header) || !isDelimiterRow(delim)) return false;
  const width = splitPipes(header).length;
  return width >= 1 && splitPipes(delim).length === width;
}

function skipTable(lines: Line[], index: number): number {
  let i = index + 2;
  while (i < lines.length && isTableRow(lines[i]!.text)) i += 1;
  return i;
}

function isTableRow(line: string): boolean {
  if (contentIndent(line) >= 4) return false;
  if (isBlank(line)) return false;
  return splitPipes(line).length >= 2 || line.includes("|");
}

function isDelimiterRow(line: string): boolean {
  const cells = splitPipes(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

function splitPipes(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let code = 0;
  for (let i = 0; i < line.length; ) {
    const ch = line[i] ?? "";
    if (code > 0) {
      if (ch === "`") {
        let n = 0;
        while (line[i + n] === "`") n += 1;
        current += "`".repeat(n);
        i += n;
        if (n === code) code = 0;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      if (i + 1 < line.length) current += line[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      let n = 0;
      while (line[i + n] === "`") n += 1;
      current += "`".repeat(n);
      i += n;
      code = n;
      continue;
    }
    if (ch === "|") {
      cells.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  cells.push(current);
  return cells.filter((cell, index) => !(cell.trim() === "" && (index === 0 || index === cells.length - 1)));
}

function blockedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const math = mathRanges(src, [...fences, ...codes]);
  const indented = indentedCodeRanges(src, fences);
  const html = inlineHtmlRanges(src, [...fences, ...codes, ...math]);
  return mergeRanges([...fences, ...codes, ...math, ...indented, ...html]);
}

function inlineMasks(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const math = mathRanges(src, [...fences, ...codes]);
  const html = inlineHtmlRanges(src, [...fences, ...codes, ...math]);
  return mergeRanges([...codes, ...math, ...html]);
}

function maskRanges(src: string, ranges: Range[]): string {
  if (ranges.length === 0) return src;
  const chars = src.split("");
  for (const range of ranges) {
    for (let i = range.start; i < range.end && i < chars.length; i += 1) {
      if (chars[i] !== "\n") chars[i] = "x";
    }
  }
  return chars.join("");
}

function mathRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (src.startsWith("$$", i) && (i === 0 || src[i - 1] === "\n")) {
      const close = src.indexOf("\n$$", i + 2);
      if (close >= 0) {
        const end = close + 3;
        ranges.push({ start: i, end: src[end] === "\n" ? end + 1 : end });
        i = end;
        continue;
      }
      ranges.push({ start: i, end: src.length });
      break;
    }
    if (src.startsWith("\\(", i)) {
      const close = src.indexOf("\\)", i + 2);
      if (close >= 0) {
        ranges.push({ start: i, end: close + 2 });
        i = close + 2;
        continue;
      }
      ranges.push({ start: i, end: src.length });
      break;
    }
    i += 1;
  }
  return ranges;
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
      const blank = isBlank(line);
      if (inCode && !blank && indent < 4) {
        ranges.push({ start: codeStart, end: i });
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
  if (inCode) ranges.push({ start: codeStart, end: src.length });
  return ranges;
}

function inlineHtmlRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip)) {
      i += 1;
      continue;
    }
    if (src[i] !== "<") {
      i += 1;
      continue;
    }
    const end = readHtml(src, i);
    if (end != null && end > i + 1) {
      ranges.push({ start: i, end });
      i = end;
      continue;
    }
    i += 1;
  }
  return ranges;
}

function readHtml(src: string, i: number): number | null {
  if (src.startsWith("<!--", i)) {
    const end = src.indexOf("-->", i + 4);
    return end < 0 ? null : end + 3;
  }
  if (src.startsWith("<?", i)) {
    const end = src.indexOf("?>", i + 2);
    return end < 0 ? null : end + 2;
  }
  if (src.startsWith("<![CDATA[", i)) {
    const end = src.indexOf("]]>", i + 9);
    return end < 0 ? null : end + 3;
  }
  if (src.startsWith("<!", i)) {
    const end = src.indexOf(">", i + 2);
    return end < 0 ? null : end + 1;
  }
  let j = i + 1;
  if (src[j] === "/") j += 1;
  if (!isNameStart(src[j] ?? "")) return null;
  j += 1;
  while (j < src.length && isNameChar(src[j] ?? "")) j += 1;
  let quote = "";
  while (j < src.length) {
    const ch = src[j] ?? "";
    if (quote) {
      if (ch === quote) quote = "";
      j += 1;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      j += 1;
      continue;
    }
    if (ch === ">") return j + 1;
    j += 1;
  }
  return null;
}

function isNameStart(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}

function isNameChar(ch: string): boolean {
  return isNameStart(ch) || isDigit(ch) || ch === "-";
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
