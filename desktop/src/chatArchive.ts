// SPDX-License-Identifier: Apache-2.0

/**
 * v0.96: archive a chat from the sidebar.
 * Right-click offers Archive beside Pin, Rename, and Mark unread.
 * The chat leaves the main list immediately. A muted Archived (n)
 * toggle at the bottom of the sidebar lists archived chats.
 * Unarchive puts the chat back in pin order if it is pinned, otherwise
 * in roster order. Pin is hidden while archived; the pin id stays so
 * Unarchive restores it. Alt+Up/Down and the Unread filter skip
 * archived chats. The quick switcher still lists them. A new reply
 * does not unarchive; the unread set is separate. The set persists
 * in localStorage (`snorlax.chatArchives`). Deleting a chat drops it.
 * No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatArchive.swift`.
 */

import { adjacentChatId } from "./chatNav.ts";

export const CHAT_ARCHIVES_KEY = "snorlax.chatArchives";

export const ARCHIVE_LABEL = "Archive";
export const UNARCHIVE_LABEL = "Unarchive";
export const ARCHIVED_SECTION_LABEL = "Archived";

export type ArchiveStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** "Archived (3)". The count is the number of archived chats still on the roster. */
export function archivedSectionLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${ARCHIVED_SECTION_LABEL} (${n})`;
}

/** Missing, corrupt, or non-array blobs are an empty list. Later duplicates drop. */
export function parseChatArchives(raw: string | null | undefined): string[] {
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

export function serializeChatArchives(ids: readonly string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return JSON.stringify(unique);
}

export function browserArchiveStorage(): ArchiveStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readChatArchives(storage: ArchiveStorage | null): string[] {
  if (!storage) return [];
  try {
    return parseChatArchives(storage.getItem(CHAT_ARCHIVES_KEY));
  } catch {
    return [];
  }
}

export function writeChatArchives(
  storage: ArchiveStorage | null,
  ids: readonly string[],
): void {
  if (!storage) return;
  try {
    storage.setItem(CHAT_ARCHIVES_KEY, serializeChatArchives(ids));
  } catch {
    // Storage can throw in private mode. The in-memory set still applies.
  }
}

export function isChatArchived(ids: readonly string[], id: string): boolean {
  return id.length > 0 && ids.includes(id);
}

/** Append. Already archived returns the same list. */
export function archiveChat(ids: readonly string[], id: string): string[] {
  if (!id || ids.includes(id)) return [...ids];
  return [...ids, id];
}

/** Remove. A chat that was not archived returns the same list. */
export function unarchiveChat(ids: readonly string[], id: string): string[] {
  if (!id || !ids.includes(id)) return [...ids];
  return ids.filter((row) => row !== id);
}

/** Drop ids that left the roster. Order of the ones that remain stays. */
export function retainChatArchives(
  ids: readonly string[],
  keep: ReadonlySet<string>,
): string[] {
  return ids.filter((id) => id.length > 0 && keep.has(id));
}

/** Main sidebar rows. Archived chats are gone. Order otherwise stays. */
export function excludeArchived<T>(
  rows: readonly T[],
  archivedIds: readonly string[],
  idOf: (row: T) => string,
): T[] {
  return rows.filter((row) => !isChatArchived(archivedIds, idOf(row)));
}

/**
 * After archiving `archivedId`, the chat that should be open.
 * `visibleIds` is the Alt+Up/Down order before the archive (pinned,
 * then the rest, after All / Unread, archived chats already absent).
 * Archiving the open chat opens the following row. The last row, or
 * an open chat that is not in that order, becomes the empty state.
 * Archiving some other chat leaves the open chat alone.
 */
export function selectionAfterArchive(
  visibleIds: readonly string[],
  openId: string | null | undefined,
  archivedId: string,
): string | null {
  if (!archivedId) return openId ?? null;
  if (openId !== archivedId) return openId ?? null;
  return adjacentChatId(visibleIds, openId, 1);
}
