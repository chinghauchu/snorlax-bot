// SPDX-License-Identifier: Apache-2.0

/**
 * v0.87: Backspace removes the last pending attachment chip when the
 * composer text is empty. One chip per keypress (the rightmost / most
 * recently added). Text still edits as usual. No chips does nothing.
 * Nothing auto-sends. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/BackspaceChip.swift`.
 */

/** Empty field, IME idle, no Shift/Alt/Cmd/Ctrl chord. */
export function composerAllowsChipBackspace(input: {
  composerText: string;
  composing: boolean;
  chord: boolean;
}): boolean {
  if (input.composing || input.chord) return false;
  return input.composerText.length === 0;
}

/**
 * Plain Backspace removes the last chip only from an empty composer.
 * Forward Delete, chords, IME, and any text (including spaces) stay
 * with the field. Mention and skill menus are asked first.
 */
export function backspaceRemovesLastChip(input: {
  key: string;
  composerText: string;
  chipCount: number;
  composing: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (input.key !== "Backspace") return false;
  const chord = Boolean(
    input.altKey || input.metaKey || input.ctrlKey || input.shiftKey,
  );
  if (
    !composerAllowsChipBackspace({
      composerText: input.composerText,
      composing: input.composing,
      chord,
    })
  ) {
    return false;
  }
  return input.chipCount > 0;
}

/** Drop the last chip. An empty list stays empty. */
export function withoutLastChip<T>(chips: readonly T[]): readonly T[] {
  if (chips.length === 0) return chips;
  return chips.slice(0, -1);
}
