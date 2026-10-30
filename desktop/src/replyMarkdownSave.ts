// SPDX-License-Identifier: Apache-2.0

/**
 * v2.30: Save on a completed assistant reply.
 * The control writes that reply's markdown source as reply.md, then
 * reads Saved for 1.5s. Desktop downloads the file. iOS hands the same
 * bytes to the system share sheet and does not ask for photo-library
 * permission. One file covers the whole reply. Copy still copies that
 * source. Hidden while streaming and on user bubbles. A code fence, a
 * table, and a display-math block keep their own Save. No animation.
 * No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/ReplyMarkdownSave.swift`.
 */

export const REPLY_MARKDOWN_SAVE_LABEL = "Save";

export const REPLY_MARKDOWN_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text stays `Save`. */
export const REPLY_MARKDOWN_SAVE_ARIA = "Save reply";

export const REPLY_MARKDOWN_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.29 math Save. */
export const REPLY_MARKDOWN_SAVE_MS = 1500;

export const REPLY_MARKDOWN_FILENAME = "reply.md";

export const REPLY_MARKDOWN_MIME = "text/markdown;charset=utf-8";

/**
 * Same gate as assistant Copy: a finished LEFT kind=message.
 * A user bubble, a tool line, and a streaming reply are not.
 */
export function showReplyMarkdownSave(opts: {
  completed: boolean;
  fromUser: boolean;
  kindMessage: boolean;
}): boolean {
  return opts.completed && !opts.fromUser && opts.kindMessage;
}

export function replyMarkdownSaveLabel(saved: boolean): "Save" | "Saved" {
  return saved ? REPLY_MARKDOWN_SAVED_LABEL : REPLY_MARKDOWN_SAVE_LABEL;
}

export function replyMarkdownSaveAriaLabel(saved: boolean): string {
  return saved ? REPLY_MARKDOWN_SAVED_ARIA : REPLY_MARKDOWN_SAVE_ARIA;
}

/** Saving does not remove the reply, send, or change Copy. */
export function replyMarkdownSaveKeepsReply(): boolean {
  return true;
}

/**
 * File body. The markdown source Copy already copies. Interior
 * whitespace stays. No extra trailing newline. Rendered HTML is not
 * written. Fences, tables, and math inside the reply stay in this
 * string.
 */
export function replyMarkdownSaveBody(markdown: string): string {
  return markdown;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function replyMarkdownSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the markdown to the browser as a download. The reply stays up. */
export function downloadReplyMarkdown(markdown: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([replyMarkdownSaveBody(markdown)], {
    type: REPLY_MARKDOWN_MIME,
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
