// SPDX-License-Identifier: Apache-2.0

import { composerEnterSends, type ComposerKeyEvent } from "./composerKeys.ts";

/**
 * v0.55: Send is muted and disabled while an assistant turn is in flight
 * (from Send until complete / Stop / error / empty). Composer text stays
 * editable so the next message can be drafted. Enter does not send.
 * Stop / Esc unchanged. No new HTTP.
 */

/** Mute + disable Send while an assistant turn's stream/request is in flight. */
export function sendMutedWhileGenerating(busy: boolean): boolean {
  return Boolean(busy);
}

/**
 * Composer text stays editable while generating (draft the next message).
 * Takeover / missing creds still lock the field.
 */
export function composerEditableWhileGenerating(input: {
  fieldDisabled?: boolean;
  takeoverOpen?: boolean;
}): boolean {
  return !input.fieldDisabled && !input.takeoverOpen;
}

/** Enter does not send while generating. IME / Shift+Enter still skip. */
export function enterSends(event: ComposerKeyEvent, busy: boolean): boolean {
  if (sendMutedWhileGenerating(busy)) return false;
  return composerEnterSends(event);
}

/**
 * Send re-enables as soon as the in-flight turn is gone: complete, Stop,
 * error, or empty reply all clear `busy`.
 */
export function sendReenabled(busy: boolean): boolean {
  return !sendMutedWhileGenerating(busy);
}
