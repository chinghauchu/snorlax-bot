// SPDX-License-Identifier: Apache-2.0

/**
 * v0.97: muted section headers in the sidebar.
 * Pinned stays the header for the pin group. Unpinned chats in the
 * main roster sit under Chats. A group with no rows does not paint
 * a header. Headers are chrome: they are not rows, so Alt+Up/Down
 * still walks pin order then roster order. The archive list is
 * separate and does not grow a Chats header. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatSections.swift`.
 */

import { PINNED_GROUP_LABEL } from "./chatPins.ts";

export const CHATS_SECTION_LABEL = "Chats";

export type RosterSectionId = "pinned" | "chats";

/** A non-positive or non-finite count is an empty group. */
export function sectionHasRows(count: number): boolean {
  return Number.isFinite(count) && count > 0;
}

/**
 * Main-list headers in visible order. Empty groups are omitted.
 * Archive is not a header here.
 */
export function rosterSectionHeaders(
  pinnedCount: number,
  restCount: number,
): RosterSectionId[] {
  const headers: RosterSectionId[] = [];
  if (sectionHasRows(pinnedCount)) headers.push("pinned");
  if (sectionHasRows(restCount)) headers.push("chats");
  return headers;
}

export function rosterSectionLabel(id: RosterSectionId): string {
  return id === "pinned" ? PINNED_GROUP_LABEL : CHATS_SECTION_LABEL;
}
