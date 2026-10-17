// SPDX-License-Identifier: Apache-2.0

/**
 * v1.27: a sent quote jumps back to the message it replies to.
 * Quoting a transcript selection remembers that message with the
 * draft. Send keeps the link on the user message, locally, for each
 * quote block that is still in the text. The quote is a thin control
 * that scrolls to the source. Cmd/Ctrl-' jumps to the source of the
 * quote nearest the reading line. The composer may keep its text.
 * The apostrophe is not inserted. A key repeat does not jump again.
 * IME and overlays keep the key. Stick-to-bottom, the Jump chip,
 * per-chat reading place, the sticky day header, collapsed long
 * messages, muted chats, and the New messages divider stay.
 * Reduce Motion adds no animation. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/QuoteJump.swift`.
 */

import { quoteableText } from "./quoteSelection.ts";
import { chatDraftKey } from "./chatDrafts.ts";
import {
  USER_JUMP_EPSILON,
  userJumpHighlightAnimates,
  userJumpScrollTop,
  type UserJumpRow,
  type UserJumpView,
} from "./userMessageJump.ts";

export const QUOTE_JUMP_KEY = "snorlax.quoteJumps";
export const QUOTE_JUMP_KEYS = "Cmd/Ctrl '";
export const QUOTE_JUMP_ACTION = "Jump to the quoted message";

export type QuoteJumpStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type QuoteLink = {
  /** Quoted body, without `>` markers. */
  text: string;
  sourceId: string;
};

export type QuoteJumpPart =
  | { kind: "quote"; text: string; sourceId: string }
  | { kind: "text"; text: string };

type QuoteJumpBlob = {
  pending: Record<string, QuoteLink[]>;
  sent: Record<string, QuoteLink[]>;
};

export type QuoteJumpEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export type QuoteJumpGate = {
  chatOpen: boolean;
  composing: boolean;
  /** A text field other than the composer. The composer may keep its text. */
  overlayTextField: boolean;
  inCard: boolean;
  findOpen: boolean;
  switchOpen: boolean;
  shortcutsOpen: boolean;
  renaming: boolean;
  lightboxOpen: boolean;
  menuOpen: boolean;
  blocked: boolean;
};

export function browserQuoteJumpStorage(): QuoteJumpStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Cmd/Ctrl-'. Shift and Alt stay put. A repeat still matches so it can be swallowed. */
export function isQuoteJumpChord(event: QuoteJumpEvent): boolean {
  if (event.altKey || event.shiftKey) return false;
  const command = !!event.metaKey;
  const control = !!event.ctrlKey;
  if (command === control) return false;
  return event.key === "'" || event.key === "Quote";
}

export function quoteJumpShouldMove(input: { repeat?: boolean }): boolean {
  return !input.repeat;
}

/** The composer may take this chord, text or not. Any other text field does. */
export function overlayTextFieldOwnsQuoteJump(
  inTextField: boolean,
  inComposer: boolean,
): boolean {
  return inTextField && !inComposer;
}

export function quoteJumpBlocked(gate: QuoteJumpGate): boolean {
  if (!gate.chatOpen) return true;
  if (gate.composing || gate.overlayTextField || gate.inCard) return true;
  if (gate.findOpen || gate.switchOpen || gate.shortcutsOpen) return true;
  if (gate.renaming || gate.lightboxOpen || gate.menuOpen || gate.blocked) {
    return true;
  }
  return false;
}

export function quoteJumpHighlightAnimates(reduceMotion: boolean): boolean {
  return userJumpHighlightAnimates(reduceMotion);
}

/** Row marker for a user message that has a loaded quote. */
export function quoteJumpRowSelector(): string {
  return "[data-quote-jump]";
}

/** Bubble marker for the message a quote jumps to. `id` is already escaped. */
export function quoteJumpTargetSelector(escapedId: string): string {
  return `[data-quote-jump-target="${escapedId}"]`;
}

/** Target and outline markers for one transcript bubble. */
export function quoteJumpBubbleProps(
  messageId: string,
  highlightId: string | null,
): { "data-quote-jump-target": string; "data-quote-jump-highlight"?: "true" } {
  return highlightId === messageId
    ? { "data-quote-jump-target": messageId, "data-quote-jump-highlight": "true" }
    : { "data-quote-jump-target": messageId };
}

