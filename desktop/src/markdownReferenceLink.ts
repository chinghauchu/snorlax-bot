// SPDX-License-Identifier: Apache-2.0

/**
 * v1.39: CommonMark reference-style links on a completed assistant
 * LEFT `kind=message`.
 *
 * Full `[text][ref]`, collapsed `[ref][]`, and shortcut `[ref]`
 * resolve against a link reference definition anywhere in the same
 * message. Labels match case-insensitively after whitespace is
 * collapsed. Resolved links are rewritten to inline links so the
 * existing link style, destination preview, and http(s) safe-scheme
 * rules apply. Definition lines are removed. Unresolved references
 * stay literal. `[^1]` stays a footnote. Task-list markers stay
 * markers. Fences, inline code, and math are not parsed. Reference
 * images rewrite to inline images so a removed definition does not
 * leave `![alt][ref]` behind. Streaming (`completed: false`) returns
 * the text unchanged. Copy controls keep markdown source.
 * No animation. No new HTTP.
 * v1.74: a pointy destination may contain spaces and tabs, including
 * when a title follows in single quotes or parentheses. A backslash
 * escapes ASCII punctuation only, so `\ ` stays a backslash and a
 * space. `prepareSpacedLinkDestinations` percent-encodes that
 * destination for the markdown parser. Streaming stays plain.
 * Copy keeps markdown source.
 * v1.76: link text follows CommonMark. Balanced brackets stay inside
 * one link (`[link [foo [bar]]](/uri)`). A link may not contain
 * another link, so `[foo [bar](/uri)][ref]` is the inner link plus
 * the reference, not one outer link. An undefined full label does
 * not fall back to a shortcut. Code spans, autolinks, and raw HTML
 * bind tighter than brackets. Streaming stays plain. Copy keeps
 * markdown source.
 * v1.81: definition edges that v1.39 still missed. A multi-line
 * label, collapsed whitespace, and first-definition-wins already
 * matched cmark-gfm. A definition still cannot interrupt an open
 * paragraph, including a lazy quote or list continuation
 * (`Foo` then `[bar]: /url`, `> foo` then `[bar]: /url`). A
 * setext underline, heading, rule, fence, or blank line closes
 * that paragraph first. Labels use the Unicode case fold, so
 * `ẞ` / `ß` / `SS` match and `ς` matches `Σ`. A label may be
 * 1000 characters, which is what cmark-gfm accepts. Streaming
 * stays plain. Copy keeps markdown source.
 * v1.91: a label matches the source text, not the parsed inlines.
 * A backslash stays in the label, so `[bar][foo\!]` does not
 * match `[foo!]` and `[foo\bar]` does not match `[foobar]`.
 * `[foo\!]` still matches `[foo\!]`, and the link text parses
 * the escape, so the visible word is `foo!`.
 * v1.92: the edges v1.81 and v1.91 still missed. A pointy
 * destination may be empty (`[foo]: <>`). A title that parses
 * on a later line but is followed by other text ends the
 * definition at the destination, and the link still keeps that
 * title. A definition that is the body of a list item or a
 * blockquote, including a destination or title on the next
 * line, applies to the whole message. A later line in that
 * item or quote that is itself a definition is taken too,
 * including a lazy continuation. The marker stays so an
 * empty item or quote does not disappear. Streaming stays
 * plain. Copy keeps markdown source.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownReferenceLink.swift`.
 */

import { unicodeCaseFold } from "./markdownCaseFold.ts";
import { ASCII_PUNCT } from "./markdownEscape.ts";
import { isAtxHeadingLine, isThematicBreakLine } from "./markdownIndentedCode.ts";
import { htmlBlockEnd, listMarkerPadding } from "./markdownList.ts";
import { setextUnderline } from "./markdownSetext.ts";
import {
  commonMarkTitleHint,
  formatCommonMarkTitle,
  readCommonMarkTitle,
} from "./markdownLinkTitleForm.ts";
import { htmlTagEnd } from "./markdownHtmlLiteral.ts";
import { encodeLinkDestination } from "./linkify.ts";
import { markdownTableEnd } from "./markdownTable.ts";
import {
  fenceRanges,
  inRange,
  inlineCodeRanges,
  type Range,
} from "./math.ts";

type Target = { dest: string; title: string | null };

type StoredDef = Target & { label: string };

type ParsedDef = {
  label: string;
  dest: string;
  title: string | null;
  start: number;
  end: number;
  /** Kept in place of the cut. Empty deletes the range. */
  replacement?: string;
  /** Later definitions in the same container paragraph. First label wins. */
  also?: StoredDef[];
};

type Cut = { start: number; end: number; text: string };

type Bracket = { raw: string; next: number };

const FOOTNOTE_CHAR = /[A-Za-z0-9_-]/;

/**
 * Rewrite reference links in completed markdown. `completed: false`
 * returns `text` unchanged so a streaming bubble stays plain.
 * A message with no link reference definition returns `text` unchanged.
 */
export function resolveReferenceLinks(text: string, completed = true): string {
  if (!completed || !text || !text.includes("[")) return text;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocked = protectedRanges(src);
  const collected = collectDefinitions(src, blocked);
  if (collected.cuts.length === 0) return text;
  const stripped = removeRanges(src, collected.cuts);
  return applyReferences(stripped, collected.map, protectedRanges(stripped));
}

/**
 * v1.74: percent-encode spaces and tabs inside pointy link and image
 * destinations, and inside a link reference definition's pointy
 * destination. Code, fences, indented code, and math stay literal.
 * `completed: false` returns `text`. The characters outside those
 * brackets stay as written, so find still sees a space until render.
 */
