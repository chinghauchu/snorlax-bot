// SPDX-License-Identifier: Apache-2.0

/**
 * v0.57: while a LEFT `kind=message` is mid-stream (growing bubble +
 * caret), paint plain text only — no live markdown, mermaid, or math.
 * On complete or Stop (partial stays completed): render markdown once
 * (bold / lists / code / links + mermaid + math), then apply the
 * existing blank-line multi-bubble split.
 */

/** Markdown (and mermaid / math) only after the LEFT turn completes. */
export function shouldRenderMarkdown(opts: { completed: boolean }): boolean {
  return opts.completed;
}
