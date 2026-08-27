// SPDX-License-Identifier: Apache-2.0

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ERR_MAX = "Max 10MB.";
export const ERR_VIDEO = "Video isn’t supported yet.";

export type PendingAttachment = {
  id: string;
  kind: "image" | "file";
  name: string;
  url: string;
  size: number;
  previewUrl?: string;
};

export function attachmentClientError(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(name)) {
    return ERR_VIDEO;
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
): { id: string; kind: "image" | "file"; name: string; url: string; size: number }[] {
  const atts = message.attachments ?? [];
  if (atts.length) {
    return atts.map((row) => ({
      id: row.id,
      kind: row.kind === "image" ? "image" : "file",
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