export function prepareSpacedLinkDestinations(text: string, completed = true): string {
  if (!completed || !text || !text.includes("<")) return text;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocked = prepareBlocked(src);
  const edits: { start: number; end: number; text: string }[] = [];
  const pushPointy = (destAt: number) => {
    if (src[destAt] !== "<" || inRange(destAt, blocked)) return;
    const dest = readDestination(src, destAt);
    if (!dest) return;
    if (!dest.dest.includes(" ") && !dest.dest.includes("\t")) return;
    edits.push({
      start: destAt,
      end: dest.next,
      text: `<${encodeLinkDestination(dest.dest)}>`,
    });
  };

  let i = 0;
  while (i < src.length) {
    const blockedAt = rangeAt(i, blocked);
    if (blockedAt) {
      i = blockedAt.end;
      continue;
    }
    const image = src[i] === "!" && src[i + 1] === "[" && !isEscaped(src, i);
    if ((src[i] === "[" || image) && !isEscaped(src, i)) {
      const openBracket = image ? i + 1 : i;
      const bracket = readBracket(src, openBracket, blocked);
      if (bracket) {
        const paren = skipLinkSpace(src, bracket.next, blocked);
        if (paren != null && src[paren] === "(") {
          const destAt = skipLinkSpace(src, paren + 1, blocked);
          if (destAt != null) pushPointy(destAt);
        }
        i = bracket.next;
        continue;
      }
    }
    i += 1;
  }

  for (const line of lineSpans(src)) {
    if (inRange(line.start, blocked)) continue;
    const parsed = parseDefinition(src, line.start, blocked);
    if (!parsed) continue;
    if (!parsed.dest.includes(" ") && !parsed.dest.includes("\t")) continue;
    const prefix = quotePrefixLength(line.text);
    let labelAt = line.start + prefix;
    while (src[labelAt] === " " && labelAt < line.start + prefix + 4) labelAt += 1;
    const label = readBracket(src, labelAt, blocked);
    if (!label) continue;
    const colon = skipSpTab(src, label.next);
    if (src[colon] !== ":") continue;
    const destAt = skipDestWs(src, colon + 1, blocked);
    if (destAt == null) continue;
    pushPointy(destAt);
  }

  if (edits.length === 0) return text.includes("\r") ? src : text;
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    out += src.slice(cursor, edit.start);
    out += edit.text;
    cursor = edit.end;
  }
  out += src.slice(cursor);
  return out;
}

