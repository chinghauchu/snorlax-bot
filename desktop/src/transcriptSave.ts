// SPDX-License-Identifier: Apache-2.0

/**
 * v2.32: Save the open chat's loaded transcript.
 * The control writes the same plain text Cmd/Ctrl-Shift-E copies, as
 * transcript.txt, then reads Saved for 1.5s. Desktop downloads the
 * file. iOS hands the same bytes to the system share sheet from the
 * chat header and does not ask for photo-library permission. The copy
 * chord still copies and does not write the file. Hidden when no chat
 * is open or nothing useful is loaded. Reply Save stays reply.md.
 * User-message Save stays message.txt. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/TranscriptSave.swift`.
 */

export const TRANSCRIPT_SAVE_LABEL = "Save";

export const TRANSCRIPT_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const TRANSCRIPT_SAVE_ARIA = "Save transcript";

export const TRANSCRIPT_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.31 user-message Save. */
export const TRANSCRIPT_SAVE_MS = 1500;

export const TRANSCRIPT_FILENAME = "transcript.txt";

export const TRANSCRIPT_MIME = "text/plain;charset=utf-8";

/**
 * An open chat with the same text the copy chord would copy.
 * A null or empty string is the empty transcript, so Save stays hidden.
 */
export function showTranscriptSave(input: {
  chatOpen: boolean;
  text: string | null;
}): boolean {
  return input.chatOpen && input.text != null && input.text.length > 0;
}

export function transcriptSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? TRANSCRIPT_SAVED_LABEL : TRANSCRIPT_SAVE_LABEL;
}

export function transcriptSaveAriaLabel(saved: boolean): string {
  return saved ? TRANSCRIPT_SAVED_ARIA : TRANSCRIPT_SAVE_ARIA;
}

/** Saving does not send, switch chats, or change the copy chord. */
export function transcriptSaveKeepsChat(): boolean {
  return true;
}

/**
 * File body. The plain text the copy chord already copies. Interior
 * whitespace stays. No extra trailing newline. Speaker labels are not
 * added here.
 */
export function transcriptSaveBody(text: string): string {
  return text;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function transcriptSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the text to the browser as a download. The chat stays open. */
export function downloadTranscript(text: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([transcriptSaveBody(text)], {
    type: TRANSCRIPT_MIME,
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
