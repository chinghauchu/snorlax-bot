// SPDX-License-Identifier: Apache-2.0
import type { ChatMessage } from "./types";

export const CHANNEL_DISPLAY_NAME = "Snorlax-Bot";

export type HandoffRef = { channelId: string; threadId: string };

export function messageHandoff(
  message: ChatMessage,
): HandoffRef | null {
  const raw = message.handoff;
  if (!raw || typeof raw !== "object") return null;
  const channelId = raw.channelId;
  const threadId = raw.threadId;
  if (!channelId || !threadId) return null;
  return { channelId, threadId };
}

export function isHandoffRoot(message: ChatMessage): boolean {
  return message.kind === "handoff";
}

export function repliesLabel(count: number): string {
  if (count === 1) return "1 reply";
  return `${count} replies`;
}

export function fromLabel(name: string): string {
  return `from ${name}`;
}
