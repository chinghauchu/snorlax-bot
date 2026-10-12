// SPDX-License-Identifier: Apache-2.0

/**
 * v0.77: unread reply count outside the chat list.
 * The number is how many chats carry the v0.70 unread dot
 * (`ChatUnread` / `replyUnreadIds`). Channel handoff unread
 * is a different set and does not count. No new storage.
 * No HTTP.
 * Desktop: window title `(2) Snorlax-Bot`, and the same count
 * on the dock / taskbar where Tauri `set_badge_count` works.
 * Zero clears both.
 * Keep in lockstep with `ios/SnorlaxBot/UnreadOutside.swift`.
 */

export const APP_TITLE = "Snorlax-Bot";

export type UnreadChrome = {
  title: string;
  /** Null clears the dock / taskbar badge. */
  badge: number | null;
};

/** Ids in the v0.70 unread-dot set. Empty strings are not chats. */
export function unreadReplyCount(ids: ReadonlySet<string>): number {
  let count = 0;
  for (const id of ids) {
    if (id.length > 0) count += 1;
  }
  return count;
}

function wholeCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

/** Plain name when nothing is unread. */
export function unreadOutsideTitle(count: number, base = APP_TITLE): string {
  const n = wholeCount(count);
  if (n === 0) return base;
  return `(${n}) ${base}`;
}

/** Null removes the badge. */
export function unreadBadgeCount(count: number): number | null {
  const n = wholeCount(count);
  return n === 0 ? null : n;
}

export function unreadChrome(ids: ReadonlySet<string>): UnreadChrome {
  const count = unreadReplyCount(ids);
  return {
    title: unreadOutsideTitle(count),
    badge: unreadBadgeCount(count),
  };
}

type TauriInvoke = (
  cmd: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export function tauriInvoke(): TauriInvoke | null {
  const internals = (
    globalThis as {
      __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
    }
  ).__TAURI_INTERNALS__;
  return internals?.invoke ?? null;
}

/**
 * Sets `document.title` always. When the Tauri shell is present,
 * also sets the native window title and the dock / taskbar badge.
 * A platform that cannot badge still keeps the title.
 */
export async function applyUnreadChrome(
  chrome: UnreadChrome,
  doc: { title: string } | null = typeof document === "undefined" ? null : document,
  invoke: TauriInvoke | null = tauriInvoke(),
): Promise<void> {
  if (doc) doc.title = chrome.title;
  if (!invoke) return;
  try {
    await invoke("set_unread_chrome", {
      title: chrome.title,
      badge: chrome.badge ?? 0,
    });
  } catch {
    /* title already applied; badge is best-effort */
  }
}
