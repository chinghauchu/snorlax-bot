// SPDX-License-Identifier: Apache-2.0

/**
 * v1.13: copy the open chat's loaded transcript from the keyboard.
 * Cmd/Ctrl-Shift-E copies user and assistant kind=message bodies, in
 * order, as plain text. Bodies are separated by a blank line. Tool,
 * widget, approve, connect, and handoff rows are skipped (not written
 * as one-liners). A kind=message that is still streaming is included
 * when it already has text. Whitespace-only bodies are skipped. An
 * empty result copies nothing, so the clipboard stays put. Muted
 * Copied sits beside the chat name for 1.2s. No toast. The composer
 * does not own the chord and the letter is not inserted. A key repeat
 * is swallowed and does not copy again. IME composition keeps the key.
 * Find, the quick switcher, the shortcuts list, rename, the lightbox,
 * a modal or overlay text field, and a focused widget, approve, or
 * connect card keep the key. Nothing is copied when no chat is open.
 * No new HTTP. Keep in lockstep with `ios/SnorlaxBot/CopyTranscript.swift`.
 */

export const COPY_TRANSCRIPT_KEYS = "Cmd/Ctrl Shift E";
export const COPY_TRANSCRIPT_ACTION = "Copy the transcript";

export type CopyTranscriptEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type CopyTranscriptGate = {
  /** An open chat is on screen. The empty state does not copy. */
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

export type TranscriptCopyRow = {
  kind?: string | null;
  content?: string | null;
};

/**
 * Cmd-Shift-E or Ctrl-Shift-E, including a key repeat. Alt stays put.
 * Not plain E, and not Cmd/Ctrl-E without Shift. Both modifiers
 * together do not match. Repeat still matches so the handler can
 * swallow it: holding the chord must not insert e.
 */
export function isCopyTranscriptChord(event: CopyTranscriptEvent): boolean {
  if (event.altKey) return false;
  if (!event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.key === "e" || event.key === "E";
}

/**
 * The first press copies. A repeat of the held chord does not copy
 * again. The caller still swallows the repeat so e is not inserted.
 */
export function copyTranscriptShouldRun(event: { repeat?: boolean }): boolean {
  return !event.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsCopyTranscript(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * The empty state, overlays, and IME own the key. The composer does
 * not: Cmd/Ctrl-Shift-E there still copies the open transcript.
 */
export function copyTranscriptBlocked(gate: CopyTranscriptGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

/**
 * Loaded user and assistant kind=message bodies, in order, as plain
 * text. Missing kind counts as message. Each body is trimmed. A
 * whitespace-only body is skipped. Parts are separated by a blank
 * line. Tool, widget, approve, connect, and handoff rows are skipped.
 * Returns null when nothing useful remains, so the clipboard stays put.
 */
export function transcriptPlainText(
  messages: readonly TranscriptCopyRow[],
): string | null {
  const parts: string[] = [];
  for (const row of messages) {
    const kind = row.kind ?? "message";
    if (kind !== "message") continue;
    const body = (row.content ?? "").trim();
    if (!body) continue;
    parts.push(body);
  }
  if (parts.length === 0) return null;
  return parts.join("\n\n");
}
