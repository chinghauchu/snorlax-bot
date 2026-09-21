// SPDX-License-Identifier: Apache-2.0

/**
 * v0.50: Stop generating is a client abort of the in-flight stream.
 * Keep the partial LEFT text. No auto-restart. No new HTTP.
 */

/** 12px / 12pt muted chip at the bottom of the chat column. */
export const STOP_LABEL = "Stop";

/** Offer Stop while an assistant turn's stream/request is in flight. */
export function shouldOfferStop(busy: boolean): boolean {
  return Boolean(busy);
}

/** fetch / ReadableStream abort, and DOMException from AbortController.abort(). */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError";
}

/**
 * Do not GET-replace after Stop. The runtime persists the assistant row
 * on `message.done`; a mid-stream GET would wipe the local partial.
 */
export function shouldRefetchAfterStop(): boolean {
  return false;
}

/** Keep whatever already arrived (user-RIGHT + partial LEFT). */
export function keepPartialOnStop<T>(messages: T[]): T[] {
  return messages;
}

/** After Stop, `busy` clears — composer Send is usable again. */
export function composerUsableAfterStop(busy: boolean): boolean {
  return !busy;
}

export function shouldRestartAfterStop(): boolean {
  return false;
}

/**
 * v0.53: Esc aborts the in-flight stream the same as tapping Stop.
 * Do not steal Esc while IME is composing, or while a pending
 * widget / approve / connect card is up (those keep Esc/dismiss).
 */
export function escapeStopsGenerating(input: {
  busy: boolean;
  composing?: boolean;
  pendingWidget?: boolean;
  pendingApprove?: boolean;
  pendingConnect?: boolean;
}): boolean {
  if (!shouldOfferStop(input.busy)) return false;
  if (input.composing) return false;
  if (input.pendingWidget || input.pendingApprove || input.pendingConnect) {
    return false;
  }
  return true;
}

/**
 * v0.59: after Stop or Esc aborts an in-flight turn, return focus to
 * the composer immediately. Desktop always (default true). iOS passes
 * whether a hardware keyboard is attached — do not force the software keyboard up.
 */
export function shouldFocusComposerAfterAbort(
  hardwareKeyboardAttached = true,
): boolean {
  return Boolean(hardwareKeyboardAttached);
}

/** Natural complete / error / empty: leave focus alone (do not steal). */
export function shouldFocusComposerOnSettle(): boolean {
  return false;
}
