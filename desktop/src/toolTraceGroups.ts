// SPDX-License-Identifier: Apache-2.0

/**
 * v1.14: collapse or expand every tool-trace group from the keyboard.
 * Cmd/Ctrl-Shift-G toggles the v0.56 compact groups already on screen.
 * A group is 2+ consecutive kind=tool lines. A single tool line is not
 * a group. If any group is expanded, every group collapses. If every
 * group is collapsed, every group expands. The same chevron and
 * `N tools` line stays. The composer does not own the chord and the
 * letter is not inserted. A key repeat is swallowed and does not flap.
 * IME composition keeps the key. Find, the quick switcher, the
 * shortcuts list, rename, the lightbox, a modal or overlay text field,
 * and a focused widget, approve, or connect card keep the key. Nothing
 * changes when no chat is open or the loaded transcript has no group.
 * Cmd/Ctrl-Shift-G is free: the overlay already uses C, A, Backspace,
 * P, M, U, R, D, E, I, and no period or G chord. G names the groups.
 * No new HTTP. Keep in lockstep with `ios/SnorlaxBot/ToolTraceGroups.swift`.
 */

export const TOOL_TRACE_GROUPS_KEYS = "Cmd/Ctrl Shift G";
export const TOOL_TRACE_GROUPS_ACTION = "Collapse or expand tool traces";

export type ToolTraceGroupsEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type ToolTraceGroupsGate = {
  /** An open chat is on screen. The empty state does not toggle. */
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

/**
 * Cmd-Shift-G or Ctrl-Shift-G, including a key repeat. Alt stays put.
 * Not plain G, and not Cmd/Ctrl-G without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert g and must not flap.
 */
export function isToolTraceGroupsChord(event: ToolTraceGroupsEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "g" || event.key === "G";
}

/**
 * The first press toggles. A repeat of the held chord does not.
 * The caller still swallows the repeat so g is not inserted.
 */
export function toolTraceGroupsShouldToggle(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsToolTraceGroups(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-G there still toggles the open chat's groups.
 */
export function toolTraceGroupsBlocked(gate: ToolTraceGroupsGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
