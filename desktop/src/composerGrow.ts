// SPDX-License-Identifier: Apache-2.0

/**
 * v0.84: the composer grows with typed or pasted text, then scrolls
 * inside the field. Deleting text shrinks it back. An empty composer
 * keeps the stylesheet single-line height. Height changes are instant,
 * including when Reduce Motion is on (no spring). Enter still sends;
 * Shift-Enter still inserts a newline. No new HTTP.
 *
 * Keep `COMPOSER_MAX_PX` in lockstep with `.composer-bar textarea`
 * max-height and iOS `ComposerGrow.maxHeight`.
 */

/** About 8 lines of the 14px / 1.4 field, inside 160–200px. */
export const COMPOSER_MAX_PX = 160;

/** Resting floor. Matches `.composer-bar textarea` min-height. */
export const COMPOSER_MIN_PX = 22;

export type ComposerFrame = {
  /** Pixel height to assign, or null to keep the stylesheet line. */
  height: number | null;
  /** True once the text is taller than the cap and must scroll inside. */
  scroll: boolean;
};

/**
 * `restingHeight` is the field's clientHeight at the stylesheet height
 * (rows=1). `scrollHeight` is the content height measured the same way.
 * Empty, or text that still fits on that line, leaves the inline height
 * unset so the empty row does not jump.
 */
export function composerFrame(input: {
  restingHeight: number;
  scrollHeight: number;
  empty: boolean;
  maxPx?: number;
}): ComposerFrame {
  const maxPx = input.maxPx ?? COMPOSER_MAX_PX;
  if (
    input.empty ||
    !(input.restingHeight > 0) ||
    !(input.scrollHeight > 0) ||
    input.scrollHeight <= input.restingHeight + 1
  ) {
    return { height: null, scroll: false };
  }
  return {
    height: Math.min(Math.ceil(input.scrollHeight), maxPx),
    scroll: input.scrollHeight > maxPx,
  };
}

/** Height changes are instant with or without Reduce Motion. */
export function composerGrowMs(reduceMotion: boolean): number {
  void reduceMotion;
  return 0;
}
