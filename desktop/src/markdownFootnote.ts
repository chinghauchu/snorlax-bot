// SPDX-License-Identifier: Apache-2.0

/**
 * v1.38: GFM footnotes on a completed assistant LEFT `kind=message`.
 *
 * A reference `[^1]` (or `[^note]`) becomes a superscript marker.
 * The matching definition `[^1]: note text` leaves the body and is
 * listed, muted and numbered, at the end of the message. Numbering
 * follows the first reference, not the label. A second reference to
 * the same label reuses that number. Unmatched references and
 * definitions stay plain text. References and definitions inside a
 * fence, inline code span, or `$$` / `\( \)` math stay literal.
 * Streaming (`completed: false`) returns the text unchanged.
 * Copy controls keep markdown source — this module does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownFootnote.swift`.
 */

import { fenceRanges, inRange, inlineCodeRanges, type Range } from "./math.ts";

export const FOOTNOTES_TITLE = "Footnotes";

export const FOOTNOTE_SHOW = "Show footnote";

/** Marker placeholder. Digits are the 1-based display number. */
export const FOOTNOTE_TOKEN = /§§SBFN(\d+)§§/g;

const LABEL = "[A-Za-z0-9_-]+";
const DEF_RE = new RegExp(`^( {0,3})\\[\\^(${LABEL})\\]:[ \\t]*(.*)$`);
const REF_RE = new RegExp(`\\[\\^(${LABEL})\\]`, "g");

export type Footnote = {
  /** Original label, such as `1` or `note`. */
  label: string;
  /** 1-based number in order of first reference. */
  number: number;
  /** Definition body. Matched references inside it are tokens. */
  text: string;
};

export type FootnotePiece =
  | { type: "text"; value: string }
  | { type: "ref"; number: number };

export type ExtractedFootnotes = {
  /** Body with matched definitions removed and references tokenized. */
  text: string;
  notes: Footnote[];
};

type Def = {
  label: string;
  /** Note body before reference tokens are applied. */
  raw: string;
  start: number;
  end: number;
};

type Ref = {
  label: string;
  start: number;
  end: number;
  /** Definition that contains this reference, if any. */
  inDef: string | null;
};

/** Never animate, including when Reduce Motion is off. */
export function footnoteAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export function footnoteToken(number: number): string {
  return `§§SBFN${number}§§`;
}

export function footnoteRefLabel(number: number): string {
  return `Footnote ${number}`;
}

export function footnoteBackLabel(number: number): string {
  return `Back to reference ${number}`;
}

/** Visible note text: tokens become their numbers. */
export function plainFootnoteText(text: string): string {
  return text.replace(new RegExp(FOOTNOTE_TOKEN.source, "g"), "$1");
}

/**
 * Pull matched footnotes out of completed markdown.
 * `completed: false`, or a message with no matched pair, returns
 * `text` unchanged and no notes.
 */
export function extractFootnotes(
  text: string,
  completed = true,
): ExtractedFootnotes {
  if (!completed) return { text, notes: [] };
  if (!text) return { text, notes: [] };
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocked = protectedRanges(src);
  const defs = collectDefs(src, blocked);
  if (!defs.length) return { text, notes: [] };
  const refs = collectRefs(src, blocked, defs);
  const used = usedLabels(refs, defs);
  if (!used.size) return { text, notes: [] };

  const numberByLabel = new Map<string, number>();
  const notes: Footnote[] = [];
  for (const ref of refs) {
    if (!qualifies(ref, used)) continue;
    if (numberByLabel.has(ref.label)) continue;
    const def = defs.find((item) => item.label === ref.label);
    if (!def) continue;
    const number = numberByLabel.size + 1;
    numberByLabel.set(ref.label, number);
    notes.push({
      label: ref.label,
      number,
      text: rewriteRefs(def.raw, numberByLabel, used),
    });
  }
  // A note can mention a later footnote. Rewrite again now that every
  // used label has a number.
  for (const note of notes) {
    const def = defs.find((item) => item.label === note.label);
    if (!def) continue;
    note.text = rewriteRefs(def.raw, numberByLabel, used);
  }

  const cuts = defs
    .filter((def) => used.has(def.label))
    .map((def) => ({ start: def.start, end: def.end }));
  const body = rewriteRefs(removeRanges(src, cuts), numberByLabel, used);
  return { text: body, notes };
}

/**
 * Find corpus for one message. The last bubble also carries the note
 * text so a query that only appears in a footnote still hits the row.
 * Display text is unchanged when `notes` is empty.
 */
export function footnoteFindTexts(
  bubbles: string[],
  notes: Footnote[],
): string[] {
  if (!notes.length || !bubbles.length) return bubbles;
  const next = bubbles.slice();
  const last = next.length - 1;
  const suffix = notes
    .map((note) => `${note.number}. ${plainFootnoteText(note.text)}`)
    .join("\n");
  next[last] = `${next[last]}\n${suffix}`;
  return next;
}