function prepareBlocked(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const indented = indentedCodeRanges(src, fences);
  const skip = [...fences, ...codes, ...indented];
  return mergeRanges([...skip, ...mathRanges(src, skip)]);
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
      if (inCode && indent != null && indent < 4) {
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

function collectDefinitions(
  src: string,
  blocked: Range[],
): { map: Map<string, Target>; cuts: Cut[] } {
  const lines = lineSpans(src);
  const texts = lines.map((line) => line.text);
  const tables = tableLineSet(lines);
  const map = new Map<string, Target>();
  const cuts: Cut[] = [];
  let paragraph = false;
  let inQuote = false;
  let fence: string | null = null;
  let inMath = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const gate = blockGate(line.text, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      paragraph = false;
      inQuote = false;
      i += 1;
      continue;
    }
    if (tables.has(i) || lineIsFootnoteOwned(lines, i)) {
      paragraph = false;
      inQuote = false;
      i += 1;
      continue;
    }
    if (inRange(line.start, blocked)) {
      paragraph = true;
      i += 1;
      continue;
    }
    const htmlEnd = htmlBlockEnd(texts, i, paragraph);
    if (htmlEnd != null && htmlEnd > i) {
      paragraph = false;
      inQuote = false;
      i = htmlEnd;
      continue;
    }
    if (isEffectivelyBlank(line.text)) {
      paragraph = false;
      inQuote = false;
      i += 1;
      continue;
    }
    // An open paragraph keeps a would-be definition as text. A
    // heading, rule, setext underline, new quote, or interrupting
    // list closes it first, so the definition on the next line
    // can still match.
    if (paragraph && !closesOpenParagraph(line.text, inQuote)) {
      if (isQuoteLine(line.text)) inQuote = true;
      i += 1;
      continue;
    }
    const wasParagraph = paragraph;
    paragraph = false;
    const quoteLine = isQuoteLine(line.text);
    const parsed =
      parseContainerDefinition(src, lines, i, blocked) ??
      parseDefinition(src, line.start, blocked);
    if (parsed) {
      let endLine = i;
      while (endLine < lines.length && lines[endLine]!.start < parsed.end) endLine += 1;
      let bad = false;
      for (let k = i; k < endLine; k += 1) {
        if (tables.has(k)) bad = true;
      }
      if (!bad && !overlaps(parsed.start, parsed.end, blocked)) {
        if (!map.has(parsed.label)) {
          map.set(parsed.label, { dest: parsed.dest, title: parsed.title });
        }
        for (const extra of parsed.also ?? []) {
          if (!map.has(extra.label)) {
            map.set(extra.label, { dest: extra.dest, title: extra.title });
          }
        }
        cuts.push({
          start: parsed.start,
          end: parsed.end,
          text: parsed.replacement ?? "",
        });
        inQuote = quoteLine;
        i = Math.max(endLine, i + 1);
        continue;
      }
    }
    inQuote = quoteLine;
    paragraph = opensParagraph(line.text, wasParagraph);
    i += 1;
  }
  return { map, cuts };
}

/**
 * True when this line ends an open paragraph, so a link reference
 * definition is allowed to start here or on the next line.
 * Continuation of a quote that is already open is not an interrupt.
 */
function closesOpenParagraph(line: string, inQuote: boolean): boolean {
  const body = inQuote && isQuoteLine(line) ? line.slice(quotePrefixLength(line)) : line;
  if (setextUnderline(body)) return true;
  if (isAtxHeadingLine(body) || isThematicBreakLine(body)) return true;
  if (isQuoteLine(line) && !inQuote) return true;
  return listInterrupts(body);
}

/** A non-empty remainder starts a paragraph. A heading or rule does not. */
function opensParagraph(line: string, closedParagraph: boolean): boolean {
  if (closedParagraph && setextUnderline(line)) return false;
  if (isAtxHeadingLine(line) || isThematicBreakLine(line)) return false;
  const columns = leadingIndent(line);
  if (columns >= 4) return false;
  if (isQuoteLine(line)) {
    const rest = line.slice(quotePrefixLength(line));
    if (rest.trim() === "") return false;
    return opensParagraph(rest, false);
  }
  // A footnote definition is its own block. The next unindented
  // line is a sibling, so `[ref]:` after `[^1]: note` still matches.
  if (isFootnoteDefinitionLine(line)) return false;
  return true;
}

function isEffectivelyBlank(line: string): boolean {
  if (isBlankLine(line)) return true;
  if (!isQuoteLine(line)) return false;
  return line.slice(quotePrefixLength(line)).trim() === "";
}

function isBlankLine(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function isQuoteLine(line: string): boolean {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  return line[i] === ">";
}

/**
 * A bullet with text, or an ordered marker whose digits are `1`
 * with text, interrupts a paragraph. An empty marker does not.
 */
function listInterrupts(line: string): boolean {
  let i = 0;
  while (i < line.length && line[i] === " " && i < 3) i += 1;
  if (i < line.length && line[i] === "\t") return false;
  const rest = line.slice(i);
  if (/^[-+*][ \t]+\S/.test(rest)) return true;
  return /^1[.)][ \t]+\S/.test(rest);
}

function leadingIndent(line: string): number {
  let columns = 0;
  for (const ch of line) {
    if (ch === " ") {
      columns += 1;
      continue;
    }
    if (ch === "\t") return columns + 4 - (columns % 4);
    return columns;
  }
  return columns;
}

type Container = {
  quoteDepth: number;
  listColumn: number | null;
  keep: string;
  content: string;
};

type ParaLine = {
  start: number;
  end: number;
  content: string;
  lazy: boolean;
};

/**
 * v1.92: a definition that is the body of a blockquote or list item.
 * Container markers are stripped the way cmark strips them before
 * `cmark_parse_reference_inline`, then the same definition scan runs.
 * The marker is put back so an empty item or quote still renders.
 */
function parseContainerDefinition(
  src: string,
  spans: LineSpan[],
  index: number,
  blocked: Range[],
): ParsedDef | null {
  const span = spans[index];
  if (!span || inRange(span.start, blocked)) return null;
  const peeled = peelContainers(span.text);
  if (!peeled || !/^ {0,3}\[/.test(peeled.content)) return null;
  const openingEnd = spanEnd(span, src.length);
  if (overlaps(span.start, openingEnd, blocked)) return null;

  const para: ParaLine[] = [
    { start: span.start, end: openingEnd, content: peeled.content, lazy: false },
  ];
  for (let k = index + 1; k < spans.length && para.length < 64; k += 1) {
    const next = spans[k]!;
    if (inRange(next.start, blocked)) break;
    const cont = continuationOf(next.text, peeled);
    if (cont === "stop") break;
    para.push({
      start: next.start,
      end: spanEnd(next, src.length),
      content: cont.content,
      lazy: cont.lazy,
    });
  }

  let norm = "";
  for (let n = 0; n < para.length; n += 1) {
    const line = para[n]!;
    norm += line.content;
    const hasNl = line.end > line.start && src[line.end - 1] === "\n";
    if (hasNl || n < para.length - 1) norm += "\n";
  }
  // A container paragraph can open with several definitions.
  // cmark takes each of them, including a lazy continuation
  // that is itself a definition, and leaves only the text after
  // the last one.
  const found: StoredDef[] = [];
  let pos = 0;
  while (pos < norm.length) {
    const scanned = parseDefinition(norm.slice(pos), 0, []);
    if (!scanned || scanned.end <= 0) break;
    found.push({
      label: scanned.label,
      dest: scanned.dest,
      title: scanned.title,
    });
    pos += scanned.end;
  }
  if (found.length === 0) return null;
  const count = consumedLineCount(norm, pos);
  if (count < 1 || count > para.length) return null;
  for (let n = 0; n < count; n += 1) {
    const line = para[n]!;
    if (overlaps(line.start, line.end, blocked)) return null;
  }

  const edit = containerEdit(src, spans, index, peeled, para.slice(0, count), para.slice(count));
  const first = found[0]!;
  return {
    label: first.label,
    dest: first.dest,
    title: first.title,
    start: span.start,
    end: edit.end,
    replacement: edit.replacement,
    also: found.slice(1),
  };
}

function containerEdit(
  src: string,
  spans: LineSpan[],
  index: number,
  peeled: Container,
  consumed: ParaLine[],
  rest: ParaLine[],
): { end: number; replacement: string } {
  const finish = (end: number, body: string) => {
    if (!body) return { end, replacement: "" };
    const nl = end > 0 && src[end - 1] === "\n";
    if (!nl || body.endsWith("\n")) return { end, replacement: body };
    return { end, replacement: `${body}\n` };
  };
  let end = consumed[consumed.length - 1]!.end;
  const hasList = peeled.listColumn != null;
  if (rest.length > 0 && rest.every((line) => line.lazy)) {
    const body = rest.map((line) => line.content).join("\n");
    return finish(rest[rest.length - 1]!.end, `${peeled.keep}${body}`);
  }
  if (rest.length > 0) {
    return finish(end, hasList ? peeled.keep : "");
  }
  if (hasList) {
    const blank = spans[index + consumed.length];
    const after = spans[index + consumed.length + 1];
    if (
      blank &&
      isBlankLine(blank.text) &&
      after &&
      leadingIndent(after.text) >= (peeled.listColumn ?? 0) &&
      !siblingEndsItem(after.text, peeled.listColumn ?? 0)
    ) {
      end = spanEnd(blank, src.length);
    }
    return finish(end, peeled.keep);
  }
  if (peeled.quoteDepth > 0 && !quoteHasOther(spans, index, consumed.length, peeled.quoteDepth)) {
    return finish(end, peeled.keep);
  }
  return finish(end, "");
}

function quoteHasOther(
  spans: LineSpan[],
  index: number,
  consumed: number,
  depth: number,
): boolean {
  for (let j = index - 1; j >= 0; j -= 1) {
    const text = spans[j]!.text;
    if (isBlankLine(text)) break;
    const quote = quoteDepthAndEnd(text);
    if (quote.depth < depth) break;
    if (text.slice(quote.index).trim() !== "") return true;
  }
  for (let j = index + consumed; j < spans.length; j += 1) {
    const text = spans[j]!.text;
    if (isBlankLine(text)) break;
    const quote = quoteDepthAndEnd(text);
    if (quote.depth < depth) {
      if (text.trim() !== "") return true;
      break;
    }
    if (text.slice(quote.index).trim() !== "") return true;
  }
  return false;
}

function peelContainers(line: string): Container | null {
  const quote = quoteDepthAndEnd(line);
  let i = quote.index;
  let col = quote.column;
  let listColumn: number | null = null;
  let content = line.slice(i);
  const baseColumn = quote.column;
  for (let guard = 0; guard < 6; guard += 1) {
    let markerAt = i;
    let markerCol = col;
    if (listColumn == null) {
      const skipped = markerIndent(line, i, col);
      if (skipped) {
        markerAt = skipped.i;
        markerCol = skipped.col;
      }
    }
    const marker = listMarkerAt(line, markerAt, markerCol);
    if (!marker) break;
    if (listColumn == null && marker.markerColumn - baseColumn > 3) break;
    if (listColumn != null && marker.markerColumn < listColumn) break;
    listColumn = marker.contentColumn;
    i = marker.contentIndex;
    col = marker.contentColumn;
    content = marker.text;
  }
  if (quote.depth === 0 && listColumn == null) return null;
  const keep = line.endsWith(content) ? line.slice(0, line.length - content.length) : line.slice(0, i);
  return { quoteDepth: quote.depth, listColumn, keep, content };
}

/** Up to three spaces before a list marker. Four spaces stay text. */
function markerIndent(
  line: string,
  index: number,
  column: number,
): { i: number; col: number } | null {
  let j = index;
  let c = column;
  let spaces = 0;
  while (j < line.length && line[j] === " " && spaces < 3) {
    j += 1;
    c += 1;
    spaces += 1;
  }
  if (j === index) return null;
  const ch = line[j] ?? "";
  if (ch === "-" || ch === "+" || ch === "*" || (ch >= "0" && ch <= "9")) return { i: j, col: c };
  return null;
}

function continuationOf(
  line: string,
  container: Container,
): { content: string; lazy: boolean } | "stop" {
  if (isBlankLine(line)) return "stop";
  const quote = quoteDepthAndEnd(line);
  if (quote.depth < container.quoteDepth) {
    if (quote.depth === 0 && !interruptsParagraph(line)) return { content: line, lazy: true };
    return "stop";
  }
  if (quote.depth > container.quoteDepth) return "stop";
  let i = quote.index;
  let col = quote.column;
  if (container.listColumn == null) {
    const rest = line.slice(i);
    if (rest.trim() === "" || interruptsParagraph(rest)) return "stop";
    return { content: rest, lazy: false };
  }
  const listColumn = container.listColumn;
  if (col > listColumn) {
    const rest = line.slice(i);
    if (interruptsParagraph(rest)) return "stop";
    return { content: rest, lazy: false };
  }
  if (col === listColumn) {
    const rest = line.slice(i);
    if (rest.trim() === "" || interruptsParagraph(rest)) return "stop";
    return { content: rest, lazy: false };
  }
  while (col < listColumn && i < line.length) {
    const ch = line[i] ?? "";
    if (ch === " ") {
      i += 1;
      col += 1;
      continue;
    }
    if (ch === "\t") {
      const width = 4 - (col % 4);
      if (col + width > listColumn) {
        const content = `${" ".repeat(col + width - listColumn)}${line.slice(i + 1)}`;
        if (interruptsParagraph(content)) return "stop";
        return { content, lazy: false };
      }
      col += width;
      i += 1;
      continue;
    }
    break;
  }
  if (col < listColumn) {
    const rest = line.slice(i);
    if (interruptsParagraph(rest) || listMarkerAt(line, i, col)) return "stop";
    return { content: rest, lazy: true };
  }
  const content = line.slice(i);
  if (content.trim() === "" || interruptsParagraph(content)) return "stop";
  return { content, lazy: false };
}

function interruptsParagraph(line: string): boolean {
  if (isBlankLine(line)) return false;
  const lead = leadingIndent(line);
  if (lead >= 4) return false;
  let i = 0;
  let col = 0;
  while (i < line.length && col < lead) {
    const ch = line[i] ?? "";
    if (ch === " ") {
      i += 1;
      col += 1;
      continue;
    }
    if (ch === "\t") {
      col += 4 - (col % 4);
      i += 1;
      continue;
    }
    break;
  }
  const rest = line.slice(i);
  if (isAtxHeadingLine(rest) || isThematicBreakLine(rest) || setextUnderline(rest)) return true;
  if (/^(`{3,}|~{3,})/.test(rest)) {
    const info = rest.slice(rest.match(/^(`{3,}|~{3,})/)?.[0].length ?? 0);
    if (rest.startsWith("`") && info.includes("`")) return false;
    return true;
  }
  if (htmlBlockEnd([rest], 0, true) != null) return true;
  return listMarkerAt(line, i, col) != null;
}

