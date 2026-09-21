// SPDX-License-Identifier: Apache-2.0

/**
 * v0.51: LEFT 12px muted pulsing ··· until the first assistant token.
 * Not a tool line. Not a bubble. Hide on first token, Stop, error, or
 * empty reply.
 */

export const WAITING_DOT = "·";
export const WAITING_LABEL = `${WAITING_DOT}${WAITING_DOT}${WAITING_DOT}`;

export function hasAssistantToken(message: {
  content?: string;
  attachments?: readonly unknown[] | null;
} | null | undefined): boolean {
  if (!message) return false;
  if ((message.content ?? "").length > 0) return true;
  return Boolean(message.attachments && message.attachments.length > 0);
}

/** Empty assistant kind=message: dismiss dots, do not paint a bubble. */
export function isEmptyAssistantReply(message: {
  role?: string;
  senderId?: string;
  kind?: string | null;
  content?: string;
  attachments?: readonly unknown[] | null;
}): boolean {
  if (message.role === "user" || message.senderId === "user") return false;
  if (message.kind && message.kind !== "message") return false;
  return !hasAssistantToken(message);
}

/**
 * Show pulsing ··· after Send until the first assistant token or a tool
 * line. Stop (busy clears), error, and empty reply dismiss it.
 */
export function showWaitingLine(input: {
  busy: boolean;
  hasFirstToken: boolean;
  hasLiveTool: boolean;
  hasError?: boolean;
}): boolean {
  return (
    Boolean(input.busy) &&
    !input.hasFirstToken &&
    !input.hasLiveTool &&
    !input.hasError
  );
}
