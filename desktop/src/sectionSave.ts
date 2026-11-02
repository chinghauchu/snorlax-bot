// SPDX-License-Identifier: Apache-2.0

/**
 * v2.38: Save on a completed assistant heading section.
 * The control writes the heading line plus the lines under it as
 * section.md, then reads Saved for 1.5s. Desktop downloads the
 * file. iOS hands the same bytes to the system share sheet and
 * does not ask for photo-library permission. Copy still copies
 * those lines. Hidden while streaming. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/SectionSave.swift`.
 */

export const SECTION_SAVE_LABEL = "Save";

export const SECTION_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const SECTION_SAVE_ARIA = "Save section";

export const SECTION_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.38 section Copy. */
export const SECTION_SAVE_MS = 1500;

export const SECTION_SAVE_FILENAME = "section.md";

export const SECTION_SAVE_MIME = "text/markdown;charset=utf-8";

/**
 * Shown only for a finished section that has lines to save.
 * Streaming stays plain text, so the control is not offered.
 */
export function showSectionSave(opts: {
  completed: boolean;
  source: string;
}): boolean {
  return opts.completed && opts.source.length > 0;
}

export function sectionSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? SECTION_SAVED_LABEL : SECTION_SAVE_LABEL;
}

export function sectionSaveAriaLabel(saved: boolean): string {
  return saved ? SECTION_SAVED_ARIA : SECTION_SAVE_ARIA;
}

/** Saving does not remove the section, send, or change Copy. */
export function sectionSaveKeepsSection(): boolean {
  return true;
}

/**
 * File body. The same string Copy puts on the clipboard. The
 * heading line stays. No extra trailing newline.
 */
export function sectionSaveBody(source: string): string {
  return source;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function sectionSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the section to the browser as a download. The section stays up. */
export function downloadSectionMarkdown(source: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([sectionSaveBody(source)], {
    type: SECTION_SAVE_MIME,
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
