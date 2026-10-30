// SPDX-License-Identifier: Apache-2.0

/**
 * v2.28: Copy on a completed assistant inline code span.
 * The control copies the span text (no backtick delimiters), then
 * reads Copied for 1.5s. Hidden while streaming, on a code fence,
 * and when the span is empty. Code-block Copy (v0.66) is a different
 * control. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/InlineCodeCopy.swift`.
 */

export const INLINE_CODE_COPY_LABEL = "Copy";

export const INLINE_CODE_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const INLINE_CODE_COPY_ARIA = "Copy inline code";

export const INLINE_CODE_COPIED_ARIA = "Copied";

/** iOS edit-menu title. It copies the whole span, not the selection. */
export const INLINE_CODE_MENU_LABEL = "Copy code";

/** Same confirmation window as v2.27 inline-math Copy. */
export const INLINE_CODE_COPY_MS = 1500;

/** Mark stored on an inline code run. Fences do not use it. */
export const INLINE_CODE_MARK = "1";

/**
 * A fenced or indented block is rendered through the fence chrome.
 * react-markdown puts a `language-*` class on a tagged fence and a
 * newline in the block body. An inline span has neither.
 */
export function inlineCodeIsBlock(input: {
  className?: string;
  text: string;
}): boolean {
  if (input.className) {
    for (const name of input.className.split(/\s+/)) {
      if (name.startsWith("language-")) return true;
    }
  }
  return input.text.includes("\n");
}

/**
 * Shown only for a non-empty inline span on a completed assistant
 * reply. A code fence does not use this control.
 */
export function showInlineCodeCopy(opts: {
  completed: boolean;
  block: boolean;
  text: string;
}): boolean {
  return opts.completed && !opts.block && opts.text.length > 0;
}

export function inlineCodeCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? INLINE_CODE_COPIED_LABEL : INLINE_CODE_COPY_LABEL;
}

export function inlineCodeCopyAriaLabel(copied: boolean): string {
  return copied ? INLINE_CODE_COPIED_ARIA : INLINE_CODE_COPY_ARIA;
}

/**
 * Clipboard text is the span the renderer already extracted:
 * no opening or closing backticks. Interior whitespace stays.
 */
export function inlineCodeClipboardText(text: string): string {
  return text;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function inlineCodeCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

export type InlineCodeSpan = { start: number; end: number; text: string };

/**
 * The whole span when `selection` lies entirely inside one span.
 * `start` is inclusive and `end` is exclusive. An empty selection,
 * a selection that starts in the span and ends outside it, and a
 * selection that misses every span return null. The clipboard is
 * the span text, not the selected slice.
 */
export function inlineCodeSpanText(
  spans: InlineCodeSpan[],
  selection: { start: number; end: number },
): string | null {
  if (selection.end <= selection.start) return null;
  for (const span of spans) {
    if (span.end <= span.start) continue;
    const startsInside = selection.start >= span.start && selection.start < span.end;
    if (!startsInside) continue;
    if (selection.end > span.end) return null;
    if (span.text.length === 0) return null;
    return span.text;
  }
  return null;
}
