// SPDX-License-Identifier: Apache-2.0

/**
 * v0.78: a failed Send stays in the transcript.
 * Network / runtime down, HTTP 4xx/5xx, or an SSE error before any
 * reply (including inference_unavailable) leaves the user bubble
 * muted with Couldn't send · Retry. Retry resends the same text and
 * attachments through the existing send path. No auto-retry. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/FailedSend.swift`.
 */

export const FAILED_SEND_COULDNT = "Couldn't send";
export const FAILED_SEND_RETRY = "Retry";
export const FAILED_SEND_REMOVE = "Remove";
export const FAILED_SEND_LINE = "Couldn't send · Retry";
export const INFERENCE_UNAVAILABLE = "inference_unavailable";

export type FailedSend<T extends { id: string; createdAt?: string }> = {
  id: string;
  agentId: string;
  threadId: string | null;
  content: string;
  attachmentIds: string[];
  mentionIds: string[];
  message: T;
  orphanServerId: string | null;
};

/** The inline line under a muted user bubble. */
export function failedSendLine(): string {
  return FAILED_SEND_LINE;
}

/**
 * SSE `error` before any assistant token, tool, or card.
 * inference_unavailable is one of those errors; the wire body is the
 * message text, so any pre-reply error keeps the bubble.
 */
export function isPreReplyStreamFailure(input: {
  sawReply: boolean;
  error: string | null | undefined;
}): boolean {
  if (input.sawReply) return false;
  return Boolean((input.error ?? "").trim());
}

export function isInferenceUnavailableError(
  error: string | null | undefined,
): boolean {
  return (error ?? "").includes(INFERENCE_UNAVAILABLE);
}

/** A delta, tool, card, or non-empty assistant message means a reply started. */
export function replyStarted(input: {
  delta?: string | null;
  isUser?: boolean;
  isTool?: boolean;
  isCard?: boolean;
  content?: string | null;
}): boolean {
  if (input.isTool || input.isCard) return true;
  if ((input.delta ?? "").length > 0) return true;
  if (input.isUser) return false;
  return (input.content ?? "").length > 0;
}

/**
 * User row the runtime saved before inference failed. It was not in
 * the transcript when Send started, and the text matches.
 */
export function orphanUserId<T extends { id: string; content?: string }>(
  beforeIds: ReadonlySet<string>,
  listed: readonly T[],
  content: string,
  isUser: (row: T) => boolean,
): string | null {
  for (let i = listed.length - 1; i >= 0; i -= 1) {
    const row = listed[i];
    if (!row || !isUser(row)) continue;
    if (beforeIds.has(row.id)) continue;
    if ((row.content ?? "") !== content) continue;
    return row.id;
  }
  return null;
}

export function markFailedSend<T extends { id: string; createdAt?: string }>(
  records: readonly FailedSend<T>[],
  next: FailedSend<T>,
): FailedSend<T>[] {
  return [...records.filter((row) => row.id !== next.id), next];
}

export function dismissFailedSend<T extends { id: string; createdAt?: string }>(
  records: readonly FailedSend<T>[],
  id: string,
): FailedSend<T>[] {
  return records.filter((row) => row.id !== id);
}

export function failedSendsForChat<T extends { id: string; createdAt?: string }>(
  records: readonly FailedSend<T>[],
  agentId: string,
  threadId: string | null,
): FailedSend<T>[] {
  return records.filter(
    (row) => row.agentId === agentId && row.threadId === threadId,
  );
}

/**
 * Server transcript for this chat, plus local failed bubbles.
 * A user row persisted before a pre-reply error stays hidden so the
 * muted bubble is the one Retry sends again.
 */
export function paintFailedSends<T extends { id: string; createdAt?: string }>(
  listed: readonly T[],
  failed: readonly FailedSend<T>[],
  hidden: ReadonlySet<string>,
): T[] {
  const hiddenIds = new Set(hidden);
  for (const row of failed) {
    if (row.orphanServerId) hiddenIds.add(row.orphanServerId);
  }
  const visible = listed.filter((row) => !hiddenIds.has(row.id));
  const have = new Set(visible.map((row) => row.id));
  const extra = failed.filter((row) => !have.has(row.message.id));
  if (extra.length === 0) return [...visible];
  const merged = [...visible];
  for (const row of extra) {
    const at = row.message.createdAt ?? "";
    let index = merged.findIndex((item) => (item.createdAt ?? "") > at);
    if (index < 0) index = merged.length;
    merged.splice(index, 0, row.message);
  }
  return merged;
}

/** Retry is a tap. It does not run while a turn is already in flight. */
export function retryBlocked(busy: boolean): boolean {
  return Boolean(busy);
}
