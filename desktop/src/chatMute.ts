// SPDX-License-Identifier: Apache-2.0

/**
 * v1.02: mute a chat from the sidebar.
 * Right-click or the hover control offers Mute / Unmute. A muted
 * chat still receives messages and still opens. It does not paint
 * the unread accent dot, and a finished assistant reply does not
 * add it to the unread count outside the list. The Unread filter
 * skips it. The row shows a muted glyph. The set persists in
 * localStorage (`snorlax.chatMutes`). Deleting a chat drops it.
 * No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatMute.swift`.
 */

export const CHAT_MUTES_KEY = "snorlax.chatMutes";

export const MUTE_LABEL = "Mute";
export const UNMUTE_LABEL = "Unmute";
export const MUTED_GLYPH_LABEL = "Muted";

export type MuteStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Missing, corrupt, or non-array blobs are an empty list. Later duplicates drop. */
export function parseChatMutes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string" || item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  return ids;
}

export function serializeChatMutes(ids: readonly string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return JSON.stringify(unique);
}

export function browserMuteStorage(): MuteStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readChatMutes(storage: MuteStorage | null): string[] {
  if (!storage) return [];
  try {
    return parseChatMutes(storage.getItem(CHAT_MUTES_KEY));
  } catch {
    return [];
  }
}

export function writeChatMutes(
  storage: MuteStorage | null,
  ids: readonly string[],
): void {
  if (!storage) return;
  try {
    storage.setItem(CHAT_MUTES_KEY, serializeChatMutes(ids));
  } catch {
    // Storage can throw in private mode. The in-memory set still applies.
  }
}

export function isChatMuted(ids: readonly string[], id: string): boolean {
  return id.length > 0 && ids.includes(id);
}

/** Mute appends. Unmute removes. Order of the ones that stay is kept. */
export function toggleChatMute(ids: readonly string[], id: string): string[] {
  if (!id) return [...ids];
  if (ids.includes(id)) return ids.filter((row) => row !== id);
  return [...ids.filter((row) => row !== id), id];
}

/** Drop ids that left the roster. Order of the ones that remain stays. */
export function retainChatMutes(
  ids: readonly string[],
  keep: ReadonlySet<string>,
): string[] {
  return ids.filter((id) => id.length > 0 && keep.has(id));
}

export function muteActionLabel(muted: boolean): string {
  return muted ? UNMUTE_LABEL : MUTE_LABEL;
}

/**
 * A muted chat does not paint the v0.70 accent dot, even when a
 * reply or a handoff would have.
 */
export function paintsUnreadAccent(muted: boolean, wouldPaint: boolean): boolean {
  if (muted) return false;
  return wouldPaint;
}

/**
 * A finished assistant reply does not mark a muted chat unread,
 * so the count outside the list does not grow.
 */
export function replyMayMarkUnread(muted: boolean): boolean {
  return !muted;
}

/**
 * Ids that still count as unread outside the list and in the
 * Unread filter. Muted chats are left out. Empty strings are not chats.
 */
export function audibleUnreadIds(
  ids: ReadonlySet<string>,
  mutedIds: readonly string[],
): Set<string> {
  const muted = new Set(mutedIds);
  const next = new Set<string>();
  for (const id of ids) {
    if (!id || muted.has(id)) continue;
    next.add(id);
  }
  return next;
}
