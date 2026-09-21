// SPDX-License-Identifier: Apache-2.0

/**
 * v0.52: 12px muted blinking caret at the end of the mid-stream LEFT
 * growing bubble, after the first assistant token until complete / Stop.
 * Never with waiting ···. Not on tool / widget / approve / connect /
 * user-right.
 */

const NON_MESSAGE = new Set([
  "tool",
  "widget",
  "approve",
  "connect",
  "handoff",
]);

export function showStreamingCaret(input: {
  busy: boolean;
  completed: boolean;
  hasFirstToken: boolean;
  kind?: string | null;
  isUser?: boolean;
}): boolean {
  if (!input.busy || input.completed || !input.hasFirstToken) return false;
  if (input.isUser) return false;
  if (input.kind && NON_MESSAGE.has(input.kind)) return false;
  return true;
}
