// SPDX-License-Identifier: Apache-2.0

/**
 * v2.41: Save on a completed assistant Footnotes list.
 * The control writes one GFM definition per rendered note as notes.md,
 * then reads Saved for 1.5s. Desktop downloads the file. iOS hands the
 * same bytes to the system share sheet and does not ask for
 * photo-library permission. Display order and original labels stay.
 * The Footnotes title and the painted numbers are not the file. Copy
 * still copies that same text. Hidden while streaming. No animation.
 * No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/FootnoteSave.swift`.
 */

export const FOOTNOTE_SAVE_LABEL = "Save";

export const FOOTNOTE_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const FOOTNOTE_SAVE_ARIA = "Save footnotes";

export const FOOTNOTE_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.40 links Save. */
export const FOOTNOTE_SAVE_MS = 1500;

export const FOOTNOTE_SAVE_FILENAME = "notes.md";

export const FOOTNOTE_SAVE_MIME = "text/markdown;charset=utf-8";

/** A rendered note. `text` may still contain `§§SBFNn§§` tokens. */
export type FootnoteSaveNote = {
  label: string;
  number: number;
  text: string;
};

const TOKEN_SOURCE = "§§SBFN(\\d+)§§";

/**
 * Shown only for a finished list that has a note to save.
 * Streaming does not render the list, so the control is not offered.
 */
export function showFootnoteSave(opts: {
  completed: boolean;
  notes: readonly FootnoteSaveNote[];
}): boolean {
  return opts.completed && footnoteSaveBody(opts.notes).length > 0;
}

export function footnoteSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? FOOTNOTE_SAVED_LABEL : FOOTNOTE_SAVE_LABEL;
}

export function footnoteSaveAriaLabel(saved: boolean): string {
  return saved ? FOOTNOTE_SAVED_ARIA : FOOTNOTE_SAVE_ARIA;
}

/** Saving does not remove the list, send, or change Copy. */
export function footnoteSaveKeepsList(): boolean {
  return true;
}

/**
 * File body. One definition per rendered note, in display order.
 * `[^label]:` plus the note body. Continuation lines are indented
 * four spaces. Nested references are `[^label]` again, not the
 * display number. No extra trailing newline. A paste is footnotes.
 */
export function footnoteSaveBody(notes: readonly FootnoteSaveNote[]): string {
  if (!notes.length) return "";
  const labels = new Map<number, string>();
  for (const note of notes) labels.set(note.number, note.label);
  return notes.map((note) => definition(note, labels)).join("\n");
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function footnoteSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the notes to the browser as a download. The list stays up. */
export function downloadFootnoteMarkdown(notes: readonly FootnoteSaveNote[], filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([footnoteSaveBody(notes)], {
    type: FOOTNOTE_SAVE_MIME,
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

function definition(
  note: FootnoteSaveNote,
  labels: Map<number, string>,
): string {
  const lines = noteLines(restoreRefs(note.text, labels));
  const first = lines[0] ?? "";
  const head = first.length > 0 ? `[^${note.label}]: ${first}` : `[^${note.label}]:`;
  const rest = lines.slice(1).map((line) => (line.length > 0 ? `    ${line}` : ""));
  return [head, ...rest].join("\n");
}

function restoreRefs(text: string, labels: Map<number, string>): string {
  return text.replace(new RegExp(TOKEN_SOURCE, "g"), (full, digits: string) => {
    const label = labels.get(Number(digits));
    return label ? `[^${label}]` : full;
  });
}

function noteLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return [""];
  const lines = normalized.split("\n");
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
