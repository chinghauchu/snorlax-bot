// SPDX-License-Identifier: Apache-2.0

/**
 * v0.76: a thin muted "New messages" line above the first assistant
 * LEFT message that arrived since you last viewed that chat.
 * The same not-open or unfocused condition as the v0.70 unread dot
 * freezes the per-chat last-seen id. Opening or returning computes
 * the line once; it stays put while you watch. It clears when you
 * come back with nothing new, or when you Send. User-RIGHT bubbles
 * and collapsed tool lines do not anchor it. No HTTP. No animation.
 * Keep in lockstep with `ios/SnorlaxBot/NewMessages.swift`.
 */

import { isFinishedAssistantReply } from "./chatUnread.ts";

export const NEW_MESSAGES_LABEL = "New messages";
export const CHAT_LAST_SEEN_KEY = "snorlax.chatLastSeen";

export type LastSeenStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** One transcript. Empty thread is the top-level timeline. */
export function lastSeenKey(
  agentId: string,
  threadId: string | null | undefined,
): string {
  return `${agentId}\u0000${threadId ?? ""}`;
}

function splitLastSeenKey(
  token: string,
): { agentId: string; threadId: string | null } | null {
  const at = token.indexOf("\u0000");
  if (at <= 0) return null;
  const agentId = token.slice(0, at);
  const rest = token.slice(at + 1);
  return { agentId, threadId: rest.length === 0 ? null : rest };
}

export function browserLastSeenStorage(): LastSeenStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Ignore missing, corrupt, or non-object blobs. Empty ids are dropped. */
export function parseChatLastSeen(raw: string | null): Map<string, string> {
  const slots = new Map<string, string>();
  if (!raw) return slots;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return slots;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return slots;
  }
  for (const [token, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (!splitLastSeenKey(token)) continue;
    slots.set(token, value);
  }
  return slots;
}

export function serializeChatLastSeen(
  slots: ReadonlyMap<string, string>,
): string {
  const blob: Record<string, string> = {};
  const tokens = [...slots.keys()].filter((token) => splitLastSeenKey(token));
  tokens.sort();
  for (const token of tokens) {
    const id = slots.get(token) ?? "";
    if (id.length === 0) continue;
    blob[token] = id;
  }
  return JSON.stringify(blob);
}

function readRaw(storage: LastSeenStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export class ChatLastSeen {
  private readonly slots: Map<string, string>;
  private readonly storage: LastSeenStorage | null;
  private readonly storageKey: string;

  constructor(
    storage: LastSeenStorage | null = null,
    storageKey = CHAT_LAST_SEEN_KEY,
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.slots = storage
      ? parseChatLastSeen(readRaw(storage, storageKey))
      : new Map();
  }

  get(agentId: string, threadId: string | null): string | null {
    if (!agentId) return null;
    return this.slots.get(lastSeenKey(agentId, threadId)) ?? null;
  }

  /** Remember the latest message id the user has actually viewed. */
  see(agentId: string, threadId: string | null, messageId: string): boolean {
    if (!agentId || !messageId) return false;
    const key = lastSeenKey(agentId, threadId);
    if (this.slots.get(key) === messageId) return false;
    this.slots.set(key, messageId);
    this.persist();
    return true;
  }

  /** Drop chats that left the roster. Returns true when the map changed. */
  retain(keep: ReadonlySet<string>): boolean {
    let changed = false;
    for (const token of [...this.slots.keys()]) {
      const parsed = splitLastSeenKey(token);
      if (!parsed || !keep.has(parsed.agentId)) {
        this.slots.delete(token);
        changed = true;
      }
    }
    if (changed) this.persist();
    return changed;
  }

  private persist(): void {
    const storage = this.storage;
    if (!storage) return;
    try {
      storage.setItem(this.storageKey, serializeChatLastSeen(this.slots));
    } catch {
      /* quota or private mode: keep the in-memory copy */
    }
  }
}

export type DividerRow = {
  id: string;
  /**
   * True for a painted LEFT assistant message. User bubbles, collapsed
   * tool lines, and other non-message rows are false.
   */
  anchor: boolean;
};

/**
 * A painted LEFT assistant message can hold the line. The caller's
 * own user-RIGHT bubbles, hidden rows, and collapsed tool lines cannot.
 */
export function anchorsNewMessages(message: {
  role?: string;
  senderId?: string;
  kind?: string | null;
  content?: string;
  attachments?: readonly unknown[] | null;
  collapsedTool?: boolean;
  visible?: boolean;
}): boolean {
  if (message.visible === false) return false;
  if (message.collapsedTool) return false;
  return isFinishedAssistantReply(message);
}

/**
 * Index of the first anchoring row strictly after `lastSeenId`.
 * Never viewed (no id), or the id is gone: null, so a first open
 * does not draw a line over the whole history.
 */
export function newMessagesAnchorIndex(
  rows: readonly DividerRow[],
  lastSeenId: string | null,
): number | null {
  if (!lastSeenId) return null;
  const at = rows.findIndex((row) => row.id === lastSeenId);
  if (at < 0) return null;
  for (let i = at + 1; i < rows.length; i += 1) {
    if (rows[i]?.anchor) return i;
  }
  return null;
}

/** The open chat's line. Not persisted; recomputed on open or return. */
export type NewMessagesPlace = {
  key: string | null;
  placed: boolean;
  anchorId: string | null;
};

export function freshNewMessagesPlace(): NewMessagesPlace {
  return { key: null, placed: false, anchorId: null };
}

/**
 * Open or return (`returning`) computes the line from the frozen
 * last-seen id. A later append while that chat stays open keeps the
 * same anchor. Nothing new on a chat you already placed keeps the
 * line; a different chat with nothing new draws none.
 */
export function placeNewMessages(input: {
  place: NewMessagesPlace;
  key: string;
  rows: readonly DividerRow[];
  lastSeenId: string | null;
  returning: boolean;
}): NewMessagesPlace {
  if (
    !input.returning &&
    input.place.placed &&
    input.place.key === input.key
  ) {
    return input.place;
  }
  const index = newMessagesAnchorIndex(input.rows, input.lastSeenId);
  if (index == null) {
    if (input.place.placed && input.place.key === input.key) {
      return { ...input.place, placed: true };
    }
    return { key: input.key, placed: true, anchorId: null };
  }
  return {
    key: input.key,
    placed: true,
    anchorId: input.rows[index]?.id ?? null,
  };
}

/** Send drops the line and leaves the chat in the watching state. */
export function clearNewMessages(place: NewMessagesPlace): NewMessagesPlace {
  return { key: place.key, placed: true, anchorId: null };
}
