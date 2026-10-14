// SPDX-License-Identifier: Apache-2.0

/**
 * v0.94: quote a text selection into the composer.
 * User-RIGHT and completed assistant-LEFT `kind=message` bubbles only.
 * The quote is markdown `>` lines. The caret sits on the blank line
 * after the quote so the reply is not swallowed into the blockquote.
 * An existing draft is kept; the quote is appended after one blank line.
 * A whitespace-only composer counts as empty. Nothing is sent.
 * Tool lines, widget / approve / connect cards, file chips, and the
 * live LEFT stream are not quotable. No HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/QuoteSelection.swift`.
 */

export const QUOTE_LABEL = "Quote";

/** Attribute on the selectable message text. Value is always `message`. */
export const QUOTE_ROOT_ATTR = "data-quote";

export const QUOTE_ROOT_VALUE = "message";

export function quoteableText(selection: string): string | null {
  const normalized = selection.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/** One `>` line per source line. A blank line inside the selection stays `>`. */
export function quoteBlock(selection: string): string | null {
  const body = quoteableText(selection);
  if (body == null) return null;
  return body
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

/**
 * Insert the quote. Returns null when the selection is empty or
 * whitespace, and the caller must leave the draft alone.
 * The returned caret is the end of the text, after a trailing blank line.
 */
export function appendQuoteToDraft(
  draft: string,
  selection: string,
): { text: string; caret: number } | null {
  const block = quoteBlock(selection);
  if (block == null) return null;
  const quoted = `${block}\n\n`;
  if (draft.trim().length === 0) {
    return { text: quoted, caret: quoted.length };
  }
  const base = draft.replace(/\s+$/u, "");
  const text = `${base}\n\n${quoted}`;
  return { text, caret: text.length };
}

/** `message` when this bubble's text may be quoted, otherwise omit the attribute. */
export function quoteRootAttr(input: {
  kind?: string;
  fromUser: boolean;
  completed: boolean;
  fileChip?: boolean;
}): typeof QUOTE_ROOT_VALUE | undefined {
  return quoteSurfaceAllowed(input) ? QUOTE_ROOT_VALUE : undefined;
}

/**
 * Quotable surface. File chips are never quotable, even on a message.
 * A streaming LEFT bubble is not. A user-RIGHT kind=message is.
 */
export function quoteSurfaceAllowed(input: {
  kind?: string;
  fromUser: boolean;
  completed: boolean;
  fileChip?: boolean;
}): boolean {
  if (input.fileChip) return false;
  const kind = input.kind ?? "message";
  if (kind !== "message") return false;
  if (input.fromUser) return true;
  return input.completed;
}

/** Both ends of the selection must sit in the same quote root. */
export function selectionInsideOneQuoteRoot(input: {
  anchorInRoot: boolean;
  focusInRoot: boolean;
  sameRoot: boolean;
}): boolean {
  return input.anchorInRoot && input.focusInRoot && input.sameRoot;
}

/**
 * Place the muted Quote control just above the selection.
 * If that would leave the viewport, sit it just below.
 * No animation; the caller paints it in place.
 */
export function quoteButtonOrigin(
  rect: { top: number; left: number; bottom: number },
  viewport: { width: number; height: number },
  button: { width: number; height: number } = { width: 56, height: 22 },
): { top: number; left: number } {
  const gap = 6;
  const margin = 8;
  let top = rect.top - button.height - gap;
  if (top < margin) top = rect.bottom + gap;
  if (top + button.height > viewport.height - margin) {
    top = Math.max(margin, viewport.height - button.height - margin);
  }
  let left = rect.left;
  if (left + button.width > viewport.width - margin) {
    left = viewport.width - button.width - margin;
  }
  if (left < margin) left = margin;
  return { top, left };
}
