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
