// SPDX-License-Identifier: Apache-2.0

/**
 * v0.66: fenced-code Copy on assistant LEFT messages.
 * The v0.11 control already sat at the top-right of the fence and copied
 * the body. This slice adds a 1.5s Copied confirmation that reverts, hides
 * the control while that message is still streaming, and never animates.
 */

export const CODE_BLOCK_COPY_LABEL = "Copy";

export const CODE_BLOCK_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const CODE_BLOCK_COPY_ARIA = "Copy code";

export const CODE_BLOCK_COPIED_ARIA = "Copied";

/** How long the confirmation stays before the control reverts to Copy. */
export const CODE_BLOCK_COPY_MS = 1500;

export function showCodeBlockCopy(completed: boolean): boolean {
  return completed;
}

export function codeBlockCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? CODE_BLOCK_COPIED_LABEL : CODE_BLOCK_COPY_LABEL;
}

export function codeBlockCopyAriaLabel(copied: boolean): string {
  return copied ? CODE_BLOCK_COPIED_ARIA : CODE_BLOCK_COPY_ARIA;
}

/**
 * Clipboard text is the fence body the renderer already extracted:
 * no opening or closing fence, no language tag. Interior whitespace stays.
 */
export function codeBlockClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function codeBlockCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
