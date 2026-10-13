// SPDX-License-Identifier: Apache-2.0

/**
 * v0.91: draft hint on a chat-list row.
 * A chat other than the one open shows a muted-accent "Draft:" prefix
 * and the v0.64/v0.69 top-level composer draft (null thread — the
 * conversation that row opens) instead of the v0.80 last-message line.
 * Whitespace-only drafts do not count. Clearing or sending the draft
 * restores the last-message preview. The open chat's row keeps that
 * preview. Truncation matches lastMessagePreview.oneLine. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatDraftPreview.swift`.
 */

import { oneLine } from "./lastMessagePreview.ts";

export const DRAFT_PREFIX = "Draft:";

export type ChatRowPreview = {
  kind: "draft" | "message";
  text: string;
  /** Set for a draft hint. Painted in a muted accent. */
  prefix?: string;
};

/** Non-whitespace draft collapsed to one truncated line. */
export function visibleDraftText(
  draft: string | null | undefined,
): string | null {
  const line = oneLine(draft ?? "");
  return line || null;
}

function messagePreview(
  lastMessage: string | null | undefined,
): ChatRowPreview | null {
  const text = (lastMessage ?? "").trim();
  if (!text) return null;
  return { kind: "message", text };
}

/**
 * Sidebar / chat-list line. The open chat always uses the last message.
 * Any other chat with a visible top-level draft uses Draft: plus that text.
 */
export function chatRowPreview(input: {
  chatId: string;
  openChatId: string | null;
  draft: string | null | undefined;
  lastMessage: string | null | undefined;
}): ChatRowPreview | null {
  if (!input.chatId) return messagePreview(input.lastMessage);
  const open =
    input.openChatId != null && input.chatId === input.openChatId;
  if (!open) {
    const text = visibleDraftText(input.draft);
    if (text) return { kind: "draft", prefix: DRAFT_PREFIX, text };
  }
  return messagePreview(input.lastMessage);
}
