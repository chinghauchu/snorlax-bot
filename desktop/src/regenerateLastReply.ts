// SPDX-License-Identifier: Apache-2.0

/**
 * v1.18: regenerate the last assistant reply from the keyboard.
 * Cmd/Ctrl-Shift-Y runs the same path as the Regenerate hover
 * control: the latest completed assistant LEFT kind=message in the
 * open 1:1 chat, POST `{ regenerate: true }`. A channel, a reply
 * that is still streaming, and a transcript with no completed LEFT
 * all skip. The composer does not own the chord and the letter is
 * not inserted. A key repeat is swallowed and does not regenerate
 * again. IME composition keeps the key. Find, the quick switcher,
 * the shortcuts list, rename, the lightbox, a modal or overlay text
 * field, and a focused widget, approve, or connect card keep the
 * key. Nothing is sent when no chat is open. Y is free: the overlay
 * already uses C, A, Backspace, P, M, U, R, D, E, G, F, H, and I.
 * No new HTTP. Keep in lockstep with `ios/SnorlaxBot/RegenerateLastReply.swift`.
 */

import {
  lastCompletedLeftMessageIndex,
  showAssistantRegenerate,
} from "./messageActions.ts";

export const REGENERATE_LAST_REPLY_KEYS = "Cmd/Ctrl Shift Y";
export const REGENERATE_LAST_REPLY_ACTION = "Regenerate the last reply";

export type RegenerateLastReplyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type RegenerateLastReplyGate = {
  /** An open chat is on screen. The empty state does not regenerate. */
  chatOpen: boolean;
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

export type RegenerateReplyRow = {
  kind?: string;
  role?: string;
  senderId?: string;
};

/**
 * Cmd-Shift-Y or Ctrl-Shift-Y, including a key repeat. Alt stays put.
 * Not plain Y, and not Cmd/Ctrl-Y without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert y and must not
 * regenerate again.
 */
export function isRegenerateLastReplyChord(event: RegenerateLastReplyEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "y" || event.key === "Y";
}

/**
 * The first press regenerates. A repeat of the held chord does not.
 * The caller still swallows the repeat so y is not inserted.
 */
export function regenerateLastReplyShouldRun(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsRegenerateLastReply(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-Y there still regenerates when the hover
 * control would.
 */
export function regenerateLastReplyBlocked(gate: RegenerateLastReplyGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * True only when the Regenerate hover control would show on the
 * latest completed LEFT kind=message. That is the same predicate as
 * `showAssistantRegenerate`: a completed LEFT, the latest one, a 1:1
 * chat, and no stream in flight. A channel, a streaming reply, and a
 * transcript with no completed LEFT all return false.
 */
export function regenerateLastReplyAllowed(opts: {
  chatOpen: boolean;
  isChannel: boolean;
  streaming: boolean;
  messages: readonly RegenerateReplyRow[];
  liveAssistantIdx: number;
}): boolean {
  if (!opts.chatOpen) return false;
  const messages = opts.messages.slice();
  const index = lastCompletedLeftMessageIndex(messages, {
    busy: opts.streaming,
    liveAssistantIdx: opts.liveAssistantIdx,
  });
  if (index < 0) return false;
  const message = messages[index]!;
  return showAssistantRegenerate({
    message,
    completed: true,
    isLatest: true,
    isChannel: opts.isChannel,
    streaming: opts.streaming,
  });
}
