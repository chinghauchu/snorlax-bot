// SPDX-License-Identifier: Apache-2.0

/**
 * v2.11: save the image the lightbox is already showing.
 * A muted Save control sits beside Close. Desktop downloads those
 * bytes. iOS hands the same bytes to the system share sheet and does
 * not ask for photo-library permission. The overlay stays open.
 * Nothing is sent, and a pending chip is not removed. Videos and file
 * chips never open the lightbox, so they have no Save.
 * No new animation. No new shortcut. No new HTTP route.
 * Keep in lockstep with `ios/SnorlaxBot/LightboxSave.swift`.
 */

export const LIGHTBOX_SAVE_LABEL = "Save";
export const LIGHTBOX_SAVE_ARIA = "Save image";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
  "avif",
  "svg",
]);

const RESERVED = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);

export type LightboxControl = "save" | "close";

/** A URL, or bytes already in hand, is enough to offer Save. */
export function lightboxSaveOffered(input: {
  url: string;
  hasBytes?: boolean;
}): boolean {
  if (input.hasBytes) return true;
  return input.url.trim().length > 0;
}

/** Saving does not dismiss the overlay and does not remove a chip. */
export function lightboxSaveKeepsOpen(): boolean {
  return true;
}

/** The label does not fade, including when Reduce Motion is off. */
export function lightboxSaveAnimates(_reduceMotion: boolean): boolean {
  return false;
}

/**
 * Tab order while the overlay is up. Save is first when it is offered.
 * Close stays last, and it stays the only control otherwise.
 */
export function lightboxFocusOrder(saveOffered: boolean): LightboxControl[] {
  return saveOffered ? ["save", "close"] : ["close"];
}

/**
 * Wrap around the offered controls. A missing focus starts at the end.
 * The order can be Save/Close or the v2.12 zoom order.
 */
export function nextLightboxFocus<T extends string>(
  order: readonly T[],
  current: T | null,
  backward: boolean,
): T {
  const last = order[order.length - 1];
  if (last === undefined) return "close" as T;
  const index = current == null ? -1 : order.indexOf(current);
  if (backward) {
    if (index <= 0) return last;
    return order[index - 1] ?? last;
  }
  if (index < 0 || index >= order.length - 1) {
    return order[(index + 1) % order.length] ?? last;
  }
  return order[index + 1] ?? last;
}

/**
 * File name for the download or the share sheet.
 * A name that already ends in an image extension wins, so Save keeps
 * `shot.PNG`. Otherwise the extension comes from the sniffed bytes,
 * then the URL, then a data URL, then png. An empty name becomes Image.
 */
export function lightboxSaveFilename(
  name: string,
  url: string,
  sniffed?: string | null,
): string {
  const cleaned = sanitizeLightboxFilename(name);
  if (imageExtension(cleaned)) return cleaned;
  const ext =
    knownExtension(sniffed) ??
    imageExtension(urlBasename(url)) ??
    dataUrlImageExtension(url) ??
    "png";
  const stem = cleaned.length > 0 ? cleaned : "Image";
  return `${stem}.${ext}`;
}

/** First bytes of a PNG, JPEG, GIF, WebP, or BMP. Anything else is null. */
export function sniffImageExtension(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "bmp";
  }
  return null;
}

/**
 * Bytes the lightbox can already show. Blob and data URLs are local.
 * Anything else uses the caller's existing attachment fetch. An empty
 * body is not a file. This does not add a route.
 */
export async function readLightboxImageBlob(
  url: string,
  readAuthed: ((url: string) => Promise<Blob>) | null,
): Promise<Blob | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    const response = await fetch(trimmed);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  }
  if (!readAuthed) return null;
  const blob = await readAuthed(trimmed);
  return blob.size > 0 ? blob : null;
}

/** Hand the bytes to the browser as a download. The overlay stays up. */
export function downloadLightboxBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function sanitizeLightboxFilename(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/[/\\]/).filter((part) => part.length > 0);
  const segment = parts.length > 0 ? (parts[parts.length - 1] ?? "") : "";
  let out = "";
  for (const ch of segment) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (RESERVED.has(ch)) continue;
    out += ch;
  }
  let result = out.trim();
  while (result.startsWith(".")) result = result.slice(1);
  while (result.endsWith(".") || result.endsWith(" ")) {
    result = result.slice(0, -1);
  }
  return result.trim();
}

function urlBasename(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return "";
  const noHash = trimmed.split("#")[0] ?? "";
  const noQuery = noHash.split("?")[0] ?? "";
  const parts = noQuery.split(/[/\\]/).filter((part) => part.length > 0);
  return parts.length > 0 ? (parts[parts.length - 1] ?? "") : "";
}

function imageExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return null;
  return knownExtension(filename.slice(dot + 1));
}

function knownExtension(ext: string | null | undefined): string | null {
  if (!ext) return null;
  const lower = ext.trim().toLowerCase().replace(/^\./, "");
  return IMAGE_EXTENSIONS.has(lower) ? lower : null;
}

function dataUrlImageExtension(url: string): string | null {
  const match = /^data:image\/([a-z0-9.+-]+)/i.exec(url.trim());
  if (!match) return null;
  const subtype = (match[1] ?? "").toLowerCase();
  if (subtype === "svg+xml") return "svg";
  if (subtype === "jpeg") return "jpg";
  return knownExtension(subtype);
}
