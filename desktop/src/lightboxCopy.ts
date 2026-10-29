// SPDX-License-Identifier: Apache-2.0

/**
 * v2.18: copy the image the lightbox is already showing.
 * A muted Copy control sits with Save and Close. Desktop writes
 * those bytes to the clipboard. iOS puts the same picture on the
 * pasteboard. The button reads Copied for 1.2s, then Copy again.
 * A failed read leaves the label as Copy. The overlay stays open.
 * Nothing is sent, and a pending chip is not removed. Stepping to
 * another image clears Copied. Videos and file chips never open
 * the lightbox, so they have no Copy. No new animation. No new
 * shortcut. No new HTTP route.
 * Keep in lockstep with `ios/SnorlaxBot/LightboxCopy.swift`.
 */

export const LIGHTBOX_COPY_LABEL = "Copy";
export const LIGHTBOX_COPY_COPIED_LABEL = "Copied";
export const LIGHTBOX_COPY_ARIA = "Copy image";
export const LIGHTBOX_COPY_COPIED_ARIA = "Copied";

/** Same confirmation as message Copy. The control then reverts. */
export const LIGHTBOX_COPY_MS = 1200;

const CLIPBOARD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

/** A URL, or bytes already in hand, is enough to offer Copy. Same as Save. */
export function lightboxCopyOffered(input: {
  url: string;
  hasBytes?: boolean;
}): boolean {
  if (input.hasBytes) return true;
  return input.url.trim().length > 0;
}

/** Copying does not dismiss the overlay and does not remove a chip. */
export function lightboxCopyKeepsOpen(): boolean {
  return true;
}

/** The label swap does not fade, including when Reduce Motion is off. */
export function lightboxCopyAnimates(_reduceMotion: boolean): boolean {
  return false;
}

export function lightboxCopyLabel(copied: boolean): "Copy" | "Copied" {
  return copied ? LIGHTBOX_COPY_COPIED_LABEL : LIGHTBOX_COPY_LABEL;
}

export function lightboxCopyAria(copied: boolean): string {
  return copied ? LIGHTBOX_COPY_COPIED_ARIA : LIGHTBOX_COPY_ARIA;
}

/**
 * Clipboard image type. A known image blob type wins. Otherwise the
 * sniffed PNG, JPEG, GIF, WebP, or BMP type is used. SVG and anything
 * unrecognized stay null so the label remains Copy.
 */
export function lightboxCopyMimeType(input: {
  blobType?: string | null;
  sniffed?: string | null;
}): string | null {
  const raw = (input.blobType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const normalized = raw === "image/jpg" ? "image/jpeg" : raw;
  if (normalized === "image/svg+xml") return null;
  if (CLIPBOARD_TYPES.has(normalized)) return normalized;
  switch ((input.sniffed ?? "").toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    default:
      return null;
  }
}

/** The blob's type matches the clipboard key. An empty body is not copied. */
export async function lightboxCopyBlob(
  blob: Blob,
  mime: string,
): Promise<Blob | null> {
  if (!mime || blob.size === 0) return null;
  if (blob.type === mime) return blob;
  return new Blob([await blob.arrayBuffer()], { type: mime });
}
