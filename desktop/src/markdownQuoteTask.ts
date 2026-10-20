// SPDX-License-Identifier: Apache-2.0

/**
 * v1.32: GFM blockquotes and task lists on completed assistant
 * LEFT `kind=message`. A quote line (`>` / nested `>>`) renders
 * with a muted left rule and indent. `- [ ]` / `- [x]` render as
 * read-only checkbox glyphs; checked items are muted.
 * v1.47: CommonMark lazy continuation of a blockquote. A non-blank
 * line that continues an open quote paragraph, and does not
 * itself start a list, an ATX heading, a fence, a thematic
 * break, or a `$$` block, stays inside that quote. A blank line
 * ends it. Nested quotes keep the continuation. A margin list,
 * heading, fence, or rule ends the quote. Streaming stays the
 * markdown string, so the bubble renders as it does today.
 * Copy controls keep the message markdown source — this module
 * only splits text for display and does not copy.
 * No animation. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/MarkdownQuoteTask.swift`.
 */

/** Empty ballot box. Not a control. */
export const TASK_UNCHECKED_GLYPH = "☐";

/** Ballot box with check. Not a control. */
export const TASK_CHECKED_GLYPH = "☑";

export const TASK_UNCHECKED_LABEL = "Unchecked";

export const TASK_CHECKED_LABEL = "Checked";

export type TaskItem = {
  checked: boolean;
  /** Text after the marker. Markers themselves are not included. */
  text: string;
};

export type QuoteTaskBlock =
  | { type: "markdown"; text: string }
  | { type: "quote"; text: string }
  | { type: "tasks"; items: TaskItem[] };

/** Never animate, including when Reduce Motion is off. */
export function quoteTaskAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export function taskGlyph(checked: boolean): string {
  return checked ? TASK_CHECKED_GLYPH : TASK_UNCHECKED_GLYPH;
}

export function taskGlyphLabel(checked: boolean): string {
  return checked ? TASK_CHECKED_LABEL : TASK_UNCHECKED_LABEL;
}

/**
 * Pull top-level quotes and task lists out of completed markdown.
 * Fences and `$$` blocks stay markdown. `completed: false` returns
 * the text unchanged.
 */
export function splitQuoteAndTasks(
  text: string,
  completed = true,
): QuoteTaskBlock[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!completed) return [{ type: "markdown", text: src }];

  const lines = src.split("\n");
  const blocks: QuoteTaskBlock[] = [];
  let mdStart = 0;
  let i = 0;
  let fence: string | null = null;
  let inMath = false;

  const pushMarkdown = (end: number) => {
    if (end <= mdStart) return;
    const chunk = lines.slice(mdStart, end).join("\n");
    if (chunk.trim()) blocks.push({ type: "markdown", text: chunk });
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const gate = blockGate(line, fence, inMath);
    fence = gate.fence;
    inMath = gate.inMath;
    if (gate.blocked) {
      i += 1;
      continue;
    }
    if (stripQuoteMarker(line) != null) {
      const start = i;
      const inner: string[] = [];
      let open = false;
      while (i < lines.length) {
        const current = lines[i] ?? "";
        const stripped = stripQuoteMarker(current);
        if (stripped != null) {
          inner.push(stripped);
          open = paragraphOpenAfter(stripped, open);
          i += 1;
          continue;
        }
        // v1.47: a paragraph inside the quote may continue without `>`.
        if (!open || endsLazyQuote(current, open)) break;
        inner.push(current);
        open = true;
        i += 1;
      }
      pushMarkdown(start);
      blocks.push({ type: "quote", text: inner.join("\n") });
      mdStart = i;
      continue;
    }
    const task = parseTaskLine(line);
    if (task) {
      const start = i;
      const items: TaskItem[] = [];
      while (i < lines.length) {
        const next = parseTaskLine(lines[i] ?? "");
        if (!next) break;
        items.push(next);
        i += 1;
      }
      pushMarkdown(start);
      blocks.push({ type: "tasks", items });
      mdStart = i;
      continue;
    }
    i += 1;
  }
  pushMarkdown(lines.length);
  if (blocks.length === 0) return [{ type: "markdown", text: src }];
  return blocks;
}

/** One CommonMark quote marker, or null when the line is not a quote. */
export function stripQuoteMarker(line: string): string | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  if (line[i] !== ">") return null;
  i += 1;
  if (line[i] === " ") i += 1;
  return line.slice(i);
}

/**
 * A GFM task item: 0–3 spaces, `-`/`*`/`+`, whitespace, then
 * `[ ]`, `[x]`, or `[X]`, then whitespace or the end of the line.
 * `- [x]done` (no space after the marker) stays ordinary text.
 */
