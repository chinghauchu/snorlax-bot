// SPDX-License-Identifier: Apache-2.0

/**
 * v2.20: rate a completed assistant reply.
 * Good and Bad sit on the same action row as Copy. Choosing one
 * marks that reply. Choosing the mark that is already on clears it.
 * The two marks are exclusive. The mark stays on this client
 * (`snorlax.replyRating`) and is not sent. A streaming reply, a
 * user message, and tool or card rows are not offered. Nothing is
 * sent. No new shortcut. No animation.
 * Keep in lockstep with `ios/SnorlaxBot/ReplyRating.swift`.
 */

export const REPLY_RATING_STORAGE_KEY = "snorlax.replyRating";

export const REPLY_RATING_GOOD = "good";
export const REPLY_RATING_BAD = "bad";

export const REPLY_RATING_GOOD_LABEL = "Good";
export const REPLY_RATING_BAD_LABEL = "Bad";

/** Accessible name. Visible text stays Good / Bad. */
export const REPLY_RATING_GOOD_ARIA = "Good response";
export const REPLY_RATING_BAD_ARIA = "Bad response";

export type ReplyRating = "good" | "bad";

export type ReplyRatingMap = Record<string, ReplyRating>;

export type ReplyRatingStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isReplyRating(value: unknown): value is ReplyRating {
  return value === REPLY_RATING_GOOD || value === REPLY_RATING_BAD;
}

/**
 * Completed assistant LEFT kind=message only. A user bubble, a
 * streaming reply, and any other kind are not rated.
 */
export function offersReplyRating(input: {
  fromUser: boolean;
  kindMessage: boolean;
  completed: boolean;
}): boolean {
  return !input.fromUser && input.kindMessage && input.completed;
}

export function replyRatingLabel(pick: ReplyRating): "Good" | "Bad" {
  return pick === REPLY_RATING_BAD ? REPLY_RATING_BAD_LABEL : REPLY_RATING_GOOD_LABEL;
}

export function replyRatingAria(pick: ReplyRating): string {
  return pick === REPLY_RATING_BAD ? REPLY_RATING_BAD_ARIA : REPLY_RATING_GOOD_ARIA;
}

export function replyRatingPressed(
  current: ReplyRating | null | undefined,
  pick: ReplyRating,
): boolean {
  return current === pick;
}

/** The mark swaps in place. Reduce Motion adds nothing to animate. */
export function replyRatingAnimates(reduceMotion: boolean): boolean {
  void reduceMotion;
  return false;
}

/** Missing, corrupt, or non-object blobs are an empty map. Other values drop. */
export function parseReplyRatings(raw: string | null | undefined): ReplyRatingMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const ratings: ReplyRatingMap = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!id || !isReplyRating(value)) continue;
    ratings[id] = value;
  }
  return ratings;
}

export function serializeReplyRatings(ratings: ReplyRatingMap): string {
  const clean: ReplyRatingMap = {};
  for (const [id, pick] of Object.entries(ratings)) {
    if (!id || !isReplyRating(pick)) continue;
    clean[id] = pick;
  }
  return JSON.stringify(clean);
}

export function browserReplyRatingStorage(): ReplyRatingStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readReplyRatings(storage: ReplyRatingStorage | null): ReplyRatingMap {
  if (!storage) return {};
  try {
    return parseReplyRatings(storage.getItem(REPLY_RATING_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeReplyRatings(
  storage: ReplyRatingStorage | null,
  ratings: ReplyRatingMap,
): void {
  if (!storage) return;
  try {
    storage.setItem(REPLY_RATING_STORAGE_KEY, serializeReplyRatings(ratings));
  } catch {
    /* private mode and a full disk leave the in-memory mark */
  }
}

/**
 * Set `pick`, or clear it when that mark is already on.
 * The other mark is replaced. A blank id leaves the map alone.
 */
export function toggleReplyRating(
  ratings: ReplyRatingMap,
  id: string,
  pick: ReplyRating,
): ReplyRatingMap {
  if (!id || !isReplyRating(pick)) return ratings;
  const next: ReplyRatingMap = { ...ratings };
  if (next[id] === pick) delete next[id];
  else next[id] = pick;
  return next;
}
