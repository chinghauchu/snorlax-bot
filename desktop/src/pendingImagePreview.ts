// SPDX-License-Identifier: Apache-2.0

/**
 * v2.10: preview a pending image before sending.
 * Clicking the pending image chip opens that local preview in the
 * existing v0.79 lightbox. Close, Esc, and a click outside dismiss
 * it the same way and leave the chip. Nothing is sent or removed.
 * The corner × still only removes. Videos stay the player. File
 * chips stay chips. Reduce Motion stays the lightbox fade.
 * No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/PendingImagePreview.swift`.
 */

import { lightboxLabel, type ImageLightboxTarget } from "./imageLightbox.ts";

export const PENDING_IMAGE_PREVIEW_ACTION = "Preview";

export type PendingImagePreviewRow = {
  id: string;
  kind: string;
  name: string;
  previewUrl?: string | null;
};

/** Only a pending image with a local preview URL opens the lightbox. */
export function pendingImageOpensPreview(kind: string): boolean {
  return kind === "image";
}

/**
 * Accessible name on the thumb. An empty name still says what the
 * control does. The lightbox title stays the file name, or Image.
 */
export function pendingImagePreviewAria(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `Preview ${trimmed}` : "Preview image";
}

/**
 * Lightbox target for one pending chip. Null for video, files, and
 * an image that has no preview URL yet. Closing this target does
 * not remove the chip and does not send.
 */
export function pendingImagePreviewTarget(
  row: PendingImagePreviewRow,
): ImageLightboxTarget | null {
  if (!pendingImageOpensPreview(row.kind)) return null;
  const url = (row.previewUrl ?? "").trim();
  if (!url) return null;
  if (!row.id) return null;
  return { id: row.id, url, name: lightboxLabel(row.name) };
}

/** The overlay dismisses. The chip stays, and nothing is sent. */
export function pendingImagePreviewKeepsChip(): boolean {
  return true;
}
