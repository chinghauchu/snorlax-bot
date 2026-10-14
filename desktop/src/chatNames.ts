// SPDX-License-Identifier: Apache-2.0

/**
 * v0.95: rename a chat from the sidebar.
 * Right-click or the hover control offers Rename. The row name
 * becomes an inline field. Enter or blur keeps a trimmed non-empty
 * name. Escape restores the previous one. A blank name is rejected.
 * The display name is a local overlay on the server name
 * (`snorlax.chatNames`). Deleting a chat drops it. The identity
 * pane still edits the server name; a save that changes that name
 * drops the overlay so the saved name shows. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatNames.swift`.
 */

export const CHAT_NAMES_KEY = "snorlax.chatNames";
export const RENAME_LABEL = "Rename";
export const RENAME_FIELD_LABEL = "Chat name";
export const CHAT_NAME_MAX = 80;

export type ChatNameMap = Record<string, string>;

export type NameStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function cleanedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CHAT_NAME_MAX) return null;
  return trimmed;
}

/** Missing, corrupt, or non-object blobs are an empty map. Blank values drop. */
export function parseChatNames(raw: string | null | undefined): ChatNameMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const names: ChatNameMap = {};
  for (const [id, value] of Object.entries(parsed)) {
    const name = cleanedName(value);
    if (!id || !name) continue;
    names[id] = name;
  }
  return names;
}

export function serializeChatNames(names: ChatNameMap): string {
  const clean: ChatNameMap = {};
  for (const id of Object.keys(names).sort()) {
    const name = cleanedName(names[id]);
    if (!id || !name) continue;
    clean[id] = name;
  }
  return JSON.stringify(clean);
}

export function browserNameStorage(): NameStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readChatNames(storage: NameStorage | null): ChatNameMap {
  if (!storage) return {};
  try {
    return parseChatNames(storage.getItem(CHAT_NAMES_KEY));
  } catch {
    return {};
  }
}

export function writeChatNames(storage: NameStorage | null, names: ChatNameMap): void {
  if (!storage) return;
  try {
    storage.setItem(CHAT_NAMES_KEY, serializeChatNames(names));
  } catch {
    // Storage can throw in private mode. The in-memory name still applies.
  }
}

/** Local overlay when one is stored. Otherwise the server name. */
export function chatDisplayName(
  names: ChatNameMap,
  id: string,
  serverName: string,
): string {
  if (!id) return serverName;
  return cleanedName(names[id]) ?? serverName;
}

/**
 * Trim, reject blank or over-long drafts, and keep the previous map
 * (same reference) when nothing changes. A name equal to the server
 * name drops the overlay.
 */
export function commitChatName(
  names: ChatNameMap,
  id: string,
  draft: string,
  serverName: string,
): ChatNameMap {
  if (!id) return names;
  const next = cleanedName(draft);
  if (!next) return names;
  if (next === serverName) {
    if (!(id in names)) return names;
    const copy = { ...names };
    delete copy[id];
    return copy;
  }
  if (names[id] === next) return names;
  return { ...names, [id]: next };
}

/** Drop ids that left the roster. */
export function retainChatNames(
  names: ChatNameMap,
  keep: ReadonlySet<string>,
): ChatNameMap {
  let changed = false;
  const next: ChatNameMap = {};
  for (const [id, value] of Object.entries(names)) {
    const name = cleanedName(value);
    if (!id || !name || !keep.has(id)) {
      changed = true;
      continue;
    }
    next[id] = name;
    if (names[id] !== name) changed = true;
  }
  if (!changed && Object.keys(next).length === Object.keys(names).length) return names;
  return next;
}

/** Drop one overlay. Same reference when that id was not stored. */
export function clearChatName(names: ChatNameMap, id: string): ChatNameMap {
  if (!id || !(id in names)) return names;
  const copy = { ...names };
  delete copy[id];
  return copy;
}
