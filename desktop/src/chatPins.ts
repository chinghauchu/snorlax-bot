// SPDX-License-Identifier: Apache-2.0

/**
 * v0.89: pin a chat to the top of the sidebar.
 * Right-click or the hover control offers Pin / Unpin. Pinned rows
 * sit in a Pinned group, in the order they were pinned. Unpinned
 * rows keep the roster order below. The set persists in localStorage
 * (`snorlax.chatPins`). Deleting a chat drops its pin. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatPins.swift`.
 */

export const CHAT_PINS_KEY = "snorlax.chatPins";

export const PIN_LABEL = "Pin";
export const UNPIN_LABEL = "Unpin";
export const PINNED_GROUP_LABEL = "Pinned";

export type PinStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type PinnedRoster<T> = {
  pinned: T[];
  rest: T[];
};

/** Missing, corrupt, or non-array blobs are an empty list. Later duplicates drop. */
export function parseChatPins(raw: string | null | undefined): string[] {
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

export function serializeChatPins(ids: readonly string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return JSON.stringify(unique);
}

export function browserPinStorage(): PinStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readChatPins(storage: PinStorage | null): string[] {
  if (!storage) return [];
  try {
    return parseChatPins(storage.getItem(CHAT_PINS_KEY));
  } catch {
    return [];
  }
}

export function writeChatPins(storage: PinStorage | null, ids: readonly string[]): void {
  if (!storage) return;
  try {
    storage.setItem(CHAT_PINS_KEY, serializeChatPins(ids));
  } catch {
    // Storage can throw in private mode. The in-memory order still applies.
  }
}

export function isChatPinned(ids: readonly string[], id: string): boolean {
  return id.length > 0 && ids.includes(id);
}

/** Pin appends. Unpin removes. A new pin goes after the ones already pinned. */
export function toggleChatPin(ids: readonly string[], id: string): string[] {
  if (!id) return [...ids];
  if (ids.includes(id)) return ids.filter((row) => row !== id);
  return [...ids.filter((row) => row !== id), id];
}

/** Drop ids that left the roster. Pin order of the ones that remain stays. */
export function retainChatPins(
  ids: readonly string[],
  keep: ReadonlySet<string>,
): string[] {
  return ids.filter((id) => id.length > 0 && keep.has(id));
}

export function pinActionLabel(pinned: boolean): string {
  return pinned ? UNPIN_LABEL : PIN_LABEL;
}

/**
 * Pinned rows first, in pin order, then the rest in roster order.
 * An id that is not in `rows` (filtered out, or already deleted) is skipped.
 */
export function groupPinnedChats<T>(
  rows: readonly T[],
  pinnedIds: readonly string[],
  idOf: (row: T) => string,
): PinnedRoster<T> {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(idOf(row), row);
  const pinned: T[] = [];
  const taken = new Set<string>();
  for (const id of pinnedIds) {
    if (!id || taken.has(id)) continue;
    const row = byId.get(id);
    if (!row) continue;
    pinned.push(row);
    taken.add(id);
  }
  const rest = rows.filter((row) => !taken.has(idOf(row)));
  return { pinned, rest };
}
