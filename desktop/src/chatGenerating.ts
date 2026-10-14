// SPDX-License-Identifier: Apache-2.0

/**
 * v0.93: sidebar generating indicator.
 * While an assistant reply the client started is in flight (Send, Retry,
 * Regenerate, or a widget / approve / connect continuation, until it
 * completes, is Stopped, or errors), that chat's row shows muted ···
 * in the v0.83 relative-time slot and a muted "Typing…" preview.
 * A non-open chat with a visible top-level draft keeps the v0.91
 * Draft: line; the dots still replace the time. Reduce Motion paints
 * static dots, the same rule as v0.58. The stored last-message preview
 * is not overwritten. When the reply settles, the indicator clears and
 * the v0.70 unread dot takes over on its own if that chat is not open.
 * No new HTTP. No new storage key.
 * Keep in lockstep with `ios/SnorlaxBot/ChatGenerating.swift`.
 */

import type { ChatRowPreview } from "./chatDraftPreview.ts";
import { WAITING_DOT, WAITING_LABEL, waitingDotsShouldPulse } from "./waiting.ts";

export const TYPING_HINT = "Typing…";
export const GENERATING_DOT = WAITING_DOT;
export const GENERATING_LABEL = WAITING_LABEL;

export type ChatListLine =
  | ChatRowPreview
  | {
      kind: "typing";
      text: string;
    };

/**
 * Pulse the sidebar ··· only when Reduce Motion is off.
 * When it is on, paint static muted ···.
 */
export function generatingDotsShouldPulse(reduceMotion: boolean): boolean {
  return waitingDotsShouldPulse(reduceMotion);
}

/**
 * The chat whose client-started stream is still in flight.
 * Idle, Stop, error, and a missing id clear it.
 */
export function activeGeneratingChat(input: {
  busy: boolean;
  chatId: string | null | undefined;
}): string | null {
  if (!input.busy) return null;
  const id = input.chatId ?? "";
  return id ? id : null;
}

/** ··· replace the relative time for the whole in-flight reply. */
export function showGeneratingDots(generating: boolean): boolean {
  return generating;
}

/**
 * Preview precedence:
 * 1. Non-open visible draft → Draft: (wins over Typing…)
 * 2. In-flight reply → muted Typing…
 * 3. Otherwise the last-message preview
 */
export function chatListLine(input: {
  preview: ChatRowPreview | null;
  generating: boolean;
  chatId: string;
}): ChatListLine | null {
  if (input.preview?.kind === "draft") return input.preview;
  if (input.generating && input.chatId) {
    return { kind: "typing", text: TYPING_HINT };
  }
  return input.preview;
}
