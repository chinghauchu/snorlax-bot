// SPDX-License-Identifier: Apache-2.0

/**
 * v0.70: unread dot on a sidebar chat row.
 * A non-empty assistant kind=message that finishes while that chat is
 * not on screen, or while the app/window is not focused, marks the row.
 * Opening the chat clears it. Coming back to a focused window while
 * that chat is already on screen clears it too (you are looking at the
 * reply). The set persists in localStorage (`snorlax.chatUnread`) so a
 * relaunch keeps the dots. No HTTP.
 * Channel handoff unread stays a separate in-memory set.
 * v0.90: the sidebar menu marks a read chat into this same set, or
 * clears a dotted chat. Mark as read also drops a channel handoff
 * dot so the accent dot leaves the row. Opening the chat still
 * clears this set. No new storage key.
 * v1.01: Mark all as read empties this same set, including archived
 * chats. Those chats stay archived. Channel handoff dots are a
 * separate in-memory set the caller clears too. No new storage key.
 * Keep in lockstep with `ios/SnorlaxBot/ChatUnread.swift`.
 */

export const CHAT_UNREAD_KEY = "snorlax.chatUnread";

export const MARK_UNREAD_LABEL = "Mark as unread";
export const MARK_READ_LABEL = "Mark as read";
export const MARK_ALL_READ_LABEL = "Mark all as read";

/** A dotted row offers Mark as read. A read row offers Mark as unread. */
export function unreadActionLabel(showsDot: boolean): string {
  return showsDot ? MARK_READ_LABEL : MARK_UNREAD_LABEL;
}

/**
 * The Mark all as read control is shown only when a chat still paints
 * an accent dot. Empty strings are not chats. Archived ids count:
 * they stay in this set until cleared.
 */
export function anyChatUnread(
  replyUnread: ReadonlySet<string>,
  handoffUnread: ReadonlySet<string>,
): boolean {
  for (const id of replyUnread) {
    if (id.length > 0) return true;
  }
  for (const id of handoffUnread) {
    if (id.length > 0) return true;
  }
  return false;
}

/**
 * The v0.70 accent dot. Reply unread is the persisted set. A channel
 * handoff unread shares that same dot and lives in a separate set.
 */
export function rowShowsUnreadDot(
  chatId: string,
  replyUnread: ReadonlySet<string>,
  handoffUnread: ReadonlySet<string>,
): boolean {
  if (!chatId) return false;
  return replyUnread.has(chatId) || handoffUnread.has(chatId);
}

export type UnreadStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function browserUnreadStorage(): UnreadStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Desktop window is focused when it has focus and the tab is visible. */
export function windowIsFocused(doc: {
  hasFocus(): boolean;
  visibilityState: string;
}): boolean {
  return doc.hasFocus() && doc.visibilityState !== "hidden";
}

/**
 * Completed assistant LEFT kind=message the roster can mark unread.
 * User bubbles, tool / widget / approve / connect, and empty replies
 * do not.
 */
export function isFinishedAssistantReply(message: {
  role?: string;
  senderId?: string;
  kind?: string | null;
  content?: string;
  attachments?: readonly unknown[] | null;
}): boolean {
  if (message.role === "user" || message.senderId === "user") return false;
  if (message.kind && message.kind !== "message") return false;
  if ((message.content ?? "").length > 0) return true;
  return Boolean(message.attachments && message.attachments.length > 0);
}

/**
 * Mark when the reply's chat is not the one on screen, or the
 * app/window is not focused on it. A focused view of that chat does
 * not mark.
 */
export function replyMarksUnread(input: {
  chatId: string;
  openChatId: string | null;
  focused: boolean;
}): boolean {
  if (!input.chatId) return false;
  if (!input.focused) return true;
  return input.chatId !== input.openChatId;
}

/**
 * Chat currently on screen. iPad's detail is the selection. iPhone is
 * the pushed chat; an empty navigation path is the list (no open chat).
 * Desktop always passes the active id as `selectedId` with `pad` true.
 */
export function onScreenChatId(input: {
  pad: boolean;
  selectedId: string | null;
  navigationLast: string | null;
}): string | null {
  if (input.pad) return input.selectedId;
  return input.navigationLast;
}

/** Ignore missing, corrupt, or non-array blobs. Empty strings are dropped. */
export function parseChatUnread(raw: string | null): Set<string> {
  const ids = new Set<string>();
  if (!raw) return ids;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ids;
  }
  if (!Array.isArray(parsed)) return ids;
  for (const item of parsed) {
    if (typeof item !== "string" || item.length === 0) continue;
    ids.add(item);
  }
  return ids;
}

export function serializeChatUnread(ids: ReadonlySet<string>): string {
  return JSON.stringify([...ids].filter((id) => id.length > 0).sort());
}

function readRaw(storage: UnreadStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export class ChatUnread {
  private readonly ids: Set<string>;
  private readonly storage: UnreadStorage | null;
  private readonly storageKey: string;

  constructor(
    storage: UnreadStorage | null = null,
    storageKey = CHAT_UNREAD_KEY,
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.ids = storage
      ? parseChatUnread(readRaw(storage, storageKey))
      : new Set();
  }

  snapshot(): Set<string> {
    return new Set(this.ids);
  }

  has(chatId: string): boolean {
    return this.ids.has(chatId);
  }

  /** Returns true when the set changed. */
  mark(chatId: string): boolean {
    if (!chatId || this.ids.has(chatId)) return false;
    this.ids.add(chatId);
    this.persist();
    return true;
  }

  /** Opening a chat clears its dot. Returns true when the set changed. */
  clear(chatId: string): boolean {
    if (!chatId || !this.ids.delete(chatId)) return false;
    this.persist();
    return true;
  }

  /**
   * Mark all as read. Drops every id, including archived chats.
   * Returns true when the set changed. Writes the same storage key.
   */
  clearAll(): boolean {
    if (this.ids.size === 0) return false;
    this.ids.clear();
    this.persist();
    return true;
  }

  /** Drop ids that left the roster. Returns true when the set changed. */
  retain(keep: ReadonlySet<string>): boolean {
    let changed = false;
    for (const id of [...this.ids]) {
      if (!keep.has(id)) {
        this.ids.delete(id);
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
      storage.setItem(this.storageKey, serializeChatUnread(this.ids));
    } catch {
      /* quota or private mode: keep the in-memory copy */
    }
  }
}