export function parseTaskLine(line: string): TaskItem | null {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === " ") i += 1;
  const marker = line[i];
  if (marker !== "-" && marker !== "*" && marker !== "+") return null;
  i += 1;
  if (line[i] !== " " && line[i] !== "\t") return null;
  while (line[i] === " " || line[i] === "\t") i += 1;
  if (line[i] !== "[") return null;
  i += 1;
  const mark = line[i];
  if (mark !== " " && mark !== "x" && mark !== "X") return null;
  i += 1;
  if (line[i] !== "]") return null;
  i += 1;
  if (i >= line.length) return { checked: mark !== " ", text: "" };
  if (line[i] !== " " && line[i] !== "\t") return null;
  while (line[i] === " " || line[i] === "\t") i += 1;
  return { checked: mark !== " ", text: line.slice(i) };
}

/**
 * A quote paragraph stays open after this stripped quote line.
 * Nested `>` markers peel first, so `> > foo` is still open and
 * `> # Foo` is not. An empty list item does not open a paragraph.
 */
function paragraphOpenAfter(stripped: string, wasOpen: boolean): boolean {
  const content = innermostQuote(stripped);
  if (isBlank(content) || isMathFence(content)) return false;
  if (isThematicBreak(content) || isAtxHeading(content) || isFenceLine(content)) {
    return false;
  }
  if (isMarginListMarker(content)) return listItemOpensParagraph(content);
  if (!wasOpen && isIndentedCodeLine(content)) return false;
  return true;
}

/** Peel one quote marker at a time until the line is not a quote. */
function innermostQuote(line: string): string {
  let current = line;
  for (;;) {
    const next = stripQuoteMarker(current);
    if (next == null) return current;
    current = next;
  }
}

/**
 * This line closes the quote instead of joining it. A blank line,
 * a `$$` block, a thematic break, an ATX heading, a fence, or a
 * list marker in the first three columns does. Indented code does
 * only when no paragraph is open.
 */
function endsLazyQuote(line: string, paragraphOpen: boolean): boolean {
  if (isBlank(line) || isMathFence(line)) return true;
  if (
    isThematicBreak(line) ||
    isAtxHeading(line) ||
    isFenceLine(line) ||
    isMarginListMarker(line)
  ) {
    return true;
  }
  if (!paragraphOpen && isIndentedCodeLine(line)) return true;
  return false;
}

function isBlank(line: string): boolean {
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") return false;
  }
  return true;
}

function isMathFence(line: string): boolean {
  return line.trim() === "$$";
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

function isThematicBreak(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const mark = line[lead.index];
  if (mark !== "-" && mark !== "*" && mark !== "_") return false;
  let count = 0;
  for (let i = lead.index; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === mark) {
      count += 1;
      continue;
    }
    if (ch === " " || ch === "\t") continue;
    return false;
  }
  return count >= 3;
}

function isAtxHeading(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  let i = lead.index;
  let hashes = 0;
  while (i < line.length && line[i] === "#" && hashes < 7) {
    hashes += 1;
    i += 1;
  }
  if (hashes < 1 || hashes > 6) return false;
  if (i >= line.length) return true;
  return line[i] === " " || line[i] === "\t";
}

function isFenceLine(line: string): boolean {
  const lead = leadingColumns(line);
  if (lead.columns > 3) return false;
  const mark = line[lead.index];
  if (mark !== "`" && mark !== "~") return false;
  let count = 0;
  let i = lead.index;
  while (i < line.length && line[i] === mark) {
    count += 1;
    i += 1;
  }
  return count >= 3;
}

function isIndentedCodeLine(line: string): boolean {
  if (isBlank(line)) return false;
  return leadingColumns(line).columns >= 4;
}

/** A bullet or ordered marker in the first three columns. */
function isMarginListMarker(line: string): boolean {
  return listMarkerLength(line) > 0;
}

function listItemOpensParagraph(line: string): boolean {
  const marker = listMarkerLength(line);
  if (marker <= 0) return false;
  const lead = leadingColumns(line);
  const rest = line.slice(lead.index + marker);
  let i = 0;
  while (i < rest.length && (rest[i] === " " || rest[i] === "\t")) i += 1;
  return rest.slice(i).length > 0;
}

function listMarkerLength(line: string): number {
  const lead = leadingColumns(line);
  if (lead.columns >= 4) return 0;
  const rest = line.slice(lead.index);
  const bullet = rest[0];
  if (bullet === "-" || bullet === "*" || bullet === "+") {
    if (rest.length === 1) return 1;
    const next = rest[1];
    return next === " " || next === "\t" ? 1 : 0;
  }
  const ordered = /^(\d{1,9})[.)]/.exec(rest);
  if (!ordered) return 0;
  const len = ordered[0].length;
  if (rest.length === len) return len;
  const next = rest[len];
  return next === " " || next === "\t" ? len : 0;
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
      if (!fence) return { fence: marker, inMath, blocked: true };
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
