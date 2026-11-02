// SPDX-License-Identifier: Apache-2.0

/**
 * v2.39: Copy on a completed assistant task list.
 * Desktop shows a 12px muted Copy at the top-right on hover or
 * keyboard focus. It reads Copied for 1.5s and stays visible for
 * that window. The clipboard is the lines this task list was split
 * from, including `- [ ]`, `* [x]`, and `+ [ ]` markers and
 * continuation lines. The display text, after markers are removed,
 * is not copied. A nested task list has its own control. Hidden
 * while streaming. A bulleted or numbered list keeps list Copy.
 * No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/TaskCopy.swift`.
 */

export const TASK_COPY_LABEL = "Copy";

export const TASK_COPIED_LABEL = "Copied";

/** Accessible name while idle. Visible text stays `Copy`. */
export const TASK_COPY_ARIA = "Copy task list";

export const TASK_COPIED_ARIA = "Copied";

/** Same confirmation window as v2.39 task Save. */
export const TASK_COPY_MS = 1500;

/**
 * Shown only for a finished task list that has lines to copy.
 * Streaming stays plain text, so the control is not offered.
 */
export function showTaskCopy(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function taskCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? TASK_COPIED_LABEL : TASK_COPY_LABEL;
}

export function taskCopyAriaLabel(copied: boolean): string {
  return copied ? TASK_COPIED_ARIA : TASK_COPY_ARIA;
}

/**
 * Clipboard text is the task lines the splitter kept, not the text
 * after markers are removed. A paste round-trips as a task list. No
 * trailing newline is added.
 */
export function taskClipboardText(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function taskCopyAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
