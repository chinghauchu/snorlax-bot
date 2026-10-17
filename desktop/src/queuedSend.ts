// SPDX-License-Identifier: Apache-2.0

/**
 * v1.28: queue a follow-up while a reply is generating.
 * Enter or Send while a client-started reply is in flight holds the
 * composer text as a muted "Queued" row above the composer. Each row
 * stays editable and removable. Rows are not combined. When that reply
 * settles (complete, empty, error, or Stop/Esc), the oldest row is sent
 * through the existing send path. Later rows wait, one per completed
 * reply. Stop/Esc aborts the current reply and the next queued row goes
 * out immediately. The queue is per chat (agentId + threadId) for the
 * session and survives switching chats. It is not persisted across
 * relaunch. If a queued send fails, that chat's queue is dropped and
 * the text is restored to that chat's composer. Pending attachment
 * chips are not queued. No new HTTP. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/QueuedSend.swift`.
 */

import {
  composerEnterSends,
  isComposerComposing,
  type ComposerKeyEvent,
} from "./composerKeys.ts";

export const QUEUED_LABEL = "Queued";
export const QUEUED_REMOVE_LABEL = "Remove queued message";
export const QUEUED_LIST_LABEL = "Queued messages";
export const QUEUED_EDIT_LABEL = "Queued message";

export type QueuedQuote = {
  text: string;
  sourceId: string;
};

export type QueuedItem = {
  id: string;
  text: string;
  mentionIds: string[];
  quotes: QueuedQuote[];
};

export type QueuedSendMap = Map<string, QueuedItem[]>;

/** Same chat key as composer drafts. A null thread is the top-level timeline. */
export function queuedSendKey(agentId: string, threadId: string | null): string {
  return `${agentId}\u0000${threadId ?? ""}`;
}

export function queuedItems(
  map: QueuedSendMap,
  key: string,
): QueuedItem[] {
  return map.get(key) ?? [];
}

/**
 * Text can be queued only while a reply is in flight.
 * Chips, takeover, an attach error, IME, and an empty field cannot.
 */
export function canQueueFollowUp(input: {
  busy: boolean;
  text: string;
  composing?: boolean;
  chipCount?: number;
  attachError?: boolean;
  takeoverOpen?: boolean;
  hasChat?: boolean;
}): boolean {
  if (!input.busy) return false;
  if (input.composing) return false;
  if (input.takeoverOpen) return false;
  if (input.attachError) return false;
  if ((input.chipCount ?? 0) > 0) return false;
  if (input.hasChat === false) return false;
  return input.text.trim().length > 0;
}

/** Plain Enter queues. Shift+Enter and IME do not. */
export function enterQueuesFollowUp(
  event: ComposerKeyEvent,
  input: {
    busy: boolean;
    text: string;
    chipCount?: number;
    attachError?: boolean;
    takeoverOpen?: boolean;
    hasChat?: boolean;
  },
): boolean {
  if (!composerEnterSends(event)) return false;
  return canQueueFollowUp({
    ...input,
    composing: isComposerComposing(event),
  });
}

export function enqueueFollowUp(
  map: QueuedSendMap,
  key: string,
  text: string,
  id: string,
  mentionIds: readonly string[] = [],
  quotes: readonly QueuedQuote[] = [],
): QueuedSendMap {
  const trimmed = text.trim();
  if (!trimmed || !key || !id) return map;
  const next = new Map(map);
  const rows = [...(next.get(key) ?? [])];
  rows.push({
    id,
    text: trimmed,
    mentionIds: [...mentionIds],
    quotes: quotes.map((quote) => ({ ...quote })),
  });
  next.set(key, rows);
  return next;
}

export function editQueuedFollowUp(
  map: QueuedSendMap,
  key: string,
  id: string,
  text: string,
): QueuedSendMap {
  const rows = map.get(key);
  if (!rows) return map;
  const next = new Map(map);
  next.set(
    key,
    rows.map((row) => (row.id === id ? { ...row, text } : row)),
  );
  return next;
}

export function removeQueuedFollowUp(
  map: QueuedSendMap,
  key: string,
  id: string,
): QueuedSendMap {
  const rows = map.get(key);
  if (!rows) return map;
  const kept = rows.filter((row) => row.id !== id);
  const next = new Map(map);
  if (kept.length === 0) next.delete(key);
  else next.set(key, kept);
  return next;
}

/**
 * Oldest non-empty row leaves the queue. A row edited down to
 * whitespace is dropped and the next row is taken. One row per call.
 */
export function dequeueFollowUp(
  map: QueuedSendMap,
  key: string,
): { map: QueuedSendMap; item: QueuedItem | null } {
  let rows = [...(map.get(key) ?? [])];
  let current = map;
  while (rows.length > 0) {
    const item = rows.shift()!;
    const next = new Map(current);
    if (rows.length === 0) next.delete(key);
    else next.set(key, rows);
    current = next;
    const text = item.text.trim();
    if (text.length > 0) {
      return { map: next, item: { ...item, text } };
    }
  }
  const next = new Map(current);
  next.delete(key);
  return { map: next, item: null };
}

/** Put a row back at the front when the send could not start. */
export function requeueFollowUp(
  map: QueuedSendMap,
  key: string,
  item: QueuedItem,
): QueuedSendMap {
  const text = item.text.trim();
  if (!text || !key) return map;
  const next = new Map(map);
  const rows = (next.get(key) ?? []).filter((row) => row.id !== item.id);
  next.set(key, [{ ...item, text }, ...rows]);
  return next;
}

export function dropQueuedFollowUps(
  map: QueuedSendMap,
  key: string,
): { map: QueuedSendMap; remaining: QueuedItem[] } {
  const remaining = [...(map.get(key) ?? [])];
  const next = new Map(map);
  next.delete(key);
  return { map: next, remaining };
}

/**
 * The queue is cleared. The failed message comes first, then any
 * rows that were still waiting, then a composer draft that was
 * already there. Blank lines keep them apart.
 */
export function restoreAfterQueuedFailure(input: {
  failedText: string;
  remaining: readonly QueuedItem[];
  composerText: string;
}): string {
  const parts: string[] = [];
  const failed = input.failedText.trim();
  if (failed) parts.push(failed);
  for (const row of input.remaining) {
    const text = row.text.trim();
    if (text) parts.push(text);
  }
  const draft = input.composerText;
  if (draft.trim()) parts.push(draft);
  else if (draft.length > 0 && parts.length === 0) return draft;
  return parts.join("\n\n");
}

/**
 * Send the next queued row when a turn settles.
 * A queued send that itself failed does not start the next row.
 */
export function shouldFlushQueue(input: {
  fromQueue: boolean;
  failed: boolean;
}): boolean {
  if (input.fromQueue && input.failed) return false;
  return true;
}
