// SPDX-License-Identifier: Apache-2.0

/**
 * v2.29: Save on a completed assistant display-math block.
 * The control writes the TeX interior as math.tex, then reads Saved
 * for 1.5s. Desktop downloads the file. iOS hands the same bytes to
 * the system share sheet and does not ask for photo-library permission.
 * The $$ delimiters are not included. Copy still copies that TeX.
 * Hidden while streaming and while the closing $$ has not arrived.
 * Inline math has no Save. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/MathBlockSave.swift`.
 */

export const MATH_BLOCK_SAVE_LABEL = "Save";

export const MATH_BLOCK_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const MATH_BLOCK_SAVE_ARIA = "Save math";

export const MATH_BLOCK_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.26 table Save. */
export const MATH_BLOCK_SAVE_MS = 1500;

export const MATH_BLOCK_SAVE_FILENAME = "math.tex";

export const MATH_BLOCK_SAVE_MIME = "text/plain;charset=utf-8";

/** Same gate as display-math Copy: a finished closed block only. */
export function showMathBlockSave(opts: {
  completed: boolean;
  closed: boolean;
  block: boolean;
}): boolean {
  return opts.completed && opts.closed && opts.block;
}

export function mathBlockSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? MATH_BLOCK_SAVED_LABEL : MATH_BLOCK_SAVE_LABEL;
}

export function mathBlockSaveAriaLabel(saved: boolean): string {
  return saved ? MATH_BLOCK_SAVED_ARIA : MATH_BLOCK_SAVE_ARIA;
}

/** Saving does not remove the equation, send, or change Copy. */
export function mathBlockSaveKeepsBlock(): boolean {
  return true;
}

/**
 * File body. The TeX the renderer already extracted: no opening or
 * closing $$. Interior whitespace stays. No extra trailing newline.
 */
export function mathBlockSaveBody(tex: string): string {
  return tex;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function mathBlockSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the TeX to the browser as a download. The equation stays up. */
export function downloadMathBlock(tex: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([mathBlockSaveBody(tex)], {
    type: MATH_BLOCK_SAVE_MIME,
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