function siblingEndsItem(line: string, listColumn: number): boolean {
  const lead = leadingIndent(line);
  if (lead > 3) return false;
  let i = 0;
  let col = 0;
  while (i < line.length && col < lead) {
    const ch = line[i] ?? "";
    if (ch === " ") {
      i += 1;
      col += 1;
      continue;
    }
    if (ch === "\t") {
      col += 4 - (col % 4);
      i += 1;
      continue;
    }
    break;
  }
  const marker = listMarkerAt(line, i, col);
  return marker != null && marker.markerColumn < listColumn;
}

function listMarkerAt(
  line: string,
  index: number,
  column: number,
): { markerColumn: number; contentColumn: number; contentIndex: number; text: string } | null {
  if (index > line.length) return null;
  const rest = line.slice(index);
  if (isThematicBreakLine(column === 0 ? line : rest)) return null;
  const bullet = /^([-+*])/.exec(rest);
  const ordered = /^(\d{1,9})([.)])/.exec(rest);
  if (!bullet && !ordered) return null;
  const token = bullet ? (bullet[1] ?? "") : `${ordered?.[1] ?? ""}${ordered?.[2] ?? ""}`;
  if (!token) return null;
  const after = index + token.length;
  if (after < line.length && line[after] !== " " && line[after] !== "\t") return null;
  const padded = listMarkerPadding(line, after, column + token.length);
  let contentIndex = line.length;
  if (padded.text !== "") {
    if (line.endsWith(padded.text)) contentIndex = line.length - padded.text.length;
    else {
      const trimmed = padded.text.trimStart();
      if (trimmed && line.endsWith(trimmed)) contentIndex = line.length - trimmed.length;
    }
  }
  return { markerColumn: column, contentColumn: padded.contentColumn, contentIndex, text: padded.text };
}

