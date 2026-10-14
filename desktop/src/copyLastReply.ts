// SPDX-License-Identifier: Apache-2.0

/**
 * v1.00: copy the last assistant reply.
 * Cmd/Ctrl-Shift-C copies the latest completed assistant LEFT
 * kind=message — the same markdown source the Copy button copies.
 * A reply that is still streaming is skipped. An empty reply copies
 * nothing, so the clipboard stays put. The muted Copied label sits
 * beside that message's Copy for 1.2s. The composer may stay focused.
 * Plain Cmd/Ctrl-C still copies a selection. Find, the quick switcher,
 * the shortcuts list, rename, the lightbox, a context menu, and a
 * focused widget, approve, or connect card keep the key. IME keeps it.
 * Nothing is sent. No HTTP. v0.56 compact tool traces stay as they are.
 * Keep in lockstep with `ios/SnorlaxBot/CopyLastReply.swift`.
 */

import { isLeftKindMessage } from "./messageActions.ts";

export const COPY_LAST_REPLY_KEYS = "Cmd/Ctrl Shift C";
export const COPY_LAST_REPLY_ACTION = "Copy the last reply";

export type CopyLastReplyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type CopyLastReplyGate = {
  /** An open chat is on screen. */
  chatOpen: boolean;
  composing: boolean;
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

export type ReplyRow = {
  id: string;
  kind?: string | null;
  role?: string | null;
  senderId?: string | null;
  content?: string | null;
};

/** Cmd-Shift-C or Ctrl-Shift-C. Alt stays with the browser. Not plain Cmd/Ctrl-C. */
export function isCopyLastReplyChord(event: CopyLastReplyEvent): boolean {
  if (event.repeat) return false;
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "c" || event.key === "C";
}

/**
 * Overlays and IME own the keyboard. A text field does not block the
 * chord: the composer may stay focused, and the draft is not edited.
 */
export function copyLastReplyBlocked(gate: CopyLastReplyGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * Latest completed LEFT kind=message that has text. Skip the live
 * streaming index. Tool, widget, approve, connect, and user bubbles
 * are not replies. Whitespace-only content is not a reply.
 */
export function lastAssistantReply<T extends ReplyRow>(
  messages: readonly T[],
  opts: { busy: boolean; liveAssistantIdx: number },
): T | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]!;
    if (
      !isLeftKindMessage({
        kind: row.kind || undefined,
        role: row.role || undefined,
        senderId: row.senderId || undefined,
      })
    ) {
      continue;
    }
    if (opts.busy && i === opts.liveAssistantIdx) continue;
    if (!(row.content ?? "").trim()) continue;
    return row;
  }
  return null;
}
