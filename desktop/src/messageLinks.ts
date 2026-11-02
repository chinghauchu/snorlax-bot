// SPDX-License-Identifier: Apache-2.0

/**
 * v2.40: Copy links and Save as links.md on a completed assistant
 * reply that contains links.
 * The file lists each rendered link in order, one markdown link per
 * line: the visible label, then the URL that link would open. Copy
 * writes that same text. Desktop downloads links.md. iOS hands the
 * same bytes to the system share sheet and does not ask for
 * photo-library permission. The controls read Copied or Saved for
 * 1.5s. Desktop reveals them on hover or keyboard focus and keeps
 * them up while either label is confirming. iOS shows them in the
 * action row. Images are not links. Fences, inline code, indented
 * code, and math are not links. An unsafe scheme is not a link.
 * Per-link Copy link still copies one URL. Message Copy still copies
 * the whole reply. Message Save still writes reply.md. Hidden while
 * streaming and on user bubbles. Streaming text stays plain. No
 * animation. No new shortcut.
 * Keep in lockstep with `ios/SnorlaxBot/MessageLinks.swift`.
 */

import { encodeLinkDestination, linkHref, splitWebUrls } from "./linkify.ts";
import { safeLinkHref } from "./markdownAutolink.ts";
import {
  inlineLinkBlockedRanges,
  inlineLinkSpans,
} from "./markdownLinkTitle.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";

export const MESSAGE_LINKS_COPY_LABEL = "Copy links";

export const MESSAGE_LINKS_COPIED_LABEL = "Copied";

export const MESSAGE_LINKS_COPY_ARIA = "Copy links";

export const MESSAGE_LINKS_COPIED_ARIA = "Copied";

export const MESSAGE_LINKS_SAVE_LABEL = "Save as links.md";

export const MESSAGE_LINKS_SAVED_LABEL = "Saved";

export const MESSAGE_LINKS_SAVE_ARIA = "Save as links.md";

export const MESSAGE_LINKS_SAVED_ARIA = "Saved";

/** Same confirmation window as v2.39 task Copy and Save. */
export const MESSAGE_LINKS_MS = 1500;

export const MESSAGE_LINKS_FILENAME = "links.md";

export const MESSAGE_LINKS_MIME = "text/markdown;charset=utf-8";

export type MessageLink = {
  label: string;
  url: string;
};

/**
 * Shown only for a finished assistant reply that has at least one
 * rendered link. Streaming stays plain text, so the control is not
 * offered. A user bubble is not.
 */
export function showMessageLinks(opts: {
  completed: boolean;
  fromUser: boolean;
  kindMessage: boolean;
  markdown: string;
}): boolean {
  return (
    opts.completed &&
    !opts.fromUser &&
    opts.kindMessage &&
    messageLinks(opts.markdown).length > 0
  );
}

export function messageLinksCopyLabel(copied: boolean): "Copy links" | "Copied" {
  return copied ? MESSAGE_LINKS_COPIED_LABEL : MESSAGE_LINKS_COPY_LABEL;
}

export function messageLinksCopyAriaLabel(copied: boolean): string {
  return copied ? MESSAGE_LINKS_COPIED_ARIA : MESSAGE_LINKS_COPY_ARIA;
}

export function messageLinksSaveLabel(saved: boolean): "Save as links.md" | "Saved" {
  return saved ? MESSAGE_LINKS_SAVED_LABEL : MESSAGE_LINKS_SAVE_LABEL;
}

export function messageLinksSaveAriaLabel(saved: boolean): string {
  return saved ? MESSAGE_LINKS_SAVED_ARIA : MESSAGE_LINKS_SAVE_ARIA;
}

/** Saving does not remove the reply, send, or change Copy. */
export function messageLinksKeepsReply(): boolean {
  return true;
}

/**
 * Rendered links in document order. Reference links are resolved
 * first. Each entry is the visible label and the URL that link
 * opens. An empty label uses the URL. Whitespace in a label
 * collapses to one space.
 */
export function messageLinks(markdown: string): MessageLink[] {
  const src = normalize(resolveReferenceLinks(normalize(markdown), true));
  const spans = inlineLinkSpans(src);
  const items: Array<MessageLink & { start: number }> = [];
  for (const span of spans) {
    if (span.image) continue;
    const url = openedInlineHref(span.dest);
    if (!url) continue;
    const label = collapseLabel(span.label) || url;
    items.push({ start: span.start, label, url });
  }
  const masked = maskRanges(src, [
    ...spans.map((span) => ({ start: span.start, end: span.end })),
    ...inlineLinkBlockedRanges(src),
  ]);
  let offset = 0;
  for (const piece of splitWebUrls(masked, { emails: true, streaming: false })) {
    if (piece.type === "link" && piece.value.trim().length > 0) {
      const url = safeLinkHref(linkHref(piece.value));
      if (url) {
        items.push({
          start: offset,
          label: collapseLabel(piece.value) || url,
          url,
        });
      }
    }
    offset += piece.value.length;
  }
  items.sort((a, b) => a.start - b.start);
  return items.map(({ label, url }) => ({ label, url }));
}

/**
 * Clipboard text and file body. One markdown link per line, label
 * then URL. No extra trailing newline. Rendered HTML is not written.
 */
export function messageLinksBody(markdown: string): string {
  return messageLinks(markdown).map((link) => linkLine(link.label, link.url)).join("\n");
}

/** Label swap only. Never animate, including when Reduce Motion is off. */
export function messageLinksAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}

/** Hand links.md to the browser as a download. The reply stays up. */
export function downloadMessageLinks(markdown: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([messageLinksBody(markdown)], {
    type: MESSAGE_LINKS_MIME,
  });
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

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function collapseLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

function openedInlineHref(dest: string): string {
  const trimmed = dest.trim();
  if (!trimmed) return "";
  const href = /[\s\\<>]/.test(trimmed) ? encodeLinkDestination(trimmed) : trimmed;
  return safeLinkHref(href);
}

function linkLine(label: string, url: string): string {
  const safeLabel = label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  const dest = /[)\s<>]/.test(url) ? `<${url.replaceAll(">", "%3E")}>` : url;
  return `[${safeLabel}](${dest})`;
}

function maskRanges(text: string, ranges: Array<{ start: number; end: number }>): string {
  const merged: Array<{ start: number; end: number }> = [];
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  let out = "";
  let cursor = 0;
  for (const range of merged) {
    const start = Math.max(range.start, cursor);
    if (start > text.length) break;
    out += text.slice(cursor, start);
    const end = Math.min(range.end, text.length);
    if (end > start) out += " ".repeat(end - start);
    cursor = Math.max(cursor, end);
  }
  out += text.slice(cursor);
  return out;
}
