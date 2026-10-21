// SPDX-License-Identifier: Apache-2.0

/** Close an unclosed fenced code block so streamed deltas do not swallow the rest. */
export function stabilizeMarkdown(src: string): string {
  const lines = src.split("\n");
  let fence: string | null = null;
  for (const line of lines) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const marker = match[2] ?? "";
    const info = match[3] ?? "";
    if (!fence) {
      // ``` `` ``` is a code span, not an opening fence.
      if (marker[0] === "`" && info.includes("`")) continue;
      fence = marker;
      continue;
    }
    const sameTick = marker[0] === fence[0];
    if (sameTick && marker.length >= fence.length && info.trim() === "") {
      fence = null;
    }
  }
  if (!fence) return src;
  const closer = fence;
  return src.endsWith("\n") ? `${src}${closer}` : `${src}\n${closer}`;
}

export { isSafeWebUrl, linkHref, splitWebUrls, type WebPiece } from "./linkify.ts";

export function fenceLanguage(className?: string | null): string {
  const match = /(?:^|\s)language-([A-Za-z0-9_+-]+)/.exec(className || "");
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
