// SPDX-License-Identifier: Apache-2.0

/**
 * v0.68: recall the user's most recent sent message into the composer.
 * Empty composer + Up-arrow (desktop / hardware keyboard) fills an
 * editable draft, caret at the end. Escape, or clearing the field,
 * restores empty. No recall while the composer has text or IME is
 * composing. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/RecallDraft.swift`.
 */

import { isUserSender } from "./mentions.ts";

export const EDIT_AS_NEW_MESSAGE = "Edit as new message";

export type RecallRow = {
  senderId?: string;
  role?: string;
  kind?: string;
  content?: string;
};

/** User `kind=message` with text. Attachment-only rows are skipped. */
export function isRecallableUserMessage(row: RecallRow): boolean {
  if (!isUserSender(row.senderId, row.role)) return false;
  const kind = row.kind ?? "message";
  if (kind !== "message") return false;
  return (row.content ?? "").length > 0;
}

/** Latest recallable user message in this transcript, or null. */
export function latestUserMessageText(rows: RecallRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row && isRecallableUserMessage(row)) return row.content ?? "";
  }
  return null;
}

/**
 * Up-arrow recalls only from an empty composer, with no chord and
 * with IME composition idle. Mention / skill menus own ArrowUp
 * before this is asked.
 */
export function arrowUpRecalls(input: {
  key: string;
  composerText: string;
  composing: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (input.key !== "ArrowUp") return false;
  if (input.composing) return false;
  if (input.altKey || input.metaKey || input.ctrlKey || input.shiftKey) {
    return false;
  }
  return input.composerText.length === 0;
}

/**
 * Escape restores an armed recall to empty.
 * Stop wins while generating. IME, and a pending widget / approve /
 * connect card, keep Escape. An unarmed draft is left alone.
 */
export function escapeClearsRecall(input: {
  armed: boolean;
  composing: boolean;
  busy: boolean;
  pendingWidget?: boolean;
  pendingApprove?: boolean;
  pendingConnect?: boolean;
}): boolean {
  if (!input.armed) return false;
  if (input.composing) return false;
  if (input.busy) return false;
  if (input.pendingWidget || input.pendingApprove || input.pendingConnect) {
    return false;
  }
  return true;
}

/**
 * Clearing the field ends the recall. Edits that leave text stay
 * armed so Escape can still restore empty.
 */
export function recallArmedAfterEdit(text: string, wasArmed: boolean): boolean {
  return wasArmed && text.length > 0;
}
