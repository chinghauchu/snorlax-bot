// SPDX-License-Identifier: Apache-2.0

/**
 * v0.80: one muted truncated preview under each chat or agent name.
 * Latest user or assistant text already in memory. Prefer kind=message
 * (and handoff). Skip tool / widget / approve / connect chrome when it
 * has no useful text. Empty chats stay blank. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/LastMessagePreview.swift`.
 */

import { displayBody } from "./handoff.ts";

/** Roughly one sidebar line, then CSS ellipsizes further. */
export const PREVIEW_LIMIT = 120;

export type PreviewAttachment = {
  kind?: string | null;
  name?: string | null;
};

export type PreviewMessage = {
  kind?: string | null;
  content?: string | null;
  senderName?: string | null;
  userAsk?: string | null;
  replyTo?: string | null;
  agentId?: string | null;
  attachments?: readonly PreviewAttachment[] | null;
  images?: readonly unknown[] | null;
  widget?: { prompt?: string | null } | null;
  approve?: { command?: string | null } | null;
  connect?: { prompt?: string | null } | null;
};

const PREFERRED = new Set(["message", "handoff"]);

/** Collapse whitespace and cap to one line with an ellipsis. */
export function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= PREVIEW_LIMIT) return flat;
  return `${flat.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`;
}

export function isPreferredKind(kind: string | null | undefined): boolean {
  return !kind || PREFERRED.has(kind);
}

/** Main transcript only. A thread must not replace the channel row. */
export function snapshotChatPreview(
  threadId: string | null | undefined,
): boolean {
  return !threadId;
}

/** Another chat's rows must not be written onto this sidebar id. */
export function previewOwnsMessages(
  chatId: string,
  messages: readonly { agentId?: string | null }[],
): boolean {
  if (!chatId) return false;
  return messages.every((row) => !row.agentId || row.agentId === chatId);
}

function attachmentLabel(message: PreviewMessage): string | null {
  for (const att of message.attachments ?? []) {
    const name = (att.name ?? "").trim();
    if (name) return oneLine(name);
    if (att.kind === "image") return "Image";
    if (att.kind === "video") return "Video";
    if (att.kind === "file") return "File";
  }
  if ((message.images?.length ?? 0) > 0) return "Image";
  return null;
}

function preferredText(message: PreviewMessage): string | null {
  if (!isPreferredKind(message.kind)) return null;
  if (message.kind === "handoff") {
    const ask = oneLine(message.userAsk || "");
    if (ask) return ask;
    const body = oneLine(message.content || "");
    if (body) return body;
    return attachmentLabel(message);
  }
  const body = oneLine(
    displayBody(message.content ?? "", message.senderName ?? undefined),
  );
  if (body) return body;
  return attachmentLabel(message);
}

function chromeText(message: PreviewMessage): string | null {
  let raw = "";
  switch (message.kind) {
    case "tool":
      raw = message.content ?? "";
      break;
    case "widget":
      raw = message.widget?.prompt || message.content || "";
      break;
    case "approve":
      raw = message.approve?.command || message.content || "";
      break;
    case "connect":
      raw = message.connect?.prompt || message.content || "";
      break;
    default:
      return null;
  }
  const text = oneLine(raw);
  return text || null;
}

/**
 * Latest user-visible line. kind=message / handoff wins over later
 * tool, widget, approve, or connect chrome. Chrome is used only when
 * it has useful text and no preferred message does.
 */
export function lastMessagePreview(
  messages: readonly PreviewMessage[],
): string | null {
  let chrome: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const preferred = preferredText(message);
    if (preferred) return preferred;
    if (!chrome) {
      const extra = chromeText(message);
      if (extra) chrome = extra;
    }
  }
  return chrome;
}

/** Write the line for one chat. Empty transcript drops a stored line. */
export function rememberChatPreview(
  previews: Readonly<Record<string, string>>,
  chatId: string,
  messages: readonly PreviewMessage[],
): Record<string, string> {
  if (!chatId) return previews;
  const line = lastMessagePreview(messages);
  if (!line) {
    if (!Object.prototype.hasOwnProperty.call(previews, chatId)) return previews;
    const next = { ...previews };
    delete next[chatId];
    return next;
  }
  if (previews[chatId] === line) return previews;
  return { ...previews, [chatId]: line };
}

/**
 * A finished send or reply the client already has, including when that
 * chat is no longer the open one. Chrome does not replace a message line.
 */
export function applyFinishedPreview(
  previews: Readonly<Record<string, string>>,
  chatId: string,
  message: PreviewMessage,
): Record<string, string> {
  if (!chatId) return previews;
  const line = lastMessagePreview([message]);
  if (!line) return previews;
  if (!isPreferredKind(message.kind)) {
    if (previews[chatId]) return previews;
    return { ...previews, [chatId]: line };
  }
  if (previews[chatId] === line) return previews;
  return { ...previews, [chatId]: line };
}

/** Drop previews for chats that left the roster. */
export function retainChatPreviews(
  previews: Readonly<Record<string, string>>,
  ids: ReadonlySet<string>,
): Record<string, string> {
  let changed = false;
  const next: Record<string, string> = {};
  for (const [id, line] of Object.entries(previews)) {
    if (!ids.has(id)) {
      changed = true;
      continue;
    }
    next[id] = line;
  }
  return changed ? next : previews;
}
