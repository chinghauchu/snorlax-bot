// SPDX-License-Identifier: Apache-2.0

/**
 * v2.27: Copy on a completed assistant inline formula.
 * The control copies the TeX interior (no \( \) delimiters), then
 * reads Copied for 1.5s. Hidden while streaming and while the closing
 * \) has not arrived. Display-math Copy (v2.23) is a different control.
 * No animation. No new shortcut.
 */

export const MATH_INLINE_COPY_LABEL = "Copy";

export const MATH_INLINE_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const MATH_INLINE_COPY_ARIA = "Copy inline math";

export const MATH_INLINE_COPIED_ARIA = "Copied";

/** Same confirmation window as v2.23 display-math Copy. */
export const MATH_INLINE_COPY_MS = 1500;

/**
 * Shown only for a closed inline formula on a completed assistant
 * reply. A display-math block does not use this control.
 */
export function showMathInlineCopy(opts: {
  completed: boolean;
  closed: boolean;
}): boolean {
  return opts.completed && opts.closed;
}

export function mathInlineCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? MATH_INLINE_COPIED_LABEL : MATH_INLINE_COPY_LABEL;
}

export function mathInlineCopyAriaLabel(copied: boolean): string {
  return copied ? MATH_INLINE_COPIED_ARIA : MATH_INLINE_COPY_ARIA;
}

/**
 * Clipboard text is the TeX the renderer already extracted:
 * no opening or closing \( \). Interior whitespace stays.
 */
export function mathInlineClipboardText(tex: string): string {
  return tex;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function mathInlineCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
