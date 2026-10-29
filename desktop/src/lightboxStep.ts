// SPDX-License-Identifier: Apache-2.0

/**
 * v2.13: step between images the lightbox can already open.
 * Previous and Next walk the open chat in reading order: image
 * attachments, then markdown images in each completed assistant
 * bubble, then pending image chips. One picture hides the
 * controls. The ends disable the matching control. Arrow keys
 * step while the overlay is open and are not a shortcuts-list
 * chord. iOS swipe left and right steps at 1×. A zoomed picture
 * pans instead. Stepping resets to fit, does not close, send, or
 * remove a chip, and does not fade the overlay. Videos and file
 * chips stay out. No slide. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/LightboxStep.swift`.
 */

import { userRightAttachments } from "./attachments.ts";
import { displayBody } from "./handoff.ts";
import { lightboxLabel, type ImageLightboxTarget } from "./imageLightbox.ts";
import { lightboxPanEnabled } from "./lightboxZoom.ts";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import { extractFootnotes, type Footnote } from "./markdownFootnote.ts";
import { imageSourceKind, splitMarkdownImages } from "./markdownImage.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { isUserSender } from "./mentions.ts";
import { pendingImagePreviewTarget } from "./pendingImagePreview.ts";

export const LIGHTBOX_STEP_PREVIOUS = "Previous";
export const LIGHTBOX_STEP_NEXT = "Next";
export const LIGHTBOX_STEP_PREVIOUS_ARIA = "Previous image";
export const LIGHTBOX_STEP_NEXT_ARIA = "Next image";
export const LIGHTBOX_STEP_SWIPE = 80;

export type LightboxStepDirection = "previous" | "next";

export type LightboxStepControl =
  | "previous"
  | "next"
  | "zoomOut"
  | "zoomIn"
  | "copy"
  | "save"
  | "close";

export type LightboxStripMessage = {
  id: string;
  content?: string;
  senderName?: string;
  senderId?: string;
  role?: string;
  kind?: string;
  widget?: unknown;
  connect?: unknown;
  approve?: unknown;
  completed: boolean;
  attachments?: {
    id: string;
    kind: string;
    name: string;
    url: string;
    size?: number;
  }[];
  images?: { id: string; mime?: string; url: string }[];
};

export type LightboxStripPending = {
  id: string;
  kind: string;
  name: string;
  previewUrl?: string | null;
};

/**
 * Same rule as `resolveMediaUrl` in `api.ts`. Inlined so this module
 * does not load the runtime client (parameter properties) under
 * `node --experimental-strip-types`.
 */
export function lightboxMediaUrl(baseUrl: string, url: string): string {
  if (!url) return "";
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    /^https?:\/\//i.test(url)
  ) {
    return url;
  }
  const root = baseUrl.replace(/\/$/, "");
  return url.startsWith("/") ? `${root}${url}` : `${root}/${url}`;
}

/** Tool, widget, connect, approve, and a channel-timeline handoff have no image chrome. */
export function lightboxShowsChrome(
  message: {
    kind?: string;
    widget?: unknown;
    connect?: unknown;
    approve?: unknown;
  },
  channelTimeline: boolean,
): boolean {
  if (message.kind === "tool") return false;
  if (message.kind === "widget" || message.widget) return false;
  if (message.kind === "connect" || message.connect) return false;
  if (message.kind === "approve" || message.approve) return false;
  if (channelTimeline && message.kind === "handoff") return false;
  return true;
}

/**
 * The same bubble split the transcript paints. Footnotes come out
 * first so a definition in a later paragraph does not change the
 * bubbles, matching the assistant LEFT body.
 */
export function lightboxMessageBubbles(
  content: string,
  senderName: string | undefined,
  completed: boolean,
): { bubbles: string[]; notes: Footnote[] } {
  const replyBody = displayBody(content ?? "", senderName);
  const linked = resolveReferenceLinks(replyBody, completed);
  const footnoted = extractFootnotes(linked, completed);
  const bubbles = footnoted.notes.length
    ? splitAssistantBubbles(footnoted.text, completed)
    : splitAssistantBubbles(linked, completed);
  return { bubbles, notes: footnoted.notes };
}

/** Stable id for one markdown image. Occurrence restarts each bubble. */
export function markdownLightboxId(
  messageId: string,
  bubble: number,
  url: string,
  occurrence: number,
): string {
  return `md:${messageId}:${bubble}:${occurrence}:${url}`;
}

/** Next occurrence of this URL during one render of the bubble. */
export function nextMarkdownLightboxOccurrence(
  counts: Map<string, number>,
  url: string,
): number {
  const n = counts.get(url) ?? 0;
  counts.set(url, n + 1);
  return n;
}

