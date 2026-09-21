// SPDX-License-Identifier: Apache-2.0

/**
 * v0.48: completed LEFT `kind=message` splits on blank lines into short
 * multi-bubbles. Mid-stream stays one growing bubble. Runtime still stores
 * a single content string.
 *
 * v0.54: consecutive LEFT bubbles from the same completed turn use a 6px
 * gap. Different turns, and after tool / widget / approve / connect, stay
 * 12px. User-right is unchanged (4px same-sender / 16px new-sender).
 */

/** v0.54: consecutive LEFT bubbles from the same completed turn. */
export const SAME_TURN_LEFT_GAP_PX = 6;

/** v0.54: between different turns, and after tool / widget / approve / connect. */
export const DIFFERENT_TURN_GAP_PX = 12;

/** User-right same-sender streak. Unchanged. */
export const USER_SAME_SENDER_GAP_PX = 4;

/** User-right / handoff speaker change. Unchanged. */
export const USER_NEW_SENDER_GAP_PX = 16;

export type TranscriptGapKind =
  | "same-turn-left"
  | "different-turn"
  | "after-tool"
  | "after-widget"
  | "after-approve"
  | "after-connect"
  | "mid-stream"
  | "user-same-sender"
  | "user-new-sender";

/** Vertical gap in px for transcript chrome. Mid-stream is one growing bubble. */
export function transcriptGapPx(kind: TranscriptGapKind): number {
  switch (kind) {
    case "same-turn-left":
      return SAME_TURN_LEFT_GAP_PX;
    case "mid-stream":
      return 0;
    case "user-same-sender":
      return USER_SAME_SENDER_GAP_PX;
    case "user-new-sender":
      return USER_NEW_SENDER_GAP_PX;
    case "different-turn":
    case "after-tool":
    case "after-widget":
    case "after-approve":
    case "after-connect":
      return DIFFERENT_TURN_GAP_PX;
  }
}

export function splitAssistantBubbles(
  text: string,
  completed = true,
): string[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n");
  if (!completed) return [src];

  const lines = src.split("\n");
  const parts: string[] = [];
  let chunk: string[] = [];
  let fence: string | null = null;
  let inMath = false;

  const flush = () => {
    while (chunk.length && chunk[0]!.trim() === "") chunk.shift();
    while (chunk.length && chunk[chunk.length - 1]!.trim() === "") chunk.pop();
    const joined = chunk.join("\n");
    if (joined.trim()) parts.push(joined);
    chunk = [];
  };

  for (const line of lines) {
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch && !inMath) {
      const marker = fenceMatch[2]!;
      const info = fenceMatch[3] ?? "";
      if (!fence) {
        fence = marker;
      } else if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        info.trim() === ""
      ) {
        fence = null;
      }
    } else if (!fence) {
      if (line.trim() === "$$") inMath = !inMath;
    }

    if (!fence && !inMath && line.trim() === "") {
      flush();
      continue;
    }
    chunk.push(line);
  }
  flush();
  return parts;
}

/** Fences and block math stretch to the column; short prose hugs the text. */
export function assistantBubbleWide(text: string): boolean {
  return /^( {0,3})(`{3,}|~{3,})/m.test(text) || /^\s*\$\$/m.test(text);
}