function cleanLink(value: unknown): QuoteLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = (value as { text?: unknown }).text;
  const sourceId = (value as { sourceId?: unknown }).sourceId;
  if (typeof text !== "string" || typeof sourceId !== "string") return null;
  const body = text.trim();
  if (!body || !sourceId) return null;
  return { text: body, sourceId };
}

function cleanLinks(value: unknown): QuoteLink[] {
  if (!Array.isArray(value)) return [];
  const links: QuoteLink[] = [];
  for (const item of value) {
    const link = cleanLink(item);
    if (!link) continue;
    const without = links.filter((row) => row.text !== link.text);
    without.push(link);
    links.length = 0;
    links.push(...without);
  }
  return links;
}

function cleanMap(value: unknown): Record<string, QuoteLink[]> {
  const out: Record<string, QuoteLink[]> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    if (!key) continue;
    const links = cleanLinks(raw);
    if (links.length === 0) continue;
    out[key] = links;
  }
  return out;
}

export function parseQuoteJumps(raw: string | null): QuoteJumpBlob {
  if (!raw) return { pending: {}, sent: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { pending: {}, sent: {} };
    }
    const blob = parsed as { pending?: unknown; sent?: unknown };
    return { pending: cleanMap(blob.pending), sent: cleanMap(blob.sent) };
  } catch {
    return { pending: {}, sent: {} };
  }
}

export function serializeQuoteJumps(blob: QuoteJumpBlob): string {
  return JSON.stringify({ pending: blob.pending, sent: blob.sent });
}

export function sentQuoteKey(
  agentId: string,
  threadId: string | null,
  content: string,
): string {
  return `${chatDraftKey(agentId, threadId)}\u0001${content}`;
}

/**
 * Contiguous `>` / `> text` lines. A blank line that is not `>` ends
 * the block. The body matches `quoteableText` for a Quote insert.
 */
export function quoteBlocks(content: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.join("\n").trim();
    if (text.length > 0) blocks.push(text);
    current = null;
  };
  for (const line of lines) {
    if (line === ">" || line.startsWith("> ")) {
      const body = line === ">" ? "" : line.slice(2);
      current = current ?? [];
      current.push(body);
      continue;
    }
    flush();
  }
  flush();
  return blocks;
}

export function addQuoteLink(
  links: readonly QuoteLink[],
  text: string,
  sourceId: string,
): QuoteLink[] {
  const body = quoteableText(text);
  if (!body || !sourceId) return [...links];
  const next = links.filter((link) => link.text !== body);
  next.push({ text: body, sourceId });
  return next;
}

export function linksStillInContent(
  content: string,
  links: readonly QuoteLink[],
): QuoteLink[] {
  const blocks = new Set(quoteBlocks(content));
  return links.filter((link) => blocks.has(link.text) && link.sourceId.length > 0);
}

export function quoteJumpTargets(
  content: string,
  links: readonly QuoteLink[],
  loaded: ReadonlySet<string>,
): QuoteLink[] {
  const byText = new Map<string, string>();
  for (const link of links) {
    if (!loaded.has(link.sourceId)) continue;
    byText.set(link.text, link.sourceId);
  }
  const targets: QuoteLink[] = [];
  for (const block of quoteBlocks(content)) {
    const sourceId = byText.get(block);
    if (!sourceId) continue;
    targets.push({ text: block, sourceId });
  }
  return targets;
}

/** The latest quote in that message. The keyboard uses this source. */
export function primaryQuoteSource(targets: readonly QuoteLink[]): string | null {
  if (targets.length === 0) return null;
  return targets[targets.length - 1]?.sourceId ?? null;
}

/**
 * Quote blocks that have a loaded source become controls. The other
 * lines, including an unmatched `>` block, stay ordinary text.
 */
export function quoteJumpParts(
  content: string,
  targets: readonly QuoteLink[],
): QuoteJumpPart[] {
  if (targets.length === 0) return [{ kind: "text", text: content }];
  const byText = new Map(targets.map((target) => [target.text, target.sourceId]));
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parts: QuoteJumpPart[] = [];
  let textLines: string[] = [];
  let quoteLines: string[] | null = null;

  const flushText = () => {
    if (textLines.length === 0) return;
    parts.push({ kind: "text", text: textLines.join("\n") });
    textLines = [];
  };
  const flushQuote = () => {
    if (!quoteLines) return;
    const body = quoteLines.join("\n").trim();
    const sourceId = byText.get(body);
    if (sourceId) {
      flushText();
      parts.push({ kind: "quote", text: body, sourceId });
    } else {
      for (const line of quoteLines) {
        textLines.push(line.length === 0 ? ">" : `> ${line}`);
      }
    }
    quoteLines = null;
  };

  for (const line of lines) {
    if (line === ">" || line.startsWith("> ")) {
      quoteLines = quoteLines ?? [];
      quoteLines.push(line === ">" ? "" : line.slice(2));
      continue;
    }
    flushQuote();
    textLines.push(line);
  }
  flushQuote();
  flushText();
  return parts.length > 0 ? parts : [{ kind: "text", text: content }];
}

