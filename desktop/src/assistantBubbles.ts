// SPDX-License-Identifier: Apache-2.0

import {
  contentColumns,
  containsIndentedCode,
  isAtxHeadingLine,
  isBlank,
  isThematicBreakLine,
} from "./markdownIndentedCode.ts";
import { markdownListEnd } from "./markdownList.ts";
import { containsMarkdownTable } from "./markdownTable.ts";

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
  // v1.48: a blank line inside an indented code block stays in that
  // bubble, the same way a blank inside a fence or $$ block does.
  // A blank outside one still splits. Paragraph continuations are
  // not code, so their following blank still splits.
  // v1.51: a blank line inside a list (between items, or between an
  // item's blocks) stays in that bubble so the list can render loose.
  // A blank that ends the list still splits.
  let inCode = false;
  let paragraph = false;
  let pendingBlanks: string[] = [];

  const flush = () => {
    while (chunk.length && chunk[0]!.trim() === "") chunk.shift();
    while (chunk.length && chunk[chunk.length - 1]!.trim() === "") chunk.pop();
    const joined = chunk.join("\n");
    if (joined.trim()) parts.push(joined);
    chunk = [];
    inCode = false;
    paragraph = false;
    pendingBlanks = [];
  };

  const pushText = (line: string) => {
    chunk.push(line);
    const columns = contentColumns(line);
    if (!paragraph && columns != null && columns >= 4) {
      inCode = true;
      return;
    }
    inCode = false;
    paragraph = !isAtxHeadingLine(line) && !isThematicBreakLine(line);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const wasFence = fence != null;
    const wasMath = inMath;
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
    const inFenceOrMath = wasFence || wasMath || fence != null || inMath;

    if (isBlank(line) && !inFenceOrMath) {
      if (inCode) pendingBlanks.push(line);
      else flush();
      continue;
    }

    if (inCode && pendingBlanks.length && !inFenceOrMath) {
      const columns = contentColumns(line);
      if (columns != null && columns >= 4) {
        chunk.push(...pendingBlanks);
        pendingBlanks = [];
      } else {
        pendingBlanks = [];
        flush();
      }
    } else if (pendingBlanks.length && inFenceOrMath) {
      pendingBlanks = [];
      flush();
    }

    if (inFenceOrMath) {
      inCode = false;
      paragraph = false;
      chunk.push(line);
      continue;
    }

    // A top-level list keeps the blank lines inside it.
    const listEnd = markdownListEnd(lines, index);
    if (listEnd != null && listEnd > index) {
      for (let j = index; j < listEnd; j += 1) chunk.push(lines[j] ?? "");
      inCode = false;
      paragraph = false;
      index = listEnd - 1;
      continue;
    }

    pushText(line);
  }
  flush();
  return parts;
}

/** Fences, block math, indented code, and completed tables stretch to the column. */
export function assistantBubbleWide(text: string, completed = true): boolean {
  if (/^( {0,3})(`{3,}|~{3,})/m.test(text) || /^\s*\$\$/m.test(text)) return true;
  if (completed && containsIndentedCode(text)) return true;
  if (!completed) return false;
  return containsMarkdownTable(text);
}