function quoteDepthAndEnd(line: string): { depth: number; index: number; column: number } {
  let i = 0;
  let col = 0;
  let depth = 0;
  while (i < line.length) {
    let spaces = 0;
    let j = i;
    let c = col;
    while (j < line.length && line[j] === " " && spaces < 3) {
      j += 1;
      c += 1;
      spaces += 1;
    }
    if (line[j] !== ">") break;
    depth += 1;
    j += 1;
    c += 1;
    if (line[j] === " ") {
      j += 1;
      c += 1;
    }
    i = j;
    col = c;
  }
  return { depth, index: i, column: col };
}

function consumedLineCount(norm: string, end: number): number {
  let newlines = 0;
  const stop = Math.min(end, norm.length);
  for (let i = 0; i < stop; i += 1) {
    if (norm[i] === "\n") newlines += 1;
  }
  if (end >= norm.length && (norm.length === 0 || norm[norm.length - 1] !== "\n")) return newlines + 1;
  return newlines;
}

function spanEnd(span: LineSpan, srcLen: number): number {
  return span.end < srcLen ? span.end + 1 : span.end;
}

function parseDefinition(
  src: string,
  lineStart: number,
  blocked: Range[],
): ParsedDef | null {
  const eol = lineEnd(src, lineStart);
  const line = src.slice(lineStart, eol);
  const prefix = quotePrefixLength(line);
  let i = lineStart + prefix;
  let spaces = 0;
  while (src[i] === " " && spaces < 4) {
    spaces += 1;
    i += 1;
  }
  if (spaces >= 4 || src[i] === "\t") return null;
  if (src[i] !== "[" || isEscaped(src, i)) return null;
  if (inRange(i, blocked)) return null;
  const bracket = readBracket(src, i, blocked);
  if (!bracket || !validLabel(bracket.raw) || isFootnoteLabel(bracket.raw)) return null;
  let j = skipSpTab(src, bracket.next);
  if (src[j] !== ":") return null;
  j += 1;
  const destAt = skipDestWs(src, j, blocked);
  if (destAt == null) return null;
  const dest = readDestination(src, destAt);
  if (!dest) return null;
  j = dest.next;
  const beforeTitle = j;
  let title: string | null = null;
  const titled = tryTitle(src, j, blocked);
  if (titled) {
    title = titled.title;
    j = titled.next;
  }
  let endAt = skipSpTab(src, j);
  const atLineEnd = endAt >= src.length || src[endAt] === "\n";
  if (!atLineEnd) {
    // A title on the same line that does not end the line rejects
    // the whole definition. A title on a later line is kept, and
    // the definition ends at the destination (cmark-gfm rewinds).
    if (!titled) return null;
    const opener = skipDestWs(src, beforeTitle, blocked);
    const crossed = opener != null && src.slice(beforeTitle, opener).includes("\n");
    if (!crossed) return null;
    endAt = skipSpTab(src, beforeTitle);
    if (endAt < src.length && src[endAt] !== "\n") return null;
  }
  const end = endAt < src.length ? endAt + 1 : endAt;
  const lineLimit = eol < src.length ? eol + 1 : eol;
  if (prefix > 0 && end > lineLimit) return null;
  return {
    label: normalizeLabel(bracket.raw),
    dest: dest.dest,
    title,
    start: lineStart,
    end,
  };
}

/**
 * v1.76: walk brackets the way cmark does. The nearest `[` is the
 * only candidate for a `]`. A matched link (not an image) sets
 * `noLinkOpeners`, so an outer `[` cannot contain that link.
 * Balanced brackets that are not themselves links stay in the text.
 * Code spans, autolinks, and raw HTML are skipped, so a `]` inside
 * them does not close a link.
 */
