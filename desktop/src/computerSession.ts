// SPDX-License-Identifier: Apache-2.0

export const SANDBOX_WIDTH = 1280;
export const SANDBOX_HEIGHT = 800;
export const OPEN_LABEL = "Open";
export const DONE_LABEL = "Done";
export const DRIVING_LABEL = "You're driving · agent paused";
export const RECORD_LABEL = "Record";
export const STOP_LABEL = "Stop";
export const SAVE_AS_SKILL_TITLE = "Save as skill";
export const SAVE_LABEL = "Save";
export const SAVED_LABEL = "Saved";
export const CANCEL_LABEL = "Cancel";
export const TAKEOVER_BAR_PX = 52;
export const TAKEOVER_AVATAR_PX = 24;
export const DONE_BUTTON_PX = 36;
export const RECORD_LABEL_PX = 12;
export const RECORD_DOT_PX = 6;
export const SAVE_SHEET_PX = 320;
export const SAVE_BUTTON_PX = 36;
export const SKILL_NAME_PX = 14;
export const SAVED_FEEDBACK_MS = 1500;

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

export function escapeAction(
  recording: boolean,
  saveSheetOpen = false,
): "stop" | "done" | "discard" {
  if (saveSheetOpen) return "discard";
  return recording ? "stop" : "done";
}

export function doneDisabled(recording: boolean): boolean {
  return recording;
}

export function saveDisabled(name: string): boolean {
  return !(name || "").trim();
}

export function recordControlLabel(recording: boolean): string {
  return recording ? STOP_LABEL : RECORD_LABEL;
}
