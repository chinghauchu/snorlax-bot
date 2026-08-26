// SPDX-License-Identifier: Apache-2.0

export const SANDBOX_WIDTH = 1280;
export const SANDBOX_HEIGHT = 800;
export const OPEN_LABEL = "Open";
export const DONE_LABEL = "Done";
export const DRIVING_LABEL = "You're driving · agent paused";
export const TAKEOVER_BAR_PX = 52;
export const TAKEOVER_AVATAR_PX = 24;
export const DONE_BUTTON_PX = 36;

export type PointerType = "move" | "down" | "up" | "click";
export type KeyType = "down" | "up" | "type";

export function canOpenComputer(hasSandbox: boolean | null | undefined): boolean {
  return Boolean(hasSandbox);
}

export function composerInert(takeoverOpen: boolean): boolean {
  return takeoverOpen;
}

export function letterboxRect(
  containerWidth: number,
  containerHeight: number,
  sourceWidth = SANDBOX_WIDTH,
  sourceHeight = SANDBOX_HEIGHT,
): { x: number; y: number; width: number; height: number; scale: number } {
  const scale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
    scale,
  };
}

export function mapPointerToSandbox(
  clientX: number,
  clientY: number,
  container: { left: number; top: number; width: number; height: number },
  sourceWidth = SANDBOX_WIDTH,
  sourceHeight = SANDBOX_HEIGHT,
): { x: number; y: number } | null {
  const box = letterboxRect(
    container.width,
    container.height,
    sourceWidth,
    sourceHeight,
  );
  const localX = clientX - container.left - box.x;
  const localY = clientY - container.top - box.y;
  if (localX < 0 || localY < 0 || localX > box.width || localY > box.height) {
    return null;
  }
  const x = Math.max(
    0,
    Math.min(sourceWidth - 1, Math.floor(localX / box.scale)),
  );
  const y = Math.max(
    0,
    Math.min(sourceHeight - 1, Math.floor(localY / box.scale)),
  );
  return { x, y };
}

export function keyEventPayload(
  event: { key: string; type: string },
): { key: string; type: KeyType } | null {
  const key = event.key;
  if (!key || key === "Escape") return null;
  const kind = event.type === "keyup" ? "up" : event.type === "keypress" ? "type" : "down";
  return { key, type: kind };
}