function applyReferences(src: string, map: Map<string, Target>, blocked: Range[]): string {
  type Opener = { index: number; image: boolean; bracketAfter: boolean };
  type Edit = { start: number; end: number; text: string };
  const edits: Edit[] = [];
  const stack: Opener[] = [];
  let noLinkOpeners = false;

  const sliceResolved = (start: number, end: number): string => {
    let out = "";
    let cursor = start;
    for (const edit of edits) {
      if (edit.start < cursor || edit.end > end || edit.start >= end) continue;
      out += src.slice(cursor, edit.start);
      out += edit.text;
      cursor = edit.end;
    }
    out += src.slice(cursor, end);
    return out;
  };

  const absorb = (start: number, end: number, text: string) => {
    for (let k = edits.length - 1; k >= 0; k -= 1) {
      const edit = edits[k];
      if (edit && edit.start >= start && edit.end <= end) edits.splice(k, 1);
    }
    edits.push({ start, end, text });
  };

  const pushOpener = (index: number, image: boolean) => {
    const top = stack[stack.length - 1];
    if (top) top.bracketAfter = true;
    stack.push({ index, image, bracketAfter: false });
    if (!image) noLinkOpeners = false;
  };

  let i = 0;
  while (i < src.length) {
    const blockedAt = rangeAt(i, blocked);
    if (blockedAt) {
      if (isBlockRange(src, blockedAt)) {
        stack.length = 0;
        noLinkOpeners = false;
      }
      i = blockedAt.end;
      continue;
    }
    if (src[i] === "\n" && src[i + 1] === "\n") {
      stack.length = 0;
      noLinkOpeners = false;
      i += 2;
      continue;
    }
    if (src[i] === "\\" && i + 1 < src.length && ASCII_PUNCT.includes(src[i + 1] ?? "")) {
      i += 2;
      continue;
    }
    if (src[i] === "<" && !isEscaped(src, i)) {
      const auto = autolinkEnd(src, i);
      if (auto != null) {
        i = auto;
        continue;
      }
      const html = htmlTagEnd(src, i);
      if (html > i) {
        i = html;
        continue;
      }
    }
    if (src[i] === "!" && src[i + 1] === "[" && !isEscaped(src, i)) {
      pushOpener(i + 1, true);
      i += 2;
      continue;
    }
    if (src[i] === "[" && !isEscaped(src, i)) {
      const footnoteEnd = footnoteBracketEnd(src, i);
      if (footnoteEnd != null) {
        i = footnoteEnd;
        continue;
      }
      if (isTaskMarker(src, i)) {
        i += 3;
        continue;
      }
      pushOpener(i, false);
      i += 1;
      continue;
    }
    if (src[i] !== "]" || isEscaped(src, i)) {
      i += 1;
      continue;
    }
    const opener = stack.pop();
    if (!opener) {
      i += 1;
      continue;
    }
    if (!opener.image && noLinkOpeners) {
      i += 1;
      continue;
    }
    const matched = matchCloser(src, opener, i, blocked, map);
    if (!matched) {
      i += 1;
      continue;
    }
    if (matched.kind === "ref") {
      const text = sliceResolved(opener.index + 1, i);
      const start = opener.image ? opener.index - 1 : opener.index;
      absorb(start, matched.end, emitLink(text, matched.target, opener.image));
    }
    if (!opener.image) noLinkOpeners = true;
    i = matched.end;
  }

  if (edits.length === 0) return src;
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    out += src.slice(cursor, edit.start);
    out += edit.text;
    cursor = edit.end;
  }
  out += src.slice(cursor);
  return out;
}

type CloserMatch =
  | { kind: "inline"; end: number }
  | { kind: "ref"; end: number; target: Target };

function matchCloser(
  src: string,
  opener: { index: number; image: boolean; bracketAfter: boolean },
  close: number,
  blocked: Range[],
  map: Map<string, Target>,
): CloserMatch | null {
  const after = close + 1;
  if (src[after] === "(") {
    const inlineEnd = matchInline(src, after, blocked);
    if (inlineEnd != null) return { kind: "inline", end: inlineEnd };
  }
  if (src[after] === "[") {
    const label = linkLabel(src, after);
    if (label) {
      // `[]` is collapsed. A label of only spaces is not a label and
      // does not fall back to the shortcut (CommonMark).
      if (label.raw.length === 0) {
        if (opener.bracketAfter) return null;
        const text = src.slice(opener.index + 1, close);
        const target = lookupLabel(map, text);
        return target ? { kind: "ref", end: label.next, target } : null;
      }
      const target = lookupLabel(map, label.raw);
      return target ? { kind: "ref", end: label.next, target } : null;
    }
  }
  if (opener.bracketAfter) return null;
  const text = src.slice(opener.index + 1, close);
  if (!validLabel(text) || isFootnoteLabel(text)) return null;
  const target = lookupLabel(map, text);
  return target ? { kind: "ref", end: after, target } : null;
}

/** Inline `(dest)`, including an empty `()` or `<>`. Spaces may surround the dest and title. */
function matchInline(src: string, openParen: number, blocked: Range[]): number | null {
  if (src[openParen] !== "(") return null;
  const destAt = skipLinkSpace(src, openParen + 1, blocked);
  if (destAt == null) return null;
  let afterDest: number;
  if (src[destAt] === ")") return destAt + 1;
  if (src[destAt] === "<" && src[destAt + 1] === ">") {
    afterDest = destAt + 2;
  } else {
    const dest = readDestination(src, destAt);
    if (!dest) return null;
    afterDest = dest.next;
  }
  let j = afterDest;
  const titleAt = skipLinkSpace(src, j, blocked);
  if (
    titleAt != null &&
    titleAt !== j &&
    (src[titleAt] === '"' || src[titleAt] === "'" || src[titleAt] === "(")
  ) {
    const title = readCommonMarkTitle(src, titleAt);
    if (!title) return null;
    j = title.next;
  } else if (titleAt != null) {
    j = titleAt;
  }
  const close = skipLinkSpace(src, j, blocked);
  if (close == null || src[close] !== ")") return null;
  return close + 1;
}

/**
 * A link label: `[` ... `]` with no unescaped brackets inside.
 * An empty label is the collapsed form. Longer than 1000 fails.
 * cmark-gfm accepts 1000 characters inside the brackets.
 */
