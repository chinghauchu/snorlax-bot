// SPDX-License-Identifier: Apache-2.0

/**
 * v1.03: keyboard scroll of the loaded transcript.
 * PageUp / PageDown move about one viewport. Cmd/Ctrl-Home jumps to
 * the oldest loaded messages. Cmd/Ctrl-End jumps to the latest and
 * uses the Jump-to-latest path so stick-to-bottom re-arms the same
 * way the Jump chip does. Page keys that land near the bottom re-arm
 * through the existing stick-to-bottom scroll check.
 * The composer, find bar, rename field, quick switcher, shortcuts
 * overlay, lightbox, context menu, and a focused widget, approve, or
 * connect card keep the keys. IME keeps them. Up-arrow recall,
 * Esc=Stop, Esc=Jump, Alt+Up/Down, Cmd/Ctrl-L, Cmd/Ctrl-Shift-C, and
 * in-chat find stay. Scroll is an instant offset change, so Reduce
 * Motion adds no animation. No HTTP. Nothing is persisted.
 * Keep in lockstep with `ios/SnorlaxBot/TranscriptScroll.swift`.
 */

import { NEAR_BOTTOM_PX, isNearBottom, type StickBox } from "./stickToBottom.ts";

export const TRANSCRIPT_PAGE_KEYS = "Page Up / Page Down";
export const TRANSCRIPT_PAGE_ACTION = "Scroll the transcript";
export const TRANSCRIPT_EDGE_KEYS = "Cmd/Ctrl Home / End";
export const TRANSCRIPT_EDGE_ACTION = "Oldest or latest messages";

export type TranscriptScrollAction = "pageUp" | "pageDown" | "top" | "bottom";

export type TranscriptScrollEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export type TranscriptScrollGate = {
  /** An open chat is on screen, so there is a transcript to scroll. */
  chatOpen: boolean;
  composing: boolean;
  /** Composer, find, rename, switcher query, and any other text field. */
  inTextField: boolean;
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
 * PageUp / PageDown with no modifiers. Cmd/Ctrl-Home and Cmd/Ctrl-End
 * with no Shift or Alt. Bare Home/End stay with the browser. Repeat
 * is allowed so holding Page Down keeps moving.
 */
export function transcriptScrollAction(
  event: TranscriptScrollEvent,
): TranscriptScrollAction | null {
  if (event.altKey || event.shiftKey) return null;
  const command = !!event.metaKey;
  const control = !!event.ctrlKey;
  if (command && control) return null;
  if (event.key === "PageUp" || event.key === "PageDown") {
    if (command || control) return null;
    return event.key === "PageUp" ? "pageUp" : "pageDown";
  }
  if (event.key !== "Home" && event.key !== "End") return null;
  if (!(command || control)) return null;
  return event.key === "Home" ? "top" : "bottom";
}

/** Text fields, overlays, cards, and IME own these keys. */
export function transcriptScrollBlocked(gate: TranscriptScrollGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.inTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/** One viewport, clamped to the loaded transcript. */
export function nextTranscriptScrollTop(
  box: StickBox,
  action: TranscriptScrollAction,
): number {
  const max = Math.max(0, box.scrollHeight - box.clientHeight);
  const delta = Math.max(0, box.clientHeight);
  let next = box.scrollTop;
  if (action === "pageUp") next = box.scrollTop - delta;
  else if (action === "pageDown") next = box.scrollTop + delta;
  else if (action === "top") next = 0;
  else next = max;
  if (next < 0) return 0;
  if (next > max) return max;
  return next;
}

/**
 * Cmd/Ctrl-End always uses Jump to latest (re-arm, dismiss the chip).
 * A page that lands inside the stick slack re-arms through the same
 * near-bottom check a wheel scroll uses. It does not take composer focus.
 */
export function prefersJumpToLatest(action: TranscriptScrollAction): boolean {
  return action === "bottom";
}

export function pageLandsNearBottom(
  box: StickBox,
  action: TranscriptScrollAction,
  threshold = NEAR_BOTTOM_PX,
): boolean {
  const next = nextTranscriptScrollTop(box, action);
  return isNearBottom({ ...box, scrollTop: next }, threshold);
}

/**
 * Keyboard scroll assigns scrollTop. There is no smooth-scroll
 * animation for Reduce Motion to disable.
 */
export function transcriptScrollAnimates(reduceMotion: boolean): boolean {
  void reduceMotion;
  return false;
}

export type CommandedScroll = {
  box: StickBox;
  commandedTop: number | null;
  previousGeometryTop: number;
};

/**
 * iOS scroll geometry lags a programmatic offset. Hold the commanded
 * top so a repeated Page Down advances, and drop it once geometry
 * arrives or the user scrolls somewhere else.
 */
export function reconcileCommandedScroll(
  commandedTop: number | null,
  previousGeometryTop: number,
  geometry: StickBox,
): CommandedScroll {
  if (commandedTop == null) {
    return {
      box: geometry,
      commandedTop: null,
      previousGeometryTop: geometry.scrollTop,
    };
  }
  if (Math.abs(geometry.scrollTop - commandedTop) <= 1) {
    return {
      box: geometry,
      commandedTop: null,
      previousGeometryTop: geometry.scrollTop,
    };
  }
  const held = Math.abs(geometry.scrollTop - previousGeometryTop) <= 1;
  const approaching =
    Math.abs(geometry.scrollTop - commandedTop) <
    Math.abs(previousGeometryTop - commandedTop);
  if (held || approaching) {
    return {
      box: { ...geometry, scrollTop: commandedTop },
      commandedTop,
      previousGeometryTop: held ? previousGeometryTop : geometry.scrollTop,
    };
  }
  return {
    box: geometry,
    commandedTop: null,
    previousGeometryTop: geometry.scrollTop,
  };
}
