// SPDX-License-Identifier: Apache-2.0

/**
 * v2.23: Copy on a completed assistant display-math block.
 * The control copies the TeX interior (no $$ delimiters), then reads
 * Copied for 1.5s. Inline math has no control. Hidden while streaming
 * and while the closing $$ has not arrived. No animation.
 * Table Copy (v1.31) already copies markdown source and is unchanged.
 */

export const MATH_BLOCK_COPY_LABEL = "Copy";

export const MATH_BLOCK_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const MATH_BLOCK_COPY_ARIA = "Copy math";

export const MATH_BLOCK_COPIED_ARIA = "Copied";

/** Same confirmation window as v0.66 code-block Copy. */
export const MATH_BLOCK_COPY_MS = 1500;

export function showMathBlockCopy(opts: {
  completed: boolean;
  closed: boolean;
  block: boolean;
}): boolean {
  return opts.completed && opts.closed && opts.block;
}

export function mathCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? MATH_BLOCK_COPIED_LABEL : MATH_BLOCK_COPY_LABEL;
}

export function mathCopyAriaLabel(copied: boolean): string {
  return copied ? MATH_BLOCK_COPIED_ARIA : MATH_BLOCK_COPY_ARIA;
}

/**
 * Clipboard text is the TeX the renderer already extracted:
 * no opening or closing $$. Interior whitespace stays.
 */
export function mathBlockClipboardText(tex: string): string {
  return tex;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function mathBlockCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
