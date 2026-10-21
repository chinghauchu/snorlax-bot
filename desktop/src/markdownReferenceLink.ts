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
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownReferenceLink.swift`.
 */

import { splitRow } from "./markdownTable.ts";
import {
  fenceRanges,
  inRange,
  inlineCodeRanges,
  type Range,
} from "./math.ts";

type Target = { dest: string; title: string | null };

type ParsedDef = {
  label: string;
  dest: string;
  title: string | null;
  start: number;
  end: number;
};

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

function collectDefinitions(
  src: string,
  blocked: Range[],
): { map: Map<string, Target>; cuts: Range[] } {
  const lines = lineSpans(src);
  const tables = tableLineSet(lines);
  const map = new Map<string, Target>();
  const cuts: Range[] = [];
  let i = 0;
  while (i < lines.length) {
    if (tables.has(i) || lineIsFootnoteOwned(lines, i)) {
      i += 1;
      continue;
    }
    const line = lines[i]!;
    if (inRange(line.start, blocked)) {
      i += 1;
      continue;
    }
    const parsed = parseDefinition(src, line.start, blocked);
    if (!parsed) {
      i += 1;
      continue;
    }
    let endLine = i;
    while (endLine < lines.length && lines[endLine]!.start < parsed.end) endLine += 1;
    let bad = false;
    for (let k = i; k < endLine; k += 1) {
      if (tables.has(k)) bad = true;
    }
    if (bad || overlaps(parsed.start, parsed.end, blocked)) {
      i += 1;
      continue;
    }
    if (!map.has(parsed.label)) {
      map.set(parsed.label, { dest: parsed.dest, title: parsed.title });
    }
    cuts.push({ start: parsed.start, end: parsed.end });
    i = Math.max(endLine, i + 1);
  }
  return { map, cuts };
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
  let title: string | null = null;
  const titled = tryTitle(src, j, blocked);
  if (titled) {
    title = titled.title;
    j = titled.next;
  }
  j = skipSpTab(src, j);
  if (j < src.length && src[j] !== "\n") return null;
  const end = j < src.length ? j + 1 : j;
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

function applyReferences(src: string, map: Map<string, Target>, blocked: Range[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < src.length) {
    const blockedAt = rangeAt(i, blocked);
    if (blockedAt) {
      parts.push(src.slice(i, blockedAt.end));
      i = blockedAt.end;
      continue;
    }
    if (
      src[i] === "!" &&
      src[i + 1] === "[" &&
      !isEscaped(src, i)
    ) {
      const image = takeImage(src, i + 1, blocked, map);
      parts.push(image.replacement);
      i = image.next;
      continue;
    }
    if (src[i] !== "[" || isEscaped(src, i)) {
      parts.push(src[i] ?? "");
      i += 1;
      continue;
    }
    const footnoteEnd = footnoteBracketEnd(src, i);
    if (footnoteEnd != null) {
      parts.push(src.slice(i, footnoteEnd));
      i = footnoteEnd;
      continue;
    }
    const bracket = readBracket(src, i, blocked);
    if (!bracket) {
      parts.push(src[i] ?? "");
      i += 1;
      continue;
    }
    const after = bracket.next;
    if (src[after] === "(") {
      const inlineEnd = skipInline(src, after);
      if (inlineEnd != null) {
        parts.push(src.slice(i, inlineEnd));
        i = inlineEnd;
        continue;
      }
    }
    if (src[after] === "[") {
      const second = readBracket(src, after, blocked);
      if (second) {
        const collapsed = second.raw.trim() === "";
        const labelRaw = collapsed ? bracket.raw : second.raw;
        const target = lookupLabel(map, labelRaw);
        if (target && !(collapsed && isFootnoteLabel(bracket.raw))) {
          parts.push(emitLink(bracket.raw, target, false));
          i = second.next;
          continue;
        }
      }
    }
    if (
      validLabel(bracket.raw) &&
      !isFootnoteLabel(bracket.raw) &&
      !isTaskMarker(src, i)
    ) {
      const target = lookupLabel(map, bracket.raw);
      if (target) {
        parts.push(emitLink(bracket.raw, target, false));
        i = bracket.next;
        continue;
      }
    }
    parts.push(src[i] ?? "");
    i += 1;
  }
  return parts.join("");
}

function takeImage(
  src: string,
  open: number,
  blocked: Range[],
  map: Map<string, Target>,
): { replacement: string; next: number } {
  const bang = open - 1;
  const bracket = readBracket(src, open, blocked);
  if (!bracket) return { replacement: src[bang] ?? "!", next: bang + 1 };
  const after = bracket.next;
  if (src[after] === "(") {
    const inlineEnd = skipInline(src, after);
    if (inlineEnd != null) {
      return { replacement: src.slice(bang, inlineEnd), next: inlineEnd };
    }
  }
  if (src[after] === "[") {
    const second = readBracket(src, after, blocked);
    if (second) {
      const collapsed = second.raw.trim() === "";
      const labelRaw = collapsed ? bracket.raw : second.raw;
      const target = lookupLabel(map, labelRaw);
      if (target && !(collapsed && isFootnoteLabel(bracket.raw))) {
        return { replacement: emitLink(bracket.raw, target, true), next: second.next };
      }
      return { replacement: src.slice(bang, second.next), next: second.next };
    }
  }
  const target = lookupLabel(map, bracket.raw);
  if (target && !isFootnoteLabel(bracket.raw)) {
    return { replacement: emitLink(bracket.raw, target, true), next: bracket.next };
  }
  return { replacement: src.slice(bang, bracket.next), next: bracket.next };
}

function lookupLabel(map: Map<string, Target>, raw: string): Target | null {
  if (!validLabel(raw) || isFootnoteLabel(raw)) return null;
  return map.get(normalizeLabel(raw)) ?? null;
}

function emitLink(text: string, target: Target, image: boolean): string {
  const dest = formatDest(target.dest);
  const body =
    target.title == null
      ? `[${text}](${dest})`
      : `[${text}](${dest} "${formatTitle(target.title)}")`;
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
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function skipInline(src: string, openParen: number): number | null {
  if (src[openParen] !== "(") return null;
  let j = openParen + 1;
  let lineBreaks = 0;
  while (src[j] === " " || src[j] === "\t" || src[j] === "\n") {
    if (src[j] === "\n") {
      lineBreaks += 1;
      if (lineBreaks > 1 || src[j + 1] === "\n") return null;
    }
    j += 1;
  }
  if (src[j] === ")") return null;
  const dest = readDestination(src, j);
  if (!dest) return null;
  j = dest.next;
  while (src[j] === " " || src[j] === "\t") j += 1;
  if (src[j] === '"' || src[j] === "'" || (src[j] === "(" && dest.dest.length > 0)) {
    const title = readTitle(src, j);
    if (!title) return null;
    j = title.next;
    while (src[j] === " " || src[j] === "\t") j += 1;
  }
  if (src[j] !== ")") return null;
  return j + 1;
}

function readDestination(src: string, i: number): { dest: string; next: number } | null {
  if (i >= src.length) return null;
  if (src[i] === "<") {
    let j = i + 1;
    let out = "";
    while (j < src.length) {
      const ch = src[j] ?? "";
      if (ch === "\n" || ch === "<" || ch === " " || ch === "\t") return null;
      if (ch === "\\") {
        if (j + 1 >= src.length) return null;
        out += src[j + 1];
        j += 2;
        continue;
      }
      if (ch === ">") {
        if (!out) return null;
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
    if (ch === "\\") {
      if (j + 1 >= src.length) break;
      out += src[j + 1];
      j += 2;
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

function readTitle(src: string, i: number): { title: string; next: number } | null {
  const opener = src[i];
  const closer = opener === "(" ? ")" : opener;
  if (opener !== '"' && opener !== "'" && opener !== "(") return null;
  let j = i + 1;
  let out = "";
  while (j < src.length) {
    const ch = src[j] ?? "";
    if (ch === "\n") return null;
    if (ch === "\\") {
      if (j + 1 >= src.length) return null;
      out += src[j + 1];
      j += 2;
      continue;
    }
    if (ch === closer) return { title: out, next: j + 1 };
    out += ch;
    j += 1;
  }
  return null;
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
  return readTitle(src, at);
}

function skipDestWs(src: string, i: number, blocked: Range[]): number | null {
  let j = i;
  while (src[j] === " " || src[j] === "\t") j += 1;
  if (src[j] !== "\n") return j;
  const nextLine = j + 1;
  if (nextLine >= src.length || src[nextLine] === "\n") return null;
  if (inRange(nextLine, blocked)) return null;
  let k = nextLine;
  let spaces = 0;
  while (src[k] === " " && spaces < 3) {
    k += 1;
    spaces += 1;
  }
  if (src[k] === " " || src[k] === "\t") return null;
  return k;
}

function skipSpTab(src: string, i: number): number {
  let j = i;
  while (src[j] === " " || src[j] === "\t") j += 1;
  return j;
}

function validLabel(raw: string): boolean {
  if (raw.length < 1 || raw.length > 999) return false;
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
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    if (ch === "\\" && i + 1 < raw.length) {
      out += raw[i + 1];
      i += 1;
      continue;
    }
    out += ch;
  }
  return out.trim().replace(/\s+/g, " ").toLowerCase();
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
  if (start + 1 >= lines.length) return start;
  const headerLine = lines[start]!.text;
  const delimLine = lines[start + 1]!.text;
  if (!isTableLine(headerLine) || !isTableLine(delimLine)) return start;
  const header = splitRow(headerLine);
  const delim = splitRow(delimLine);
  if (!header || !delim || header.length !== delim.length) return start;
  if (!delim.every((cell) => /^:?-+:?$/.test(cell))) return start;
  let next = start + 2;
  while (next < lines.length) {
    const line = lines[next]!.text;
    if (!isTableLine(line) || !splitRow(line)) break;
    next += 1;
  }
  return next;
}

function isTableLine(line: string): boolean {
  if (/^ {4,}/.test(line)) return false;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(">")) return false;
  if (/^([-*+]|\d+[.)])\s/.test(trimmed)) return false;
  return true;
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

function removeRanges(src: string, cuts: Range[]): string {
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const cut of sorted) {
    if (cut.start < cursor) continue;
    out += src.slice(cursor, cut.start);
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