export function splitFootnoteTokens(text: string): FootnotePiece[] {
  const pieces: FootnotePiece[] = [];
  const re = new RegExp(FOOTNOTE_TOKEN.source, "g");
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    const number = Number(match[1]);
    if (!Number.isFinite(number) || number < 1) continue;
    if (index > last) pieces.push({ type: "text", value: text.slice(last, index) });
    pieces.push({ type: "ref", number });
    last = index + match[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  if (!pieces.length) pieces.push({ type: "text", value: text });
  return pieces;
}

export function footnoteSelector(
  scope: string,
  number: number,
  which: "note" | "ref",
): string {
  const attr = which === "note" ? "data-fn-note" : "data-fn-ref";
  return `[${attr}="${escapeCss(scope)}"][data-fn-number="${number}"]`;
}

/** Scroll the first matching marker or note into view and focus it. */
export function focusFootnote(
  scope: string,
  number: number,
  which: "note" | "ref",
): void {
  if (!scope || number < 1 || typeof document === "undefined") return;
  const el = document.querySelector(footnoteSelector(scope, number, which));
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ block: "nearest", behavior: "auto" });
  el.focus({ preventScroll: true });
}

function usedLabels(refs: Ref[], defs: Def[]): Set<string> {
  const known = new Set(defs.map((def) => def.label));
  const used = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const ref of refs) {
      if (!known.has(ref.label) || used.has(ref.label)) continue;
      if (ref.inDef != null && !used.has(ref.inDef)) continue;
      used.add(ref.label);
      changed = true;
    }
  }
  return used;
}

function qualifies(ref: Ref, used: Set<string>): boolean {
  if (!used.has(ref.label)) return false;
  if (ref.inDef != null && !used.has(ref.inDef)) return false;
  return true;
}

function collectDefs(src: string, blocked: Range[]): Def[] {
  const lines = lineSpans(src);
  const defs: Def[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (inRange(line.start, blocked)) {
      i += 1;
      continue;
    }
    const match = DEF_RE.exec(line.text);
    if (!match) {
      i += 1;
      continue;
    }
    const markerAt = line.start + (match[1]?.length ?? 0);
    if (inRange(markerAt, blocked)) {
      i += 1;
      continue;
    }
    const label = match[2] ?? "";
    const first = match[3] ?? "";
    let j = i + 1;
    const body: string[] = [first];
    while (j < lines.length) {
      const next = lines[j]!;
      if (inRange(next.start, blocked)) break;
      if (DEF_RE.test(next.text) && indentColumns(next.text) <= 3) break;
      if (next.text.trim() === "") {
        let k = j + 1;
        while (k < lines.length && lines[k]!.text.trim() === "") k += 1;
        if (k >= lines.length) break;
        const upcoming = lines[k]!;
        if (inRange(upcoming.start, blocked)) break;
        if (DEF_RE.test(upcoming.text) && indentColumns(upcoming.text) <= 3) break;
        if (indentColumns(upcoming.text) >= 2) {
          body.push(next.text);
          j += 1;
          continue;
        }
        break;
      }
      if (indentColumns(next.text) >= 2) {
        body.push(next.text);
        j += 1;
        continue;
      }
      break;
    }
    const last = lines[j - 1]!;
    const end = last.end < src.length ? last.end + 1 : last.end;
    if (!seen.has(label)) {
      seen.add(label);
      defs.push({
        label,
        raw: noteText(body),
        start: line.start,
        end,
      });
    }
    i = j;
  }
  return defs;
}

function collectRefs(src: string, blocked: Range[], defs: Def[]): Ref[] {
  const refs: Ref[] = [];
  const re = new RegExp(REF_RE.source, "g");
  for (const match of src.matchAll(re)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isEscaped(src, start)) continue;
    if (inRange(start, blocked)) continue;
    if (src[end] === ":") continue;
    const label = match[1] ?? "";
    const container = defs.find((def) => start >= def.start && start < def.end);
    refs.push({
      label,
      start,
      end,
      inDef: container ? container.label : null,
    });
  }
  return refs;
}

function rewriteRefs(
  text: string,
  numberByLabel: Map<string, number>,
  used: Set<string>,
): string {
  const blocked = protectedRanges(text);
  const re = new RegExp(REF_RE.source, "g");
  const matches = [...text.matchAll(re)];
  let out = text;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]!;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isEscaped(text, start)) continue;
    if (inRange(start, blocked)) continue;
    if (text[end] === ":") continue;
    const label = match[1] ?? "";
    if (!used.has(label)) continue;
    const number = numberByLabel.get(label);
    if (!number) continue;
    out = out.slice(0, start) + footnoteToken(number) + out.slice(end);
  }
  return out;
}

function noteText(lines: string[]): string {
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (index === 0) {
      out.push(line.replace(/[ \t]+$/g, ""));
      return;
    }
    if (line.trim() === "") {
      out.push("");
      return;
    }
    out.push(dedent(line).replace(/[ \t]+$/g, ""));
  });
  while (out.length && out[0]!.trim() === "") out.shift();
  while (out.length && out[out.length - 1]!.trim() === "") out.pop();
  return out.join("\n");
}

function dedent(line: string): string {
  if (line.startsWith("\t")) return line.slice(1);
  let i = 0;
  while (i < 4 && line[i] === " ") i += 1;
  return line.slice(i);
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

function isEscaped(src: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function protectedRanges(src: string): Range[] {
  const fences = fenceRanges(src);
  const codes = inlineCodeRanges(src, fences);
  const skip = [...fences, ...codes];
  return [...skip, ...mathRanges(src, skip)];
}

function mathRanges(src: string, skip: Range[]): Range[] {
  const ranges: Range[] = [];
  const lines = lineSpans(src);
  let open: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (inRange(line.start, skip)) {
      open = null;
      continue;
    }
    const trimmed = line.text.trim();
    if (trimmed === "$$") {
      if (open == null) {
        open = line.start;
      } else {
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

function escapeCss(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
}
