// SPDX-License-Identifier: Apache-2.0

/**
 * v1.29: soft-wrap toggle on assistant code fences.
 * The v0.11 language label already sits in the fence header (empty when
 * the fence has no info string). This slice adds a Wrap control beside
 * Copy. Default is no wrap, with horizontal scroll. Wrap soft-wraps that
 * block's long lines. Each block is independent. The choice lives in
 * memory for the app session and is not written to disk. Relaunch drops
 * it. No animation. No new shortcut. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/CodeBlockWrap.swift`.
 */

export const CODE_BLOCK_WRAP_LABEL = "Wrap";

export const CODE_BLOCK_UNWRAP_LABEL = "Unwrap";

/** Accessible name while lines scroll horizontally. Visible text stays `Wrap`. */
export const CODE_BLOCK_WRAP_ARIA = "Wrap lines";

export const CODE_BLOCK_UNWRAP_ARIA = "Unwrap lines";

/** In-memory only. Not written to disk, and not a server field. */
const session = new Map<string, boolean>();

export function codeBlockWrapsByDefault(): boolean {
  return false;
}

/** Not saved across relaunch. The map dies with the page. */
export function codeBlockWrapPersists(): boolean {
  return false;
}

export function codeBlockWrapId(scope: string, index: number): string {
  return `${scope}\u0000${index}`;
}

export function readCodeBlockWrap(id: string): boolean {
  if (!id) return codeBlockWrapsByDefault();
  return session.get(id) ?? codeBlockWrapsByDefault();
}

export function writeCodeBlockWrap(id: string, wrapped: boolean): void {
  if (!id) return;
  if (wrapped) session.set(id, true);
  else session.delete(id);
}

/** Flip one block. Other ids are left alone. */
export function toggleCodeBlockWrap(id: string, wrapped: boolean): boolean {
  const next = !wrapped;
  writeCodeBlockWrap(id, next);
  return next;
}

/** Drop the session map. Tests use this; relaunch does the same. */
export function clearCodeBlockWrapSession(): void {
  session.clear();
}

export function showCodeBlockWrap(completed: boolean): boolean {
  return completed;
}

export function codeBlockWrapLabel(wrapped: boolean): "Wrap" | "Unwrap" {
  return wrapped ? CODE_BLOCK_UNWRAP_LABEL : CODE_BLOCK_WRAP_LABEL;
}

export function codeBlockWrapAriaLabel(wrapped: boolean): string {
  return wrapped ? CODE_BLOCK_UNWRAP_ARIA : CODE_BLOCK_WRAP_ARIA;
}

/** Default keeps horizontal scroll. Wrapped lines use soft wrap. */
export function codeBlockWrapClass(wrapped: boolean): string {
  return wrapped ? "md-fence-body md-fence-body-wrap" : "md-fence-body";
}

/** Label and layout swap only. Never animate, including when Reduce Motion is off. */
export function codeBlockWrapAnimates(reduceMotion: boolean): boolean {
  if (reduceMotion) return false;
  return false;
}
