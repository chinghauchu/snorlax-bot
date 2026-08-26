// SPDX-License-Identifier: Apache-2.0

/** LEFT thinking chrome while a turn is in flight. */
export const THINKING_LABEL = "Thinking";

/**
 * Show the flowing LEFT thinking line only while this turn is busy and
 * neither streamed assistant text nor a tool line has started.
 * Real traces and `message.delta` already flow, so they take over.
 */
export function showThinkingLine(input: {
  busy: boolean;
  hasLiveAssistant: boolean;
  hasLiveTool: boolean;
}): boolean {
  return Boolean(input.busy) && !input.hasLiveAssistant && !input.hasLiveTool;
}
