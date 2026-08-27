// SPDX-License-Identifier: Apache-2.0

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const ERR_MAX = "Max 10MB.";
export const ERR_MAX_VIDEO = "Max 50MB.";

const VIDEO_NAME = /\.(mp4|mov|m4v|webm|avi|mkv)$/;

export type AttachmentKind = "image" | "file" | "video";

export type PendingAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  url: string;
  size: number;
  previewUrl?: string;
};

export function isVideoFile(file: { name?: string; type?: string }): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return mime.startsWith("video/") || VIDEO_NAME.test(name);
}

export function attachmentClientError(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) return ERR_MAX_VIDEO;
    return null;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return ERR_MAX;
  return null;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function userRightAttachments(
  message: {
    attachments?: { id: string; kind: string; name: string; url: string; size: number }[];
    images?: { id: string; mime: string; url: string }[];
  },
): { id: string; kind: AttachmentKind; name: string; url: string; size: number }[] {
  const atts = message.attachments ?? [];
  if (atts.length) {
    return atts.map((row) => ({
      id: row.id,
      kind:
        row.kind === "image"
          ? "image"
          : row.kind === "video"
            ? "video"
            : "file",
      name: row.name,
      url: row.url,
      size: row.size,
    }));
  }
  return (message.images ?? []).map((img) => ({
    id: img.id,
    kind: "image" as const,
    name: img.id,
    url: img.url,
    size: 0,
  }));
}

/** Clipboard bitmap with no filename: jpeg→image.jpg, gif→image.gif, webp→image.webp, else image.png. */
export function clipboardBitmapName(mime: string): string {
  const type = mime.toLowerCase().split(";")[0].trim();
  if (type === "image/jpeg" || type === "image/jpg") return "image.jpg";
  if (type === "image/gif") return "image.gif";
  if (type === "image/webp") return "image.webp";
  if (type.startsWith("image/")) return "image.png";
  if (type === "video/quicktime") return "video.mov";
  if (type === "video/webm") return "video.webm";
  if (type.startsWith("video/")) return "video.mp4";
  return "file";
}

export function pastedAttachmentName(file: { name?: string; type?: string }): string {
  const name = (file.name || "").trim();
  if (name) return name;
  return clipboardBitmapName(file.type || "");
}

export function withPastedName(file: File): File {
  const name = pastedAttachmentName(file);
  if (name === file.name) return file;
  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export type ClipboardItemLike = {
  kind: string;
  type: string;
  getAsFile?: () => File | null;
};

export type ClipboardDataLike = {
  items?: ArrayLike<ClipboardItemLike>;
  files?: ArrayLike<File>;
  getData?: (type: string) => string;
};

function uniqueFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

/** File items on the clipboard (screenshots, Finder copy). Text/html items are ignored. */
export function filesFromClipboard(data: ClipboardDataLike | null | undefined): File[] {
  if (!data) return [];
  const out: File[] = [];
  const items = data.items ? Array.from(data.items) : [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile?.() ?? null;
    if (file) out.push(withPastedName(file));
  }
  if (out.length) return uniqueFiles(out);
  const listed = data.files ? Array.from(data.files) : [];
  return uniqueFiles(listed.map(withPastedName));
}

/**
 * When files are present, skip file:// paths and a lone filename that
 * duplicates the chip so Finder copy does not dump a path into the field.
 * Real mixed paste (text + image) still inserts the text.
 */
export function clipboardInsertText(text: string, files: File[]): string {
  if (!files.length) return "";
  const raw = text ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^file:\/\//i.test(trimmed)) return "";
  if (
    files.length === 1 &&
    (trimmed === files[0].name || trimmed.endsWith(`/${files[0].name}`))
  ) {
    return "";
  }
  return raw;
}

export type ComposerPasteResult = {
  intercept: boolean;
  files: File[];
  text: string;
};

/** Intercept only when files/images/video are on the clipboard. Text-only is not intercepted. */
export function composerPasteFromClipboard(
  data: ClipboardDataLike | null | undefined,
): ComposerPasteResult {
  const files = filesFromClipboard(data);
  const raw = data?.getData?.("text/plain") ?? "";
  if (!files.length) {
    return { intercept: false, files: [], text: raw };
  }
  return { intercept: true, files, text: clipboardInsertText(raw, files) };
}
