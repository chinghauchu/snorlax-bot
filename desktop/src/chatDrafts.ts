// SPDX-License-Identifier: Apache-2.0

/**
 * v0.64: per-chat composer drafts. In memory for the app session only.
 * Keyed by agentId + threadId (`null` thread = top-level timeline).
 * No persistence and no HTTP.
 */

export type ChatDraftKey = {
  agentId: string;
  threadId: string | null;
};

/** Stable map key. Thread id is distinct from the top-level (null) slot. */
export function chatDraftKey(agentId: string, threadId: string | null): string {
  return `${agentId}\u0000${threadId ?? ""}`;
}

export class ChatDrafts {
  private readonly slots = new Map<string, string>();

  get(agentId: string, threadId: string | null): string {
    return this.slots.get(chatDraftKey(agentId, threadId)) ?? "";
  }

  set(agentId: string, threadId: string | null, text: string): void {
    const key = chatDraftKey(agentId, threadId);
    if (text.length === 0) this.slots.delete(key);
    else this.slots.set(key, text);
  }

  /** Successful Send drops that conversation's unsent text. */
  clear(agentId: string, threadId: string | null): void {
    this.slots.delete(chatDraftKey(agentId, threadId));
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
