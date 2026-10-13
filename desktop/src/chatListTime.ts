// SPDX-License-Identifier: Apache-2.0

/**
 * v0.83: compact relative time beside each chat's last-message preview.
 * Uses that chat's latest message `createdAt` already in memory.
 * Today is now / Nm / Nh. Then Yesterday, the weekday within the past
 * week, then a short date. A light timer re-renders the labels.
 * No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/ChatListTime.swift`.
 */

import { calendarDaysBefore, parseCreatedAt } from "./daySeparator.ts";

export const CHAT_LIST_NOW = "now";
export const CHAT_LIST_YESTERDAY = "Yesterday";

/** One clock for the whole roster. Cheap, and "now" still becomes "1m". */
export const CHAT_LIST_TIME_TICK_MS = 30_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type ActivityMessage = {
  createdAt?: string | Date | null;
};

/**
 * now under a minute (and any future stamp), Nm, Nh on the same local
 * day, Yesterday, the weekday 2–6 local days ago, otherwise `MMM d`
 * (with the year when it is not this year). Null when missing.
 */
export function chatListTimeLabel(
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const date = parseCreatedAt(createdAt);
  if (!date) return null;
  const elapsed = now.getTime() - date.getTime();
  const days = calendarDaysBefore(date, now);
  if (elapsed < MINUTE_MS || days < 0) return CHAT_LIST_NOW;
  if (days === 0) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${Math.max(hours, 1)}h`;
  }
  if (days === 1) return CHAT_LIST_YESTERDAY;
  if (days >= 2 && days <= 6) return WEEKDAYS[date.getDay()] ?? "Sunday";
  const month = MONTHS[date.getMonth()] ?? "Jan";
  const day = date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}

/** ISO instant of the latest transcript row that has a parseable stamp. */
export function latestMessageAt(
  messages: readonly ActivityMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const date = parseCreatedAt(messages[i]?.createdAt);
    if (date) return date.toISOString();
  }
  return null;
}

/** Write one chat's latest stamp. An empty transcript drops it. */
export function rememberChatActivity(
  activity: Readonly<Record<string, string>>,
  chatId: string,
  messages: readonly ActivityMessage[],
): Record<string, string> {
  if (!chatId) return activity;
  const iso = latestMessageAt(messages);
  if (!iso) {
    if (!Object.prototype.hasOwnProperty.call(activity, chatId)) return activity;
    const next = { ...activity };
    delete next[chatId];
    return next;
  }
  if (activity[chatId] === iso) return activity;
  return { ...activity, [chatId]: iso };
}

/**
 * A message that just finished, including when that chat is no longer
 * open. An older stamp does not move the row backward.
 */
export function applyFinishedActivity(
  activity: Readonly<Record<string, string>>,
  chatId: string,
  createdAt: string | Date | null | undefined,
): Record<string, string> {
  if (!chatId) return activity;
  const date = parseCreatedAt(createdAt);
  if (!date) return activity;
  const iso = date.toISOString();
  const prev = parseCreatedAt(activity[chatId]);
  if (prev && prev.getTime() > date.getTime()) return activity;
  if (activity[chatId] === iso) return activity;
  return { ...activity, [chatId]: iso };
}

/** Drop stamps for chats that left the roster. */
export function retainChatActivity(
  activity: Readonly<Record<string, string>>,
  ids: ReadonlySet<string>,
): Record<string, string> {
  let changed = false;
  const next: Record<string, string> = {};
  for (const [id, iso] of Object.entries(activity)) {
    if (!ids.has(id)) {
      changed = true;
      continue;
    }
    next[id] = iso;
  }
  return changed ? next : activity;
}
