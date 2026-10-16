// SPDX-License-Identifier: Apache-2.0

/**
 * v1.24: adjustable transcript text size from the keyboard.
 * Cmd/Ctrl-= and Cmd/Ctrl-+ step the chat transcript text larger.
 * Cmd/Ctrl-- steps it smaller. Cmd/Ctrl-0 returns to 100%.
 * The steps are 85, 92, 100, 110, 120, and 130 percent. Message
 * bubble text, code blocks, and tool traces share that scale.
 * Padding, images, and the rest of the chrome stay put.
 * The choice persists in localStorage. The composer does not own
 * the chord and the character is not inserted. A key repeat is
 * swallowed and does not step again. Either end stays clamped.
 * IME composition keeps the key. Find, the quick switcher, the
 * shortcuts overlay, rename, the lightbox, a modal or overlay text
 * field, and a focused widget, approve, or connect card keep the
 * key. Shift is allowed on = / + and - because + is shifted =.
 * Cmd/Ctrl-0 does not take Shift, so Cmd/Ctrl-1..9 still jump.
 * No HTTP. Keep in lockstep with `ios/SnorlaxBot/TranscriptTextScale.swift`.
 */

export const TRANSCRIPT_TEXT_STORAGE_KEY = "snorlax.transcriptTextScale";

/** Inclusive percent steps. 100 is the authored size. */
export const TRANSCRIPT_TEXT_STEPS = [85, 92, 100, 110, 120, 130] as const;

export const TRANSCRIPT_TEXT_DEFAULT = 100;

export const TRANSCRIPT_TEXT_KEYS = "Cmd/Ctrl = / + / - / 0";
export const TRANSCRIPT_TEXT_ACTION = "Larger, smaller, or default text";

export type TranscriptTextPercent = (typeof TRANSCRIPT_TEXT_STEPS)[number];

export type TranscriptTextStep = "larger" | "smaller" | "reset";

export type TranscriptTextEvent = {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type TranscriptTextGate = {
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

export type TranscriptTextStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isTranscriptTextPercent(value: number): value is TranscriptTextPercent {
  return (TRANSCRIPT_TEXT_STEPS as readonly number[]).includes(value);
}

/** Missing, corrupt, or off-step values stay at 100%. */
export function parseTranscriptTextPercent(raw: string | null | undefined): TranscriptTextPercent {
  if (raw == null) return TRANSCRIPT_TEXT_DEFAULT;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return TRANSCRIPT_TEXT_DEFAULT;
  const value = Number(trimmed);
  return isTranscriptTextPercent(value) ? value : TRANSCRIPT_TEXT_DEFAULT;
}

export function serializeTranscriptTextPercent(percent: number): string {
  return String(parseTranscriptTextPercent(String(percent)));
}

/** Unitless multiplier for the transcript CSS variable. 100% is 1. */
export function transcriptScaleFactor(percent: number): number {
  return parseTranscriptTextPercent(String(percent)) / 100;
}

/**
 * One step larger or smaller, or back to 100%. An unknown current
 * percent snaps to 100% first. The ends do not wrap.
 */
export function applyTranscriptTextStep(
  percent: number,
  step: TranscriptTextStep,
): TranscriptTextPercent {
  const current = isTranscriptTextPercent(percent) ? percent : TRANSCRIPT_TEXT_DEFAULT;
  if (step === "reset") return TRANSCRIPT_TEXT_DEFAULT;
  const index = TRANSCRIPT_TEXT_STEPS.indexOf(current);
  if (step === "larger") {
    return TRANSCRIPT_TEXT_STEPS[Math.min(index + 1, TRANSCRIPT_TEXT_STEPS.length - 1)];
  }
  return TRANSCRIPT_TEXT_STEPS[Math.max(index - 1, 0)];
}

export function browserTranscriptTextStorage(): TranscriptTextStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readTranscriptTextScale(
  storage: TranscriptTextStorage | null,
): TranscriptTextPercent {
  if (!storage) return TRANSCRIPT_TEXT_DEFAULT;
  try {
    return parseTranscriptTextPercent(storage.getItem(TRANSCRIPT_TEXT_STORAGE_KEY));
  } catch {
    return TRANSCRIPT_TEXT_DEFAULT;
  }
}

export function writeTranscriptTextScale(
  storage: TranscriptTextStorage | null,
  percent: number,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      TRANSCRIPT_TEXT_STORAGE_KEY,
      serializeTranscriptTextPercent(percent),
    );
  } catch {
    // Storage can throw in private mode. The in-memory choice still applies.
  }
}

/**
 * Cmd-= / Ctrl-= and Cmd-+ / Ctrl-+ grow. Cmd-- / Ctrl-- shrinks.
 * Cmd-0 / Ctrl-0 resets. Not both modifiers, and not with Alt.
 * Shift is part of + on a US keyboard, so it still grows. Shift-0
 * is not reset. A key repeat still matches so the handler can
 * swallow it: holding the chord must not insert the character and
 * must not step again.
 */
export function transcriptTextStep(event: TranscriptTextEvent): TranscriptTextStep | null {
  if (event.altKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;
  if (event.metaKey && event.ctrlKey) return null;
  const key = event.key;
  const code = event.code ?? "";
  if (
    key === "=" ||
    key === "+" ||
    code === "Equal" ||
    code === "NumpadAdd"
  ) {
    return "larger";
  }
  if (
    key === "-" ||
    key === "_" ||
    code === "Minus" ||
    code === "NumpadSubtract"
  ) {
    return "smaller";
  }
  if (event.shiftKey) return null;
  if (key === "0" || code === "Digit0" || code === "Numpad0") return "reset";
  return null;
}

/** The first press steps. A repeat of the held chord does not. */
export function transcriptTextShouldApply(input: { repeat?: boolean }): boolean {
  return !input.repeat;
}

/**
 * The composer is a text field and still does not own this chord.
 * Any other text field does.
 */
export function overlayTextFieldOwnsTranscriptText(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

/**
 * Overlays and IME own the key. The composer does not. No open chat
 * is required: the preference is the transcript's, and an empty
 * chat still shows it.
 */
export function transcriptTextBlocked(gate: TranscriptTextGate): boolean {
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}
