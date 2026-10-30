// SPDX-License-Identifier: Apache-2.0

/**
 * v2.31: Save on a settled user message.
 * The control writes that message's text as message.txt, then reads
 * Saved for 1.5s. Desktop downloads the file. iOS hands the same
 * bytes to the system share sheet from the long-press menu and does
 * not ask for photo-library permission. Copy still copies that text.
 * Hidden while the optimistic send is in flight and on assistant
 * replies. Reply Save stays reply.md. No animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/UserMessageSave.swift`.
 */

export const USER_MESSAGE_SAVE_LABEL = "Save";

export const USER_MESSAGE_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const USER_MESSAGE_SAVE_ARIA = "Save message";

export const USER_MESSAGE_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.30 reply Save. */
export const USER_MESSAGE_SAVE_MS = 1500;

export const USER_MESSAGE_FILENAME = "message.txt";

export const USER_MESSAGE_MIME = "text/plain;charset=utf-8";

/**
 * Same gate as user Copy: a settled user-RIGHT kind=message.
 * An in-flight optimistic send is hidden. A failed send is settled.
 * An assistant reply, a tool line, and a card are not.
 */
export function showUserMessageSave(opts: {
  fromUser: boolean;
  kindMessage: boolean;
  pending: boolean;
}): boolean {
  return opts.fromUser && opts.kindMessage && !opts.pending;
}

export function userMessageSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? USER_MESSAGE_SAVED_LABEL : USER_MESSAGE_SAVE_LABEL;
}

export function userMessageSaveAriaLabel(saved: boolean): string {
  return saved ? USER_MESSAGE_SAVED_ARIA : USER_MESSAGE_SAVE_ARIA;
}

/** Saving does not remove the message, send, or change Copy. */
export function userMessageSaveKeepsMessage(): boolean {
  return true;
}

/**
 * File body. The text Copy already copies. Interior whitespace stays.
 * No extra trailing newline. The string is not rewritten as markdown.
 */
export function userMessageSaveBody(text: string): string {
  return text;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function userMessageSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the text to the browser as a download. The message stays up. */
export function downloadUserMessage(text: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([userMessageSaveBody(text)], {
    type: USER_MESSAGE_MIME,
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
