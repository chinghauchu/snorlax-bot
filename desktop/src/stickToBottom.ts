// SPDX-License-Identifier: Apache-2.0

import { isLeftKindMessage } from "./messageActions.ts";

/** Slack (px / pt) for "still at the bottom" while tokens arrive. */
export const NEAR_BOTTOM_PX = 64;

export const JUMP_TO_LATEST_LABEL = "Jump to latest";

export type StickBox = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type StickState = {
  /** Follow the stream; Send / Jump / scrolling to the bottom re-arms. */
  armed: boolean;
  /** New assistant bubble arrived while the user was scrolled up. */
  showJump: boolean;
};

export const STICK_ARMED: StickState = { armed: true, showJump: false };

export function distanceFromBottom(box: StickBox): number {
  return box.scrollHeight - box.clientHeight - box.scrollTop;
}

export function isNearBottom(
  box: StickBox,
  threshold = NEAR_BOTTOM_PX,
): boolean {
  return distanceFromBottom(box) <= threshold;
}

export function shouldFollowStream(state: StickState): boolean {
  return state.armed;
}

/** User scroll: within ~64px re-arms and dismisses the chip; further up freezes. */
export function onUserScroll(
  state: StickState,
  nearBottom: boolean,
): StickState {
  if (nearBottom) return { ...STICK_ARMED };
  return { ...state, armed: false };
}

/** Send and Regenerates snap to bottom and re-arm stick. */
export function onSendOrRegenerate(): StickState {
  return { ...STICK_ARMED };
}

export function onJumpToLatest(): StickState {
  return { ...STICK_ARMED };
}

/** Latest LEFT `kind=message` id + length — a new bubble (or growth) while stuck. */
export function assistantBubbleSignature(
  messages: {
    id: string;
    content: string;
    kind?: string;
    role?: string;
    senderId?: string;
  }[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]!;
    if (isLeftKindMessage(row)) return `${row.id}:${row.content.length}`;
  }
  return "";
}

export function onAssistantActivity(
  state: StickState,
  prevSignature: string,
  nextSignature: string,
): StickState {
  if (
    !state.armed &&
    nextSignature !== "" &&
    nextSignature !== prevSignature
  ) {
    return { ...state, showJump: true };
  }
  return state;
}

/**
 * v0.60: Esc activates Jump when the chip is visible and no
 * assistant turn is in flight. Same skips as v0.53 (IME composing,
 * pending widget / approve / connect). While generating, Esc=Stop
 * wins — this returns false so Stop stays first.
 */
export function escapeJumpsToLatest(input: {
  showJump: boolean;
  busy?: boolean;
  composing?: boolean;
  pendingWidget?: boolean;
  pendingApprove?: boolean;
  pendingConnect?: boolean;
}): boolean {
  if (input.busy) return false;
  if (!input.showJump) return false;
  if (input.composing) return false;
  if (input.pendingWidget || input.pendingApprove || input.pendingConnect) {
    return false;
  }
  return true;
}
