// SPDX-License-Identifier: Apache-2.0

/**
 * v2.17: quote a whole message into the composer.
 * A settled user-RIGHT kind=message with text, and a completed
 * assistant LEFT kind=message with text, offer Quote beside Copy.
 * Activating it quotes that message's content as markdown `>` lines.
 * A text selection still quotes only the selection. An in-flight
 * optimistic send and a streaming reply are not offered. Tool lines,
 * cards, handoff rows, and attachment-only bubbles are not.
 * Nothing is sent. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/QuoteMessage.swift`.
 */

import { quoteBlock } from "./quoteSelection.ts";

export const QUOTE_MESSAGE_LABEL = "Quote";
export const QUOTE_MESSAGE_ARIA = "Quote message";

/** Article attribute whose value is the message id the quote jumps to. */
export const QUOTE_MESSAGE_READING_ATTR = "data-reading-id";

/**
 * Settled user text, or a completed assistant message with text.
 * Whitespace-only content is not a quote. Pending and streaming are not.
 */
export function offersQuoteMessage(input: {
  fromUser: boolean;
  kindMessage: boolean;
  content: string;
  completed: boolean;
  pending: boolean;
}): boolean {
  if (input.pending) return false;
  if (!input.kindMessage) return false;
  if (!input.fromUser && !input.completed) return false;
  return quoteBlock(input.content) != null;
}

type ReadingHost = {
  closest?: (selector: string) => {
    getAttribute(name: string): string | null;
  } | null;
};

/** Message id from the surrounding turn, or empty when it is missing. */
export function quoteMessageSourceId(node: ReadingHost | null): string {
  if (!node || typeof node.closest !== "function") return "";
  const host = node.closest(`[${QUOTE_MESSAGE_READING_ATTR}]`);
  const id = host?.getAttribute(QUOTE_MESSAGE_READING_ATTR) ?? "";
  return id.trim();
}
