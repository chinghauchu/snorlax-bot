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

/** Jump chip only if the target channel is still in the roster. No fake seed. */
export function visibleJump(
  message: ChatMessage,
  roster: { id: string; kind?: string }[],
): HandoffRef | null {
  const jump = messageHandoff(message);
  if (!jump) return null;
  const row = roster.find((item) => item.id === jump.channelId);
  if (!row) return null;
  if (row.kind != null && row.kind !== "channel") return null;
  return jump;
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

export function jumpChannelName(
  channelId: string,
  roster: { id: string; name: string }[],
): string {
  return roster.find((row) => row.id === channelId)?.name || CHANNEL_DISPLAY_NAME;
}

/** Drop a leaked involve kicker so "from Mary:" is not message text. */
export function displayBody(content: string, speakerName?: string): string {
  const raw = content ?? "";
  const name = (speakerName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (name) {
    const named = new RegExp(`^from\\s+${name}:\\s*`, "i");
    if (named.test(raw)) return raw.replace(named, "");
  }
  return raw.replace(/^from\s+[^:\n]+:\s*/i, "");
}
