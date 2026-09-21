// SPDX-License-Identifier: Apache-2.0

/**
 * v0.50: Stop generating is a client abort of the in-flight stream.
 * Keep the partial LEFT text. No auto-restart. No new HTTP.
 */

/** Composer / a11y copy. Grok Bot feel. */
export const STOP_GENERATING_LABEL = "Stop generating";

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
