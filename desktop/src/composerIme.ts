// SPDX-License-Identifier: Apache-2.0
/** Composer Enter: IME confirm must not send. */

export type ComposerKeyEvent = {
  key?: string;
  keyCode?: number;
  which?: number;
  isComposing?: boolean;
  shiftKey?: boolean;
};

/** True while an IME (zhuyin/pinyin/…) is composing this key event. */
export function isImeComposing(event: ComposerKeyEvent): boolean {
  if (event.isComposing) return true;
  const code = event.keyCode ?? event.which;
  if (code === 229) return true;
  return event.key === "Process";
}

/**
 * Enter sends only when not composing and not Shift+Enter.
 * Composing Enter is left for the IME (do not preventDefault).
 */
export function composerEnterShouldSend(event: ComposerKeyEvent): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false;
  return !isImeComposing(event);
}
