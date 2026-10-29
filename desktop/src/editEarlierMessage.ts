// SPDX-License-Identifier: Apache-2.0

/**
 * v2.15: edit an earlier message as a new draft.
 * Every settled user-RIGHT kind=message with text can refill the
 * composer. The latest-only Up-arrow recall stays in recallDraft.ts.
 * Escape restores the composer text from immediately before this
 * action. Nothing is sent, queued, or removed. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/EditEarlierMessage.swift`.
 */

export const EDIT_EARLIER_LABEL = "Edit as new message";

export type EditAsNewDraft = {
  text: string;
  /** UTF-16 caret, matching JavaScript string length and NSString.length. */
  caret: number;
  /** Composer text to put back if Escape clears this arm. One level. */
  restore: string;
};

/**
 * Settled user kind=message with text. An in-flight optimistic send
 * is hidden. Attachment-only rows (empty content) are not offered.
 * Assistant, tool, widget, approve, and connect rows are not.
 */
export function offersEditAsNew(input: {
  fromUser: boolean;
  kindMessage: boolean;
  content: string;
  pending: boolean;
}): boolean {
  if (input.pending) return false;
  if (!input.fromUser) return false;
  if (!input.kindMessage) return false;
  return input.content.length > 0;
}

/**
 * Replace the composer with that message. Caret at the end.
 * `restore` is the text that was already in the field, including empty.
 * An empty message is not a draft. Does not send.
 */
export function editAsNewDraft(
  current: string,
  messageText: string,
): EditAsNewDraft | null {
  if (messageText.length === 0) return null;
  return {
    text: messageText,
    caret: messageText.length,
    restore: current,
  };
}

/** Escape puts the snapshot back and parks the caret at its end. */
export function restoredComposerCaret(restore: string): number {
  return restore.length;
}
