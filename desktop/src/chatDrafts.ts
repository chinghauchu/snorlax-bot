// SPDX-License-Identifier: Apache-2.0

/**
 * v0.64 / v0.69: per-chat composer drafts.
 * Keyed by agentId + threadId (`null` thread = top-level timeline).
 * Desktop persists the map in localStorage (`snorlax.chatDrafts`).
 * Send clears that chat. A failed Send writes back onto the chat
 * the text was typed in. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatDrafts.swift`.
 */

export const CHAT_DRAFTS_KEY = "snorlax.chatDrafts";

export type ChatDraftKey = {
  agentId: string;
  threadId: string | null;
};

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Stable map key. Thread id is distinct from the top-level (null) slot. */
export function chatDraftKey(agentId: string, threadId: string | null): string {
  return `${agentId}\u0000${threadId ?? ""}`;
}

function splitDraftKey(
  token: string,
): { agentId: string; threadId: string | null } | null {
  const at = token.indexOf("\u0000");
  if (at <= 0) return null;
  const agentId = token.slice(0, at);
  const rest = token.slice(at + 1);
  return { agentId, threadId: rest.length === 0 ? null : rest };
}

/** Ignore missing, corrupt, or non-object blobs. Empty strings are dropped. */
export function parseChatDrafts(raw: string | null): Map<string, string> {
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
    if (!splitDraftKey(token)) continue;
    slots.set(token, value);
  }
  return slots;
}

export function serializeChatDrafts(slots: ReadonlyMap<string, string>): string {
  const blob: Record<string, string> = {};
  for (const [token, text] of slots) {
    if (text.length === 0 || !splitDraftKey(token)) continue;
    blob[token] = text;
  }
  return JSON.stringify(blob);
}

function readRaw(storage: DraftStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Browser localStorage, or null when this process has no web storage. */
export function browserDraftStorage(): DraftStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export class ChatDrafts {
  private readonly slots: Map<string, string>;
  private readonly storage: DraftStorage | null;
  private readonly storageKey: string;

  constructor(storage: DraftStorage | null = null, storageKey = CHAT_DRAFTS_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.slots = storage
      ? parseChatDrafts(readRaw(storage, storageKey))
      : new Map();
  }

  private persist(): void {
    const storage = this.storage;
    if (!storage) return;
    try {
      storage.setItem(this.storageKey, serializeChatDrafts(this.slots));
    } catch {
      /* quota or private mode: keep the in-memory copy */
    }
  }

  get(agentId: string, threadId: string | null): string {
    return this.slots.get(chatDraftKey(agentId, threadId)) ?? "";
  }

  set(agentId: string, threadId: string | null, text: string): void {
    const key = chatDraftKey(agentId, threadId);
    if (text.length === 0) {
      if (!this.slots.delete(key)) return;
    } else if (this.slots.get(key) === text) {
      return;
    } else {
      this.slots.set(key, text);
    }
    this.persist();
  }

  /** Successful Send drops that conversation's unsent text. */
  clear(agentId: string, threadId: string | null): void {
    this.set(agentId, threadId, "");
  }

  /**
   * Save `text` under the conversation being left and return the draft
   * stored for the conversation being opened (empty when none).
   * The same conversation keeps the live text.
   */
  swap(from: ChatDraftKey | null, text: string, to: ChatDraftKey): string {
    const same =
      from !== null &&
      from.agentId === to.agentId &&
      from.threadId === to.threadId;
    if (from && !same) this.set(from.agentId, from.threadId, text);
    if (same) return text;
    return this.get(to.agentId, to.threadId);
  }

  /**
   * Failed Send writes `text` back onto the conversation it was typed in.
   * Other conversations are left alone.
   */
  restore(agentId: string, threadId: string | null, text: string): void {
    this.set(agentId, threadId, text);
  }
}
