// SPDX-License-Identifier: Apache-2.0

import { emptyDocumentFence, stepDocumentFence } from "./math.ts";

/**
 * Close an unclosed top-level fence so streamed deltas do not
 * swallow the rest. v1.98: a fence that is the text of a list
 * marker stays inside that item. Its closer, even in the first
 * three columns, is not a new fence, and no extra closer is
 * appended after the list.
 */
export function stabilizeMarkdown(src: string): string {
  const lines = src.split("\n");
  const state = emptyDocumentFence();
  for (const line of lines) stepDocumentFence(state, line);
  if (!state.top) return src;
  const closer = state.top;
  return src.endsWith("\n") ? `${src}${closer}` : `${src}\n${closer}`;
}

export { isSafeWebUrl, linkHref, splitWebUrls, type WebPiece } from "./linkify.ts";

export {
  dedentFenceLine,
  dedentFencedContent,
  openingFence,
} from "./markdownFenceIndent.ts";

export function fenceLanguage(className?: string | null): string {
  // v1.90: the info string is already decoded (`f&ouml;&ouml;` is
  // `föö`). The word may contain those characters. An over-long
  // numeric reference stays in the word. ASCII names are unchanged.
  const match = /(?:^|\s)language-(\S+)/.exec(className || "");
  return match?.[1] ?? "";
}

/** Language tag is exactly `mermaid` (case-insensitive). */
export function isMermaidLanguage(language: string | undefined | null): boolean {
  return (language ?? "").trim().toLowerCase() === "mermaid";
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may be unavailable in tests or locked webviews.
  }
}
