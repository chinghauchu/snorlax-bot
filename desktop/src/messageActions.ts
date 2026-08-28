// SPDX-License-Identifier: Apache-2.0
import { isUserSender } from "./mentions.ts";

export const MESSAGE_COPY_FEEDBACK_MS = 1500;

export function isLeftKindMessage(message: {
  kind?: string;
  role?: string;
  senderId?: string;
}): boolean {
  if (isUserSender(message.senderId, message.role)) return false;
  const kind = message.kind ?? "message";
  return kind === "message";
}

export function showAssistantCopy(opts: {
  message: {
    kind?: string;
    role?: string;
    senderId?: string;
  };
  completed: boolean;
}): boolean {
  return opts.completed && isLeftKindMessage(opts.message);
}

export function showAssistantRegenerate(opts: {
  message: {
    kind?: string;
    role?: string;
    senderId?: string;
  };
  completed: boolean;
  isLatest: boolean;
  isChannel: boolean;
  streaming: boolean;
}): boolean {
  return (
    showAssistantCopy({
      message: opts.message,
      completed: opts.completed,
    }) &&
    opts.isLatest &&
    !opts.isChannel &&
    !opts.streaming
  );
}

export function regeneratePostBody(): { regenerate: true } {
  return { regenerate: true };
}

export function dropLastAssistantTurn<
  T extends { senderId?: string; role?: string; kind?: string },
>(messages: T[]): T[] {
  let lastUser = -1;
  for (let i = 0; i < messages.length; i++) {
    const row = messages[i]!;
    const kind = row.kind ?? "message";
    if (isUserSender(row.senderId, row.role) && kind === "message") {
      lastUser = i;
    }
  }
  if (lastUser < 0) return messages;
  const keep = messages.slice(0, lastUser + 1);
  for (const row of messages.slice(lastUser + 1)) {
    const kind = row.kind ?? "message";
    if (kind === "tool") continue;
    if (kind === "message" && !isUserSender(row.senderId, row.role)) continue;
    keep.push(row);
  }
  return keep;
}

export function lastCompletedLeftMessageIndex(
  messages: { kind?: string; role?: string; senderId?: string }[],
  opts: { busy: boolean; liveAssistantIdx: number },
): number {
  let last = -1;
  for (let i = 0; i < messages.length; i++) {
    if (!isLeftKindMessage(messages[i]!)) continue;
    if (opts.busy && i === opts.liveAssistantIdx) continue;
    last = i;
  }
  return last;
}