function markdownStops(
  messageId: string,
  bubble: number,
  text: string,
  baseUrl: string,
): ImageLightboxTarget[] {
  const counts = new Map<string, number>();
  const out: ImageLightboxTarget[] = [];
  for (const piece of splitMarkdownImages(text, true)) {
    if (piece.type !== "image" || piece.link) continue;
    const occurrence = nextMarkdownLightboxOccurrence(counts, piece.url);
    const kind = imageSourceKind(piece.url);
    const url =
      kind === "attachment" && baseUrl
        ? lightboxMediaUrl(baseUrl, piece.url)
        : piece.url;
    out.push({
      id: markdownLightboxId(messageId, bubble, piece.url, occurrence),
      url,
      name: lightboxLabel(piece.alt),
    });
  }
  return out;
}

/**
 * Pictures the open chat can already show, top to bottom.
 * Pending chips sit under the transcript, so they are last.
 * A link whose whole label is an image stays a link. Videos and
 * files stay out. Streaming assistant text stays plain, so its
 * markdown images are not stops; attachments on that row still are.
 */
export function lightboxImageStrip(input: {
  messages: readonly LightboxStripMessage[];
  channelTimeline: boolean;
  baseUrl: string;
  pending: readonly LightboxStripPending[];
}): ImageLightboxTarget[] {
  const out: ImageLightboxTarget[] = [];
  for (const message of input.messages) {
    if (!message.id) continue;
    if (!lightboxShowsChrome(message, input.channelTimeline)) continue;
    const rows = userRightAttachments({
      attachments: (message.attachments ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        url: row.url,
        size: row.size ?? 0,
      })),
      images: (message.images ?? []).map((row) => ({
        id: row.id,
        mime: row.mime ?? "image/*",
        url: row.url,
      })),
    });
    for (const row of rows) {
      if (row.kind !== "image" || !row.id) continue;
      out.push({
        id: row.id,
        url: lightboxMediaUrl(input.baseUrl, row.url),
        name: row.name,
      });
    }
    if (isUserSender(message.senderId, message.role)) continue;
    if (!message.completed) continue;
    const prepared = lightboxMessageBubbles(
      message.content ?? "",
      message.senderName,
      true,
    );
    prepared.bubbles.forEach((bubble, index) => {
      out.push(...markdownStops(message.id, index, bubble, input.baseUrl));
    });
  }
  for (const row of input.pending) {
    const target = pendingImagePreviewTarget(row);
    if (target) out.push(target);
  }
  return out;
}

export function lightboxStepIndex(
  items: readonly { id: string }[],
  currentId: string,
): number {
  if (!currentId) return -1;
  return items.findIndex((item) => item.id === currentId);
}

/** Hidden for a single picture, and when this picture is not in the strip. */
export function lightboxStepPosition(index: number, count: number): string | null {
  if (count < 2 || index < 0 || index >= count) return null;
  return `${index + 1} of ${count}`;
}

export function lightboxCanStep(
  index: number,
  count: number,
  direction: LightboxStepDirection,
): boolean {
  if (lightboxStepPosition(index, count) == null) return false;
  return direction === "previous" ? index > 0 : index < count - 1;
}

export function lightboxStepTarget<T extends { id: string }>(
  items: readonly T[],
  currentId: string,
  direction: LightboxStepDirection,
): T | null {
  const index = lightboxStepIndex(items, currentId);
  if (!lightboxCanStep(index, items.length, direction)) return null;
  const next = direction === "previous" ? index - 1 : index + 1;
  return items[next] ?? null;
}

/**
 * Unmodified ArrowLeft / ArrowRight. Cmd, Ctrl, Alt, and Shift
 * stay with other chords. These keys are not listed in shortcuts.
 */
export function lightboxStepKey(input: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): LightboxStepDirection | null {
  if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return null;
  if (input.key === "ArrowLeft") return "previous";
  if (input.key === "ArrowRight") return "next";
  return null;
}

/**
 * Horizontal swipe at 1×. Finger moving left opens the next picture.
 * A vertical drag stays the dismiss gesture. Above 1× the drag pans.
 */
export function lightboxSwipeSteps(
  translation: { x: number; y: number },
  scale: number,
): LightboxStepDirection | null {
  if (lightboxPanEnabled(scale)) return null;
  const x = translation.x;
  const y = translation.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) <= LIGHTBOX_STEP_SWIPE) return null;
  if (Math.abs(x) <= Math.abs(y)) return null;
  return x < 0 ? "next" : "previous";
}

/** Stepping leaves the overlay up. Nothing is sent and no chip is removed. */
export function lightboxStepKeepsOpen(): boolean {
  return true;
}

/** The picture swaps. There is no slide, including when Reduce Motion is off. */
export function lightboxStepAnimates(): boolean {
  return false;
}

/**
 * Tab order while more than one picture is open. A control at an
 * end is left out. Close stays last, after the zoom order.
 */
export function lightboxStepFocusOrder(input: {
  zoomOrder: readonly ("zoomOut" | "zoomIn" | "copy" | "save" | "close")[];
  canPrevious: boolean;
  canNext: boolean;
}): LightboxStepControl[] {
  const order: LightboxStepControl[] = [];
  if (input.canPrevious) order.push("previous");
  if (input.canNext) order.push("next");
  order.push(...input.zoomOrder);
  return order;
}
