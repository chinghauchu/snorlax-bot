// SPDX-License-Identifier: Apache-2.0

import { USER_SENDER_ID, isUserSender } from "./mentions.ts";
import type { ChatMessage } from "./types.ts";

/** Composer status hint after a failed Send. Same family as dictation hints. */
export const COULDNT_SEND = "Couldn't send.";

export const OPTIMISTIC_ID_PREFIX = "local-";

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export function newOptimisticId(now = Date.now()): string {
  return `${OPTIMISTIC_ID_PREFIX}${now}`;
}

export type OptimisticUserSeed = {
  id?: string;
  agentId: string;
  content: string;
  images?: ChatMessage["images"];
  attachments?: ChatMessage["attachments"];
  createdAt?: string;
};

/** Immediate user-RIGHT bubble for Send. Local id until the server turn lands. */
export function optimisticUserMessage(seed: OptimisticUserSeed): ChatMessage {
  return {
    id: seed.id ?? newOptimisticId(),
    agentId: seed.agentId,
    role: "user",
    kind: "message",
    content: seed.content,
    images: seed.images ?? [],
    attachments: seed.attachments ?? [],
    createdAt: seed.createdAt ?? new Date().toISOString(),
    senderId: USER_SENDER_ID,
    senderName: "User",
    senderAvatar: null,
    hop: 0,
    mentions: [],
  };
}

export function insertOptimistic<T>(messages: T[], row: T): T[] {
  return [...messages, row];
}

export function dropOptimistic<T extends { id: string }>(
  messages: T[],
  optimisticId: string,
): T[] {
  return messages.filter((m) => m.id !== optimisticId);
}

type Userish = {
  id: string;
  content: string;
  role?: string;
  senderId?: string;
};

function isUserRow(row: Userish): boolean {
  return isUserSender(row.senderId, row.role);
}

/**
 * Success: swap the optimistic bubble for the GET/turn transcript.
 * Listed ids win; local-* rows are dropped so the same text is not painted twice.
 */
export function reconcileOptimistic<T extends Userish>(
  _messages: T[],
  _optimisticId: string,
  listed: T[],
): T[] {
  return listed.filter((m) => !isOptimisticId(m.id));
}

/**
 * If the server echoes the user turn (SSE `message.done` or GET), replace the
 * matching optimistic bubble in place — never append a second RIGHT bubble.
 */
export function absorbServerUser<T extends Userish>(
  messages: T[],
  incoming: T,
): T[] {
  if (!isUserRow(incoming) || isOptimisticId(incoming.id)) {
    const idx = messages.findIndex((m) => m.id === incoming.id);
    if (idx >= 0) {
      return messages.map((m, i) => (i === idx ? incoming : m));
    }
    return [...messages, incoming];
  }
  const optIdx = messages.findIndex(
    (m) =>
      isOptimisticId(m.id) && isUserRow(m) && m.content === incoming.content,
  );
  if (optIdx >= 0) {
    return messages.map((m, i) => (i === optIdx ? incoming : m));
  }
  const existing = messages.findIndex((m) => m.id === incoming.id);
  if (existing >= 0) {
    return messages.map((m, i) => (i === existing ? incoming : m));
  }
  return [...messages, incoming];
}

export function failOptimistic<T extends { id: string }>(
  messages: T[],
  optimisticId: string,
): { messages: T[]; hint: typeof COULDNT_SEND } {
  return {
    messages: dropOptimistic(messages, optimisticId),
    hint: COULDNT_SEND,
  };
}

export function composerSendHint(
  error: string | null | undefined,
): string | null {
  return error === COULDNT_SEND ? COULDNT_SEND : null;
}

/** Second Send is blocked while a turn is in flight or an attachment is still uploading. */
export function shouldBlockSend(input: {
  busy: boolean;
  attaching: boolean;
}): boolean {
  return Boolean(input.busy || input.attaching);
}

/** HTTP 4xx/5xx on Send — restore composer and show Couldn't send. */
export function isHttpSendFailure(status: number): boolean {
  return status >= 400 && status < 600;
}
