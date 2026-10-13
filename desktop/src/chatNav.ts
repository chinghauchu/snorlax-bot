// SPDX-License-Identifier: Apache-2.0

/**
 * v0.92: previous / next chat from the keyboard.
 * Alt+Up / Alt+Down (Option on macOS) opens the neighbor in the
 * sidebar's current visible order: the v0.89 Pinned group first,
 * then the rest, after the v0.88 All / Unread filter. No wrap —
 * the ends stay put. An open chat hidden by Unread does not jump.
 * IME composition does not navigate. Plain Up stays recall (v0.68).
 * In-chat find and the quick switcher keep their own keys.
 * Opening uses the same path as clicking the row. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatNav.swift`.
 */

export const CHAT_NAV_KEYS = "Alt ↑ / Alt ↓";
export const CHAT_NAV_ACTION = "Previous or next chat";

export type ChatNavKey = {
  key: string;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  composing?: boolean;
  /** Find owns previous / next match. Do not switch chats. */
  findOpen?: boolean;
  /** The quick switcher owns ArrowUp / ArrowDown while it is open. */
  switchOpen?: boolean;
  /** Shortcuts overlay, mention / skill menus, takeover, settings. */
  blocked?: boolean;
};

/**
 * -1 previous, +1 next, or null when this key must not switch chats.
 * Repeat is allowed so holding the key walks the list. Other modifiers
 * stay with the field. Plain arrows are not this chord.
 */
export function chatNavDirection(input: ChatNavKey): -1 | 1 | null {
  if (input.composing) return null;
  if (input.findOpen || input.switchOpen || input.blocked) return null;
  if (!input.altKey) return null;
  if (input.metaKey || input.ctrlKey || input.shiftKey) return null;
  if (input.key === "ArrowUp") return -1;
  if (input.key === "ArrowDown") return 1;
  return null;
}

/**
 * Neighbor in visible order. No wrap. A current id that is missing
 * from the list (filtered out, or none open) stays put.
 */
export function adjacentChatId(
  ids: readonly string[],
  currentId: string | null | undefined,
  direction: -1 | 1,
): string | null {
  if (direction !== -1 && direction !== 1) return null;
  if (!currentId) return null;
  const index = ids.indexOf(currentId);
  if (index < 0) return null;
  const next = index + direction;
  if (next < 0 || next >= ids.length) return null;
  const id = ids[next];
  if (!id || id === currentId) return null;
  return id;
}
