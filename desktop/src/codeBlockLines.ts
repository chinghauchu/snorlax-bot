// SPDX-License-Identifier: Apache-2.0

/**
 * v2.22: line numbers on a completed assistant code fence.
 * Lines sits beside Wrap. Default is no gutter. Lines shows a muted
 * number on each line of that block only. Each block is independent.
 * The choice lives in memory for the app session and is not written
 * to disk. Relaunch drops it. Copy and Save still use the fence body,
 * with no numbers added. No animation. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/CodeBlockLines.swift`.
 */

import {
  highlightCode,
  shouldHighlightCode,
  type CodeToken,
} from "./codeHighlight.ts";

export const CODE_BLOCK_LINES_LABEL = "Lines";

export const CODE_BLOCK_LINES_OFF_LABEL = "No lines";

/** Accessible name while the gutter is hidden. Visible text stays `Lines`. */
export const CODE_BLOCK_LINES_ARIA = "Show line numbers";

export const CODE_BLOCK_LINES_OFF_ARIA = "Hide line numbers";

/** In-memory only. Not written to disk, and not a server field. */
const session = new Map<string, boolean>();

export function codeBlockLinesByDefault(): boolean {
  return false;
}

/** Not saved across relaunch. The map dies with the page. */
export function codeBlockLinesPersists(): boolean {
  return false;
}

/** Numbers are display chrome. Copy and Save keep the fence body. */
export function codeBlockLinesInClipboard(): boolean {
  return false;
}

export function codeBlockLinesId(scope: string, index: number): string {
  return `${scope}\u0000${index}`;
}

export function readCodeBlockLines(id: string): boolean {
  if (!id) return codeBlockLinesByDefault();
  return session.get(id) ?? codeBlockLinesByDefault();
}

export function writeCodeBlockLines(id: string, numbered: boolean): void {
  if (!id) return;
  if (numbered) session.set(id, true);
  else session.delete(id);
}

/** Flip one block. Other ids are left alone. */
export function toggleCodeBlockLines(id: string, numbered: boolean): boolean {
  const next = !numbered;
  writeCodeBlockLines(id, next);
  return next;
}

/** Drop the session map. Tests use this; relaunch does the same. */
export function clearCodeBlockLinesSession(): void {
  session.clear();
}

export function showCodeBlockLines(completed: boolean): boolean {
  return completed;
}

export function codeBlockLinesLabel(numbered: boolean): "Lines" | "No lines" {
  return numbered ? CODE_BLOCK_LINES_OFF_LABEL : CODE_BLOCK_LINES_LABEL;
}

export function codeBlockLinesAriaLabel(numbered: boolean): string {
  return numbered ? CODE_BLOCK_LINES_OFF_ARIA : CODE_BLOCK_LINES_ARIA;
}

/** Extra class on the fence body while the gutter is showing. */
export function codeBlockLinesClass(numbered: boolean): string {
  return numbered ? " md-fence-body-lines" : "";
}

/** One trailing newline is the fence closer, not an extra line. */
export function codeBlockNumberedBody(source: string): string {
  return source.endsWith("\n") ? source.slice(0, -1) : source;
}

/** Logical lines, including a blank line. A fence-closer newline is dropped. */
export function codeBlockNumberedLines(source: string): string[] {
  const body = codeBlockNumberedBody(source);
  if (body.length === 0) return [];
  return body.split("\n");
}

/** 1-based gutter text. Display only. */
export function codeBlockGutterLabel(index: number): string {
  return String(index + 1);
}

/** Width of the last number, in digits. A 10-line block is two digits. */
export function codeBlockGutterChars(lineCount: number): number {
  const count = lineCount < 1 ? 1 : lineCount;
  return String(count).length;
}

/**
 * Split highlighted tokens on newlines and keep each token's kind, so a
 * string or comment that spans lines stays colored on every piece.
 * A trailing empty piece is a real blank line.
 */
export function splitHighlightedLines(tokens: CodeToken[]): CodeToken[][] {
  if (tokens.length === 0) return [];
  const lines: CodeToken[][] = [];
  let current: CodeToken[] = [];
  const pushLine = () => {
    lines.push(current);
    current = [];
  };
  for (const token of tokens) {
    const parts = token.text.split("\n");
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) pushLine();
      if (parts[i].length > 0) current.push({ text: parts[i], kind: token.kind });
    }
  }
  pushLine();
  return lines;
}

/**
 * One row per logical line. Highlighting is applied to the whole body
 * first, then split, so a multiline string stays a string. If the split
 * count ever disagrees, the rows fall back to plain text of the same lines.
 */
export function codeBlockDisplayRows(
  source: string,
  language: string,
  completed: boolean,
): CodeToken[][] {
  const lines = codeBlockNumberedLines(source);
  const plain = lines.map((line) =>
    line.length === 0 ? [] : [{ text: line, kind: "plain" as const }],
  );
  if (!shouldHighlightCode({ language, completed })) return plain;
  const highlighted = splitHighlightedLines(
    highlightCode(codeBlockNumberedBody(source), language),
  );
  if (highlighted.length !== lines.length) return plain;
  return highlighted;
}

/** Label and layout swap only. Never animate, including when Reduce Motion is off. */
export function codeBlockLinesAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
