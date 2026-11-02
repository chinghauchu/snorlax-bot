// SPDX-License-Identifier: Apache-2.0

/**
 * v2.37: Save on a completed assistant list.
 * The control writes the lines that list was split from as list.md,
 * then reads Saved for 1.5s. Desktop downloads the file. iOS hands the
 * same bytes to the system share sheet and does not ask for
 * photo-library permission. Markers and continuation lines stay. The
 * display text, after markers are removed, is not written. Copy still
 * copies those lines. Hidden while streaming and on task lists. No
 * animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/ListSave.swift`.
 */

export const LIST_SAVE_LABEL = "Save";

export const LIST_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const LIST_SAVE_ARIA = "Save list";

export const LIST_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.37 list Copy. */
export const LIST_SAVE_MS = 1500;

export const LIST_SAVE_FILENAME = "list.md";

export const LIST_SAVE_MIME = "text/markdown;charset=utf-8";

/**
 * Shown only for a finished list that has lines to save.
 * Streaming stays plain text, so the control is not offered.
 */
export function showListSave(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function listSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? LIST_SAVED_LABEL : LIST_SAVE_LABEL;
}

export function listSaveAriaLabel(saved: boolean): string {
  return saved ? LIST_SAVED_ARIA : LIST_SAVE_ARIA;
}

/** Saving does not remove the list, send, or change Copy. */
export function listSaveKeepsList(): boolean {
  return true;
}

/**
 * File body. The list lines the splitter kept, the same string Copy
 * puts on the clipboard. Markers stay. A paste of the file is a
 * list. No extra trailing newline.
 */
export function listSaveBody(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function listSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the list to the browser as a download. The list stays up. */
export function downloadListMarkdown(source: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([listSaveBody(source)], {
    type: LIST_SAVE_MIME,
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