function rowSettled(row: UserJumpRow, view: UserJumpView): boolean {
  if (row.top == null) return false;
  const epsilon = view.epsilon ?? USER_JUMP_EPSILON;
  if (row.top <= view.viewAnchor + epsilon) return true;
  const commanded = userJumpScrollTop(row.top, view.stickyInset, view.maxScroll);
  return (
    commanded >= view.maxScroll - epsilon && view.scrollTop + epsilon >= commanded
  );
}

/**
 * The quote row under the reading line, or the closest one above it.
 * When every quote is below, the first one. Unmeasured rows still
 * count once a later row shows which side of the line they are on.
 */
export function pickQuoteJumpMessageId(
  rows: readonly UserJumpRow[],
  view: UserJumpView,
): string | null {
  const list = rows.filter((row) => row.id.length > 0);
  if (list.length === 0) return null;
  let lastSettled: string | null = null;
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index];
    if (!row) continue;
    if (row.top == null) {
      let later = -1;
      for (let cursor = index + 1; cursor < list.length; cursor += 1) {
        if (list[cursor]?.top != null) {
          later = cursor;
          break;
        }
      }
      if (later < 0) return lastSettled ?? row.id;
      const laterRow = list[later];
      if (laterRow && rowSettled(laterRow, view)) {
        lastSettled = row.id;
        continue;
      }
      return lastSettled ?? row.id;
    }
    if (rowSettled(row, view)) {
      lastSettled = row.id;
      continue;
    }
    return lastSettled ?? row.id;
  }
  return lastSettled;
}

export class QuoteJumps {
  private pending: Record<string, QuoteLink[]>;
  private sent: Record<string, QuoteLink[]>;
  private readonly storage: QuoteJumpStorage | null;
  private readonly storageKey: string;

  constructor(
    storage: QuoteJumpStorage | null = null,
    storageKey = QUOTE_JUMP_KEY,
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
    const blob = storage
      ? parseQuoteJumps(readRaw(storage, storageKey))
      : { pending: {}, sent: {} };
    this.pending = blob.pending;
    this.sent = blob.sent;
  }

  private persist(): void {
    const storage = this.storage;
    if (!storage) return;
    try {
      storage.setItem(
        this.storageKey,
        serializeQuoteJumps({ pending: this.pending, sent: this.sent }),
      );
    } catch {
      /* quota or private mode: keep the in-memory copy */
    }
  }

  note(
    agentId: string,
    threadId: string | null,
    text: string,
    sourceId: string,
  ): void {
    const key = chatDraftKey(agentId, threadId);
    const next = addQuoteLink(this.pending[key] ?? [], text, sourceId);
    if (next.length === 0) return;
    this.pending[key] = next;
    this.persist();
  }

  clearPending(agentId: string, threadId: string | null): void {
    const key = chatDraftKey(agentId, threadId);
    if (!this.pending[key]) return;
    delete this.pending[key];
    this.persist();
  }

  /**
   * Send keeps links whose quote text is still in the message, then
   * drops the draft's pending list. A retry of the same text leaves
   * the sent links alone when nothing is pending.
   */
  commit(agentId: string, threadId: string | null, content: string): void {
    const chatKey = chatDraftKey(agentId, threadId);
    const kept = linksStillInContent(content, this.pending[chatKey] ?? []);
    let changed = false;
    if (kept.length > 0) {
      this.sent[sentQuoteKey(agentId, threadId, content)] = kept;
      changed = true;
    }
    if (this.pending[chatKey]) {
      delete this.pending[chatKey];
      changed = true;
    }
    if (changed) this.persist();
  }

  targets(
    agentId: string,
    threadId: string | null,
    content: string,
    loaded: ReadonlySet<string>,
  ): QuoteLink[] {
    const links = this.sent[sentQuoteKey(agentId, threadId, content)] ?? [];
    return quoteJumpTargets(content, links, loaded);
  }
}

function readRaw(storage: QuoteJumpStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
