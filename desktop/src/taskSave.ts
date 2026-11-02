// SPDX-License-Identifier: Apache-2.0

/**
 * v2.39: Save on a completed assistant task list.
 * The control writes the lines that task list was split from as
 * tasks.md, then reads Saved for 1.5s. Desktop downloads the file.
 * iOS hands the same bytes to the system share sheet and does not
 * ask for photo-library permission. Markers and continuation lines
 * stay. The display text, after markers are removed, is not written.
 * Copy still copies those lines. Hidden while streaming. A bulleted
 * or numbered list keeps list.md. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/TaskSave.swift`.
 */

export const TASK_SAVE_LABEL = "Save";

export const TASK_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const TASK_SAVE_ARIA = "Save task list";

export const TASK_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.39 task Copy. */
export const TASK_SAVE_MS = 1500;

export const TASK_SAVE_FILENAME = "tasks.md";

export const TASK_SAVE_MIME = "text/markdown;charset=utf-8";

/**
 * Shown only for a finished task list that has lines to save.
 * Streaming stays plain text, so the control is not offered.
 */
export function showTaskSave(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function taskSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? TASK_SAVED_LABEL : TASK_SAVE_LABEL;
}

export function taskSaveAriaLabel(saved: boolean): string {
  return saved ? TASK_SAVED_ARIA : TASK_SAVE_ARIA;
}

/** Saving does not remove the task list, send, or change Copy. */
export function taskSaveKeepsTasks(): boolean {
  return true;
}

/**
 * File body. The task lines the splitter kept, the same string Copy
 * puts on the clipboard. Markers stay. A paste of the file is a
 * task list. No extra trailing newline.
 */
export function taskSaveBody(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function taskSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the task list to the browser as a download. The list stays up. */
export function downloadTaskMarkdown(source: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([taskSaveBody(source)], {
    type: TASK_SAVE_MIME,
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
