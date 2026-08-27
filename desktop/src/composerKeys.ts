// SPDX-License-Identifier: Apache-2.0
/** Composer Enter: send unless IME is composing or Shift+Enter newline. */

export type ComposerKeyEvent = {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  which?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
  };
};

export function isComposerComposing(event: ComposerKeyEvent): boolean {
  if (event.isComposing) return true;
  if (event.nativeEvent?.isComposing) return true;
  const code =
    event.keyCode ??
    event.which ??
    event.nativeEvent?.keyCode ??
    event.nativeEvent?.which;
  return code === 229;
}

/** Enter sends after composition commits. Shift+Enter stays newline. */
export function composerEnterSends(event: ComposerKeyEvent): boolean {
  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  if (isComposerComposing(event)) return false;
  return true;
}

export function rosterRefreshTool(name: string): boolean {
  return name === "create_agent" || name === "create_channel";
}
