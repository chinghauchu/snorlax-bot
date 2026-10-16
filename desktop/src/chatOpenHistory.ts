// SPDX-License-Identifier: Apache-2.0

/**
 * v1.23: keyboard back and forward between recently opened chats.
 * Cmd/Ctrl-[ steps back through this window's chat-open history.
 * Cmd/Ctrl-] steps forward again. The history is in memory only and
 * belongs to this window. Opening a chat from the sidebar, the quick
 * switcher, Cmd/Ctrl-1..9, next or previous unread, Alt+Up/Down, a
 * new chat, or the other open paths pushes. Going back and then
 * opening a different chat truncates the forward entries. Deleted
 * chats are skipped. Archived chats stay valid targets because they
 * are still on the roster. Either end is a no-op. The composer does
 * not own the chord and the bracket is not inserted. A key repeat is
 * swallowed and does not step again. IME composition keeps the key.
 * Find, the quick switcher, the shortcuts overlay, rename, the
 * lightbox, a modal or overlay text field, and a focused widget,
 * approve, or connect card keep the key. Shift and Alt stay put.
 * No HTTP. Keep in lockstep with `ios/SnorlaxBot/ChatOpenHistory.swift`.
 */

export const CHAT_HISTORY_KEYS = "Cmd/Ctrl [ / ]";
export const CHAT_HISTORY_ACTION = "Back or forward chat";

export type ChatOpenHistory = {
  /** Chat ids in the order they were opened. Deleted ids may remain and are skipped. */
  ids: string[];
  /**
   * Index of the open chat.
   * -1 when nothing has been opened.
   * `ids.length` when the window left the last chat for the empty state,
   * so Back can return to that chat.
   */
  index: number;
};

export type ChatHistoryDirection = "back" | "forward";

export type ChatHistoryEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ChatHistoryGate = {
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

export function emptyChatOpenHistory(): ChatOpenHistory {
  return { ids: [], index: -1 };
}

/** Roster load and the signed-out placeholder replace the window history. */
export function seedChatOpenHistory(id: string | null): ChatOpenHistory {
  const next = id?.trim() ?? "";
  if (!next) return emptyChatOpenHistory();
  return { ids: [next], index: 0 };
}

/**
 * A user-initiated open. The chat already at the cursor is a no-op,
 * so clicking the open row does not drop the forward stack. Any other
 * id truncates forward history and pushes.
 */
export function recordChatOpen(history: ChatOpenHistory, id: string): ChatOpenHistory {
  const next = id.trim();
  if (!next) return history;
  const onEntry = history.index >= 0 && history.index < history.ids.length;
  if (onEntry && history.ids[history.index] === next) return history;
  // Empty state parked just past this chat. Opening it again returns
  // to that entry instead of stacking a duplicate.
  if (
    history.index === history.ids.length &&
    history.index > 0 &&
    history.ids[history.index - 1] === next
  ) {
    return { ids: history.ids, index: history.index - 1 };
  }
  const keep = history.index < 0 ? 0 : Math.min(history.index + 1, history.ids.length);
  const kept = history.ids.slice(0, keep);
  kept.push(next);
  return { ids: kept, index: kept.length - 1 };
}

/**
 * The open chat left for the empty state. The cursor parks just past
 * that chat so Back opens it again. A second close does not walk further.
 */
export function noteChatOpenClosed(history: ChatOpenHistory): ChatOpenHistory {
  if (history.ids.length === 0 || history.index < 0) return history;
  if (history.index >= history.ids.length) return history;
  return { ids: history.ids, index: history.index + 1 };
}

/**
 * Step back or forward. Ids `alive` rejects are skipped. Archived ids
 * stay reachable when the roster still contains them. The index does
 * not move when every candidate in that direction is gone.
 */
export function stepChatOpenHistory(
  history: ChatOpenHistory,
  direction: ChatHistoryDirection,
  alive: (id: string) => boolean,
): { history: ChatOpenHistory; id: string | null } {
  if (history.ids.length === 0 || history.index < 0) {
    return { history, id: null };
  }
  const delta = direction === "back" ? -1 : 1;
  let index = history.index + delta;
  while (index >= 0 && index < history.ids.length) {
    const id = history.ids[index];
    if (id && alive(id)) {
      return { history: { ids: history.ids, index }, id };
    }
    index += delta;
  }
  return { history, id: null };
}

/**
 * Cmd-[ / Ctrl-[ goes back. Cmd-] / Ctrl-] goes forward. Not both
 * modifiers, and not with Shift or Alt. A key repeat still matches so
 * the handler can swallow it: holding the chord must not insert a
 * bracket and must not step again.
 */
export function chatHistoryDirection(
  event: ChatHistoryEvent,
): ChatHistoryDirection | null {
  if (event.altKey || event.shiftKey) return null;
  if (!(event.metaKey || event.ctrlKey)) return null;
  if (event.metaKey && event.ctrlKey) return null;
  if (event.key === "[" || event.key === "BracketLeft") return "back";
  if (event.key === "]" || event.key === "BracketRight") return "forward";
  return null;
}

/** The first press steps. A repeat of the held chord does not. */
export function chatHistoryShouldMove(input: { repeat?: boolean }): boolean {
  return !input.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsChatHistory(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays and IME own the key. The composer does not. An empty chat
 * does not: Back can return to the chat that was just closed.
 */
export function chatHistoryBlocked(gate: ChatHistoryGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
