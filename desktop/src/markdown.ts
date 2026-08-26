// SPDX-License-Identifier: Apache-2.0

/** Close an unclosed fenced code block so streamed deltas do not swallow the rest. */
export function stabilizeMarkdown(src: string): string {
  const lines = src.split("\n");
  let fence: string | null = null;
  for (const line of lines) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const marker = match[2];
    const info = match[3] ?? "";
    if (!fence) {
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

/** Only https:// URLs are tappable. javascript:/data:/http: stay inert text. */
export function isSafeHttpsUrl(href: string | undefined | null): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function fenceLanguage(className?: string | null): string {
  const match = /(?:^|\s)language-([A-Za-z0-9_+-]+)/.exec(className || "");
  return match?.[1] ?? "";
}

const HTTPS = /https:\/\/[^\s<>"'`]+/g;

export type HttpsPiece = { type: "text"; value: string } | { type: "link"; value: string };

/** Autolink https:// in plain (non-markdown) text. Trailing punctuation stays text. */
export function splitHttpsUrls(text: string): HttpsPiece[] {
  const pieces: HttpsPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(HTTPS)) {
    const idx = match.index ?? 0;
    let url = match[0];
    while (url.length > 8 && ".,;:!?)".includes(url[url.length - 1]!)) {
      url = url.slice(0, -1);
    }
    if (idx > last) pieces.push({ type: "text", value: text.slice(last, idx) });
    if (isSafeHttpsUrl(url)) {
      pieces.push({ type: "link", value: url });
      last = idx + url.length;
    } else {
      pieces.push({ type: "text", value: match[0] });
      last = idx + match[0].length;
    }
  }
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  return pieces;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may be unavailable in tests or locked webviews.
  }
}
