// SPDX-License-Identifier: Apache-2.0

/**
 * v0.81: a completed assistant LEFT `kind=message` bubble whose body is
 * taller than about 14 lines shows the first chunk and a muted 12px
 * Show more. Click expands that bubble and the control becomes Show
 * less. Mid-stream plaintext stays open. A Stop partial collapses only
 * once it is completed. Each bubble in a turn collapses on its own.
 * 160ms max-height; instant when Reduce Motion is on. The control does
 * not move composer focus. An active find match in that bubble stays
 * fully visible. No new HTTP.
 *
 * Keep `LONG_MESSAGE_EXPAND_MS` in lockstep with `.long-message` and
 * iOS `LongMessageCollapse.expandSeconds`.
 */

export const SHOW_MORE_LABEL = "Show more";
export const SHOW_LESS_LABEL = "Show less";

/** About 14 lines of the 14px / 1.4 assistant body. */
export const LONG_MESSAGE_LINES = 14;
export const LONG_MESSAGE_FONT_PX = 14;
export const LONG_MESSAGE_LINE_HEIGHT = 1.4;
export const LONG_MESSAGE_MAX_PX =
  LONG_MESSAGE_LINES * LONG_MESSAGE_FONT_PX * LONG_MESSAGE_LINE_HEIGHT;

/** Expand / collapse. Instant under Reduce Motion. */
export const LONG_MESSAGE_EXPAND_MS = 160;

export function longMessageOverflows(
  height: number,
  maxPx = LONG_MESSAGE_MAX_PX,
): boolean {
  return height > maxPx + 1;
}

/** Clamp only a finished LEFT bubble the user has not opened. */
export function shouldClampLongMessage(input: {
  completed: boolean;
  overflows: boolean;
  expanded: boolean;
  activeFind: boolean;
}): boolean {
  return (
    input.completed &&
    input.overflows &&
    !input.expanded &&
    !input.activeFind
  );
}

/** Hide the control while streaming and while find is showing the match. */
export function showLongMessageToggle(input: {
  completed: boolean;
  overflows: boolean;
  activeFind: boolean;
}): boolean {
  return input.completed && input.overflows && !input.activeFind;
}

export function longMessageToggleLabel(expanded: boolean): string {
  return expanded ? SHOW_LESS_LABEL : SHOW_MORE_LABEL;
}

export function longMessageExpandMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : LONG_MESSAGE_EXPAND_MS;
}
