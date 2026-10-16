// SPDX-License-Identifier: Apache-2.0

/**
 * v1.19: focus the sidebar chat list from the keyboard.
 * Cmd/Ctrl-Shift-S moves focus into the sidebar chat list when the
 * open chat is showing and focus is in the composer or elsewhere in
 * the chat column. The currently open chat's row is preferred when
 * that row is visible. Otherwise the first visible row under the
 * current All / Unread, pin, and archive view. Once a row is focused,
 * Up and Down move to the previous or next visible row and leave
 * focus in the list. The composer does not own the chord and the
 * letter is not inserted. A key repeat is swallowed and does not move
 * focus again. IME composition keeps the key. Find, the quick
 * switcher, the shortcuts list, rename, the lightbox, a modal or
 * overlay text field, and a focused widget, approve, or connect card
 * keep the key. A sidebar row that already has focus keeps the key.
 * Nothing changes when there is no chat list to focus. S is free:
 * the overlay already uses C, A, Backspace, P, M, U, R, D, E, G, F,
 * H, J, Y, and I. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/FocusSidebarList.swift`.
 */

export const FOCUS_SIDEBAR_KEYS = "Cmd/Ctrl Shift S";
export const FOCUS_SIDEBAR_ACTION = "Focus the chat list";

/** Sidebar chat row. The rename field and the row buttons sit inside it. */
export const ROSTER_ROW_SELECTOR = "[data-roster-row]";

export type FocusSidebarEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type FocusSidebarGate = {
  /** An open chat is on screen. The empty state does not take the chord. */
  chatOpen: boolean;
  /** Focus is already inside a sidebar chat row, including rename. */
  inSidebarRow: boolean;
  composing: boolean;
  /**
   * Focus is in a text field that is not the composer: find, rename,
   * the switcher query, settings, profile, the channel dialog, and
   * any other modal or overlay field.
   */
  overlayTextField: boolean;
  /** Focus is inside a widget, approve, or connect card. */
  inCard: boolean;
  findOpen: boolean;
  switchOpen: boolean;
  shortcutsOpen: boolean;
  renaming: boolean;
  lightboxOpen: boolean;
  /** Sidebar context menu. */
  menuOpen: boolean;
  /** Takeover, settings, profile, and the other modal sheets, plus mention / skill menus. */
  blocked: boolean;
};

export type SidebarArrowEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  composing?: boolean;
};

type ClosestNode = {
  closest?: (selector: string) => ClosestNode | null;
  getAttribute?: (name: string) => string | null;
};

/**
 * Cmd-Shift-S or Ctrl-Shift-S, including a key repeat. Alt stays put.
 * Not plain S, and not Cmd/Ctrl-S without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert s and must not move
 * focus again.
 */
export function isFocusSidebarChord(event: FocusSidebarEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "s" || event.key === "S";
}

/**
 * The first press moves focus. A repeat of the held chord does not.
 * The caller still swallows the repeat so s is not inserted.
 */
export function focusSidebarShouldMove(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsFocusSidebar(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, a row that already has focus, overlays, and IME
 * own the key. The composer does not.
 */
export function focusSidebarBlocked(gate: FocusSidebarGate): boolean {
  if (!gate.chatOpen || gate.inSidebarRow) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * Row to focus. `ids` is the painted visible order: Pinned first,
 * then the rest, All / Unread applied, archived rows only while that
 * list is showing. The open chat wins when it is in that order.
 * Otherwise the first id. An empty list is null.
 */
export function sidebarFocusTargetId(
  ids: readonly string[],
  openId: string | null | undefined,
): string | null {
  const visible = ids.filter((id) => id.length > 0);
  if (visible.length === 0) return null;
  if (openId && visible.includes(openId)) return openId;
  return visible[0] ?? null;
}

/** True when the focused node sits inside a sidebar chat row. */
export function focusInsideRosterRow(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as ClosestNode;
  if (typeof el.closest !== "function") return false;
  return Boolean(el.closest(ROSTER_ROW_SELECTOR));
}

/** The chat id of the sidebar row that contains focus, if any. */
export function rosterRowIdFromTarget(target: EventTarget | null): string | null {
  if (!target || typeof target !== "object") return null;
  const el = target as ClosestNode;
  if (typeof el.closest !== "function") return null;
  const row = el.closest(ROSTER_ROW_SELECTOR);
  const id = row?.getAttribute?.("data-roster-id") ?? "";
  return id.length > 0 ? id : null;
}

/**
 * -1 previous, +1 next, or null. Plain Up / Down only. Modifiers stay
 * with Alt+Up/Down, find, and the composer. IME stays put. Repeat is
 * allowed so holding the key walks the list.
 */
export function sidebarListArrowDirection(
  event: SidebarArrowEvent,
): -1 | 1 | null {
  if (event.composing) return null;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  if (event.key === "ArrowUp") return -1;
  if (event.key === "ArrowDown") return 1;
  return null;
}