function linkLabel(src: string, open: number): { raw: string; next: number } | null {
  if (src[open] !== "[") return null;
  let i = open + 1;
  let raw = "";
  while (i < src.length) {
    const ch = src[i] ?? "";
    if (ch === "[" || ch === "]") break;
    if (ch === "\\" && i + 1 < src.length) {
      raw += ch + (src[i + 1] ?? "");
      i += 2;
    } else {
      raw += ch;
      i += 1;
    }
    if (raw.length > 1000) return null;
  }
  if (src[i] !== "]") return null;
  return { raw, next: i + 1 };
}

const AUTOLINK_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/;
const AUTOLINK_EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** End index of a CommonMark autolink starting at `<`, or null. */
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

/** A fence, indented code, or math block. An inline code span is not one. */
function isBlockRange(src: string, range: Range): boolean {
  if (!src.slice(range.start, range.end).includes("\n")) return false;
  let k = range.start;
  while (k > 0 && src[k - 1] !== "\n") k -= 1;
  return /^ {0,3}$/.test(src.slice(k, range.start));
}

function lookupLabel(map: Map<string, Target>, raw: string): Target | null {
  if (!validLabel(raw) || isFootnoteLabel(raw)) return null;
  return map.get(normalizeLabel(raw)) ?? null;
}

function emitLink(text: string, target: Target, image: boolean): string {
  const dest = formatDest(target.dest);
  // An empty destination with a title needs `<>`, or the title
  // quote is read as the destination.
  const href = target.dest === "" && target.title != null ? "<>" : dest;
  const body =
    target.title == null
      ? `[${text}](${href})`
      : `[${text}](${href} "${formatTitle(target.title)}")`;
  return image ? `!${body}` : body;
}

function formatDest(dest: string): string {
  if (/[\s<>()]/.test(dest)) {
    const safe = dest.replaceAll("<", "%3C").replaceAll(">", "%3E");
    return `<${safe}>`;
  }
  return dest;
}

function formatTitle(title: string): string {
  return formatCommonMarkTitle(title);
}

function readBracket(src: string, open: number, blocked: Range[]): Bracket | null {
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

function readDestination(src: string, i: number): { dest: string; next: number } | null {
  if (i >= src.length) return null;
  if (src[i] === "<") {
    let j = i + 1;
    let out = "";
    while (j < src.length) {
      const ch = src[j] ?? "";
      // v1.74: spaces and tabs are part of the destination. A newline
      // or a second `<` ends it. A backslash escapes punctuation only.
      if (ch === "\n" || ch === "<") return null;
      if (ch === "\\" && j + 1 < src.length && ASCII_PUNCT.includes(src[j + 1] ?? "")) {
        out += src[j + 1];
        j += 2;
        continue;
      }
      if (ch === ">") {
        // v1.92: `<>` is an empty destination. A non-empty one is unchanged.
        return { dest: out, next: j + 1 };
      }
      out += ch;
      j += 1;
    }
    return null;
  }
  let j = i;
  let out = "";
  let depth = 0;
  while (j < src.length) {
    const ch = src[j] ?? "";
    // v1.79: a backslash escapes ASCII punctuation only. `\b` keeps
    // the backslash so the destination pass can encode `%5C`.
    if (ch === "\\") {
      if (j + 1 < src.length && ASCII_PUNCT.includes(src[j + 1] ?? "")) {
        out += src[j + 1];
        j += 2;
        continue;
      }
      out += ch;
      j += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") break;
    if (ch.charCodeAt(0) < 32) break;
    if (ch === "(") {
      depth += 1;
      out += ch;
      j += 1;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) break;
      depth -= 1;
      out += ch;
      j += 1;
      continue;
    }
    out += ch;
    j += 1;
  }
  if (!out || depth !== 0) return null;
  return { dest: out, next: j };
}

function tryTitle(
  src: string,
  i: number,
  blocked: Range[],
): { title: string; next: number } | null {
  const at = skipDestWs(src, i, blocked);
  if (at == null || at === i) return null;
  const opener = src[at];
  if (opener !== '"' && opener !== "'" && opener !== "(") return null;
  const read = readCommonMarkTitle(src, at);
  if (!read) return null;
  return { title: commonMarkTitleHint(read.raw), next: read.next };
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

function skipDestWs(src: string, i: number, blocked: Range[]): number | null {
  let j = i;
  while (src[j] === " " || src[j] === "\t") j += 1;
  if (src[j] !== "\n") return j;
  const nextLine = j + 1;
  if (nextLine >= src.length || src[nextLine] === "\n") return null;
  if (inRange(nextLine, blocked)) return null;
  let k = nextLine;
  while (src[k] === " " || src[k] === "\t") k += 1;
  // A whitespace-only continuation is a blank line, not a destination or title.
  if (k >= src.length || src[k] === "\n") return null;
  return k;
}

function skipSpTab(src: string, i: number): number {
  let j = i;
  while (src[j] === " " || src[j] === "\t") j += 1;
  return j;
}

function validLabel(raw: string): boolean {
  if (raw.length < 1 || raw.length > 1000) return false;
  let has = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      has = true;
      i += 1;
      continue;
    }
    if (ch === "[" || ch === "]") return false;
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") has = true;
  }
  return has;
}

function isFootnoteDefinitionLine(line: string): boolean {
  return /^ {0,3}\[\^[A-Za-z0-9_-]+\]:/.test(line);
}

function isFootnoteLabel(raw: string): boolean {
  if (!raw.startsWith("^") || raw.length < 2) return false;
  for (let i = 1; i < raw.length; i += 1) {
    if (!FOOTNOTE_CHAR.test(raw[i] ?? "")) return false;
  }
  return true;
}

function footnoteBracketEnd(src: string, open: number): number | null {
  if (src[open] !== "[" || src[open + 1] !== "^" || isEscaped(src, open)) return null;
  let j = open + 2;
  if (!FOOTNOTE_CHAR.test(src[j] ?? "")) return null;
  while (j < src.length && FOOTNOTE_CHAR.test(src[j] ?? "")) j += 1;
  if (src[j] !== "]") return null;
  return j + 1;
}

