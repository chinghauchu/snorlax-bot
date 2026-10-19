// SPDX-License-Identifier: Apache-2.0

/**
 * v1.32: GFM blockquotes and task lists on completed assistant
 * LEFT `kind=message`. A quote line (`>` / nested `>>`) renders
 * with a muted left rule and indent. `- [ ]` / `- [x]` render as
 * read-only checkbox glyphs; checked items are muted. Streaming
 * stays the markdown string, so the bubble renders as it does
 * today. Copy controls keep the message markdown source — this
 * module only splits text for display and does not copy.
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
      while (i < lines.length && stripQuoteMarker(lines[i] ?? "") != null) {
        inner.push(stripQuoteMarker(lines[i] ?? "") ?? "");
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
