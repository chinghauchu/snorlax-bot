// SPDX-License-Identifier: Apache-2.0

/**
 * v0.88: Unread-only filter on the sidebar chat list.
 * All (the default) shows every chat. Unread keeps only rows that
 * currently paint the v0.70 accent dot: a reply that finished
 * off-screen, or a channel handoff unread that shares that same dot.
 * An empty Unread list shows a muted empty state. Opening a chat
 * still clears its unread, so that row leaves Unread. The choice
 * persists in localStorage. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatListFilter.swift`.
 */

export const CHAT_LIST_FILTER_KEY = "snorlax.chatListFilter";

export const FILTER_ALL = "all";
export const FILTER_UNREAD = "unread";

export const FILTER_ALL_LABEL = "All";
export const FILTER_UNREAD_LABEL = "Unread";
export const UNREAD_EMPTY_LABEL = "No unread chats";
export const FILTER_GROUP_LABEL = "Chat list";

export type ChatListFilter = typeof FILTER_ALL | typeof FILTER_UNREAD;

export type FilterStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Missing, corrupt, or unknown values stay All. */
export function parseChatListFilter(raw: string | null | undefined): ChatListFilter {
  return raw === FILTER_UNREAD ? FILTER_UNREAD : FILTER_ALL;
}

export function serializeChatListFilter(filter: ChatListFilter): string {
  return filter === FILTER_UNREAD ? FILTER_UNREAD : FILTER_ALL;
}

export function browserFilterStorage(): FilterStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readChatListFilter(storage: FilterStorage | null): ChatListFilter {
  if (!storage) return FILTER_ALL;
  try {
    return parseChatListFilter(storage.getItem(CHAT_LIST_FILTER_KEY));
  } catch {
    return FILTER_ALL;
  }
}

export function writeChatListFilter(
  storage: FilterStorage | null,
  filter: ChatListFilter,
): void {
  if (!storage) return;
  try {
    storage.setItem(CHAT_LIST_FILTER_KEY, serializeChatListFilter(filter));
  } catch {
    // Storage can throw in private mode. The in-memory choice still applies.
  }
}

/**
 * Unread hides a chat that is not painting the accent dot.
 * All shows every chat, including ones with no dot.
 */
export function chatVisibleInFilter(
  filter: ChatListFilter,
  hasUnreadDot: boolean,
): boolean {
  if (filter !== FILTER_UNREAD) return true;
  return hasUnreadDot;
}

export function showUnreadEmpty(
  filter: ChatListFilter,
  unreadCount: number,
): boolean {
  return filter === FILTER_UNREAD && unreadCount === 0;
}

/** Same order as the roster. All returns every row. */
export function rosterForFilter<T>(
  rows: readonly T[],
  filter: ChatListFilter,
  hasUnreadDot: (row: T) => boolean,
): T[] {
  if (filter !== FILTER_UNREAD) return [...rows];
  return rows.filter((row) => hasUnreadDot(row));
}