function normalizeLabel(raw: string): string {
  // v1.91: cmark folds case and whitespace only. `foo\!` is not `foo!`.
  return unicodeCaseFold(raw).trim().replace(/\s+/g, " ");
}

function isTaskMarker(src: string, open: number): boolean {
  const lineStart = src.lastIndexOf("\n", open - 1) + 1;
  let prefix = src.slice(lineStart, open);
  prefix = prefix.slice(quotePrefixLength(prefix));
  if (!/^ {0,3}[-*+][ \t]+$/.test(prefix)) return false;
  const mark = src[open + 1];
  if (mark !== " " && mark !== "x" && mark !== "X") return false;
  if (src[open + 2] !== "]") return false;
  const after = src[open + 3];
  return after == null || after === " " || after === "\t" || after === "\n";
}

function quotePrefixLength(line: string): number {
  let i = 0;
  while (i < line.length) {
    let j = i;
    let spaces = 0;
    while (j < line.length && line[j] === " " && spaces < 3) {
      j += 1;
      spaces += 1;
    }
    if (line[j] !== ">") break;
    j += 1;
    if (line[j] === " ") j += 1;
    i = j;
  }
  return i;
}

function isEscaped(src: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function protectedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const skip = [...fences, ...codes];
  return mergeRanges([...skip, ...mathRanges(src, skip)]);
}

function mathRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  const lines = lineSpans(src);
  let open: number | null = null;
  for (const line of lines) {
    if (inRange(line.start, skip)) {
      open = null;
      continue;
    }
    const trimmed = line.text.trim();
    if (trimmed === "$$") {
      if (open == null) open = line.start;
      else {
        const end = line.end < src.length ? line.end + 1 : line.end;
        ranges.push({ start: open, end });
        open = null;
      }
      continue;
    }
    if (
      open == null &&
      trimmed.startsWith("$$") &&
      trimmed.endsWith("$$") &&
      trimmed.length > 4
    ) {
      const end = line.end < src.length ? line.end + 1 : line.end;
      ranges.push({ start: line.start, end });
    }
  }
  if (open != null) ranges.push({ start: open, end: src.length });
  let i = 0;
  while (i < src.length) {
    if (inRange(i, skip) || inRange(i, ranges)) {
      i += 1;
      continue;
    }
    if (src[i] !== "\\" || src[i + 1] !== "(") {
      i += 1;
      continue;
    }
    let j = i + 2;
    let closed = -1;
    while (j < src.length - 1) {
      if (inRange(j, skip)) {
        j += 1;
        continue;
      }
      if (src[j] === "\\" && src[j + 1] === ")") {
        closed = j;
        break;
      }
      j += 1;
    }
    if (closed >= 0) {
      ranges.push({ start: i, end: closed + 2 });
      i = closed + 2;
      continue;
    }
    ranges.push({ start: i, end: src.length });
    break;
  }
  return ranges;
}

function tableLineSet(lines: LineSpan[]): Set<number> {
  const inTable = new Set<number>();
  let fence: string | null = null;
  let inMath = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.text;
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      i += 1;
      continue;
    }
    const end = tableEnd(lines, i);
    if (end > i) {
      for (let k = i; k < end; k += 1) inTable.add(k);
      i = end;
      continue;
    }
    i += 1;
  }
  return inTable;
}

function tableEnd(lines: LineSpan[], start: number): number {
  return markdownTableEnd(
    lines.map((line) => line.text),
    start,
  );
}

function blockGate(
  line: string,
  fence: string | null,
  inMath: boolean,
): { fence: string | null; inMath: boolean; blocked: boolean } {
  if (!inMath) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[2] ?? "";
      const info = match[3] ?? "";
      if (!fence) {
        if (marker[0] === "`" && info.includes("`")) {
          return { fence: null, inMath, blocked: false };
        }
        return { fence: marker, inMath, blocked: true };
      }
      const same =
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        info.trim() === "";
      return { fence: same ? null : fence, inMath, blocked: true };
    }
  }
  if (fence) return { fence, inMath, blocked: true };
  if (line.trim() === "$$") return { fence, inMath: !inMath, blocked: true };
  if (inMath) return { fence, inMath, blocked: true };
  return { fence, inMath, blocked: false };
}

function lineIsFootnoteOwned(lines: LineSpan[], index: number): boolean {
  if (indentColumns(lines[index]!.text) < 1) return false;
  for (let j = index - 1; j >= 0; j -= 1) {
    const text = lines[j]!.text;
    if (text.trim() === "") continue;
    if (/^ {0,3}\[\^[A-Za-z0-9_-]+\]:/.test(text)) return true;
    if (indentColumns(text) >= 2) continue;
    return false;
  }
  return false;
}

function indentColumns(line: string): number {
  let columns = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4;
    else break;
  }
  return columns;
}

function overlaps(start: number, end: number, ranges: Range[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function rangeAt(index: number, ranges: Range[]): Range | null {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) return range;
  }
  return null;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (!last || range.start > last.end) out.push({ start: range.start, end: range.end });
    else last.end = Math.max(last.end, range.end);
  }
  return out;
}

function removeRanges(src: string, cuts: Cut[]): string {
  const sorted = [...cuts].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const cut of sorted) {
    if (cut.start < cursor) continue;
    out += src.slice(cursor, cut.start);
    out += cut.text;
    cursor = Math.max(cursor, cut.end);
  }
  out += src.slice(cursor);
  return out;
}

type LineSpan = { text: string; start: number; end: number };

function lineSpans(src: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let i = 0;
  while (i <= src.length) {
    const nl = src.indexOf("\n", i);
    const end = nl < 0 ? src.length : nl;
    spans.push({ text: src.slice(i, end), start: i, end });
    if (nl < 0) break;
    i = nl + 1;
  }
  return spans;
}

function lineEnd(src: string, index: number): number {
  const nl = src.indexOf("\n", index);
  return nl < 0 ? src.length : nl;
}
