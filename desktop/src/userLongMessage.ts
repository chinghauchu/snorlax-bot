// SPDX-License-Identifier: Apache-2.0

/**
 * v2.16: collapse a very long user message.
 * A settled user-RIGHT kind=message taller than about 14 lines shows
 * the first chunk and Show more. Click or tap expands that bubble and
 * the control becomes Show less. An in-flight optimistic send stays
 * open. A failed send is settled and can collapse. Each bubble
 * collapses on its own. The 14-line measure, Show more / Show less,
 * Reduce Motion, and the active-find unclamp stay in longMessage.ts
 * (the same rules as a completed assistant LEFT). No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/UserLongMessage.swift`.
 */

/**
 * The bubble may collapse only after it has settled.
 * An in-flight optimistic send stays fully open. Attachment-only
 * rows have no text. Assistant, tool, widget, approve, and connect
 * rows are not user messages.
 */
export function userLongMessageSettled(input: {
  fromUser: boolean;
  kindMessage: boolean;
  hasText: boolean;
  pending: boolean;
}): boolean {
  if (!input.fromUser) return false;
  if (!input.kindMessage) return false;
  if (!input.hasText) return false;
  if (input.pending) return false;
  return true;
}
