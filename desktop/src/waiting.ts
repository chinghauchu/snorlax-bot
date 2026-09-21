// SPDX-License-Identifier: Apache-2.0

/**
 * v0.51: LEFT waiting ··· until the first assistant token/content.
 * Grok Bot feel. Hide as soon as streamed text or a tool line starts.
 */

export const WAITING_WORD = "waiting";
export const WAITING_DOT = "·";
export const WAITING_LABEL = `${WAITING_WORD} ${WAITING_DOT}${WAITING_DOT}${WAITING_DOT}`;

/**
 * Show waiting ··· after Send (while the turn is in flight) until the
 * first assistant token or a tool line arrives. Real `message.delta`
 * and tool traces take over.
 */
export function showWaitingLine(input: {
  busy: boolean;
  hasLiveAssistant: boolean;
  hasLiveTool: boolean;
}): boolean {
  return Boolean(input.busy) && !input.hasLiveAssistant && !input.hasLiveTool;
}
