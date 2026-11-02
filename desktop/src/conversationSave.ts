// SPDX-License-Identifier: Apache-2.0

/**
 * v2.42: Save the open chat's loaded conversation as markdown.
 * The control writes user and assistant kind=message turns, in order,
 * with the server speaker name and the same local clock as the bubble,
 * as conversation.md, then reads Saved for 1.5s. Desktop downloads the
 * file. iOS hands the same bytes to the system share sheet from the
 * chat header and does not ask for photo-library permission. Transcript
 * Save stays transcript.txt and still has no speaker labels. Reply Save
 * stays reply.md. A tool, widget, approve, connect, or handoff row is
 * skipped. No animation. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ConversationSave.swift`.
 */

import { formatBubbleTime } from "./bubbleTime.ts";
import { isUserSender } from "./mentions.ts";

export const CONVERSATION_SAVE_LABEL = "Save as conversation.md";

export const CONVERSATION_SAVED_LABEL = "Saved";

/** Accessible name while idle. Visible text matches it. */
export const CONVERSATION_SAVE_ARIA = "Save as conversation.md";

export const CONVERSATION_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.32 transcript Save. */
export const CONVERSATION_SAVE_MS = 1500;

export const CONVERSATION_FILENAME = "conversation.md";

export const CONVERSATION_MIME = "text/markdown;charset=utf-8";

export type ConversationTurn = {
  kind?: string | null;
  role?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  content?: string | null;
  createdAt?: string | Date | null;
};

/**
 * An open chat whose loaded turns would write at least one line.
 * A null or empty string stays hidden.
 */
export function showConversationSave(input: {
  chatOpen: boolean;
  text: string | null;
}): boolean {
  return input.chatOpen && input.text != null && input.text.length > 0;
}

export function conversationSaveLabel(saved: boolean): string {
  return saved ? CONVERSATION_SAVED_LABEL : CONVERSATION_SAVE_LABEL;
}

export function conversationSaveAriaLabel(saved: boolean): string {
  return saved ? CONVERSATION_SAVED_ARIA : CONVERSATION_SAVE_ARIA;
}

/** Saving does not send, switch chats, or change transcript Save. */
export function conversationSaveKeepsChat(): boolean {
  return true;
}

/** Missing kind counts as a message. Chrome rows do not. */
export function isConversationMessage(kind: string | null | undefined): boolean {
  return kind == null || kind === "" || kind === "message";
}

/**
 * Server sender name, with interior whitespace collapsed. A blank name
 * is You for a user turn and Assistant otherwise. Not the local chat
 * display name.
 */
export function conversationSpeaker(turn: ConversationTurn): string {
  const name = (turn.senderName ?? "").replace(/\s+/g, " ").trim();
  if (name) return name;
  if (isUserSender(turn.senderId ?? undefined, turn.role ?? undefined)) return "You";
  return "Assistant";
}

/** Keep a `*` or `\` in a name from breaking the bold markers. */
export function escapeConversationSpeaker(name: string): string {
  return name.replace(/[\\*]/g, (ch) => `\\${ch}`);
}

/**
 * `**Name** · h:mm AM`, or `**Name**` when the clock is missing.
 * The clock matches the bubble label, including a prior local day.
 */
export function conversationHeading(
  turn: ConversationTurn,
  now: Date = new Date(),
): string {
  const speaker = escapeConversationSpeaker(conversationSpeaker(turn));
  const time = formatBubbleTime(turn.createdAt, now);
  if (!time) return `**${speaker}**`;
  return `**${speaker}** · ${time}`;
}

/**
 * Loaded user and assistant kind=message turns, in order. Each turn is
 * the speaker line, a blank line, then the trimmed body. Turns are
 * separated by a blank line. No document title. No extra trailing
 * newline. Whitespace-only bodies are skipped. Returns null when
 * nothing useful remains.
 */
export function conversationMarkdown(
  messages: readonly ConversationTurn[],
  now: Date = new Date(),
): string | null {
  const parts: string[] = [];
  for (const row of messages) {
    if (!isConversationMessage(row.kind)) continue;
    const body = (row.content ?? "").trim();
    if (!body) continue;
    parts.push(`${conversationHeading(row, now)}\n\n${body}`);
  }
  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/** File body. The markdown already has no extra trailing newline. */
export function conversationSaveBody(markdown: string): string {
  return markdown;
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function conversationSaveAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand the markdown to the browser as a download. The chat stays open. */
export function downloadConversation(markdown: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([conversationSaveBody(markdown)], {
    type: CONVERSATION_MIME,
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
