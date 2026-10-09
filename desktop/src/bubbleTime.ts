// SPDX-License-Identifier: Apache-2.0

/**
 * v0.65: local time for a chat bubble, from the existing `createdAt`.
 * Today is `h:mm AM` (no leading hour zero). Any other local day
 * prefixes `MMM d`, plus the year when it is not this year.
 * No new HTTP. Hide the label while that bubble is still streaming.
 * Keep in lockstep with `ios/SnorlaxBot/BubbleTime.swift`.
 */

export const BUBBLE_TIME_FADE_MS = 120;

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

/** Appear fade. Instant when Reduce Motion is on. */
export function bubbleTimeFadeMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : BUBBLE_TIME_FADE_MS;
}

/** Streaming bubbles stay unlabeled so the caret is left alone. */
export function showBubbleTimestamp(streaming: boolean): boolean {
  return !streaming;
}

/**
 * Local clock label, or null when `createdAt` is missing / unparseable
 * or the bubble is still streaming.
 */
export function bubbleTimeLabel(
  createdAt: string | Date | null | undefined,
  streaming: boolean,
  now: Date = new Date(),
): string | null {
  if (!showBubbleTimestamp(streaming)) return null;
  return formatBubbleTime(createdAt, now);
}

/** `h:mm AM`, or `MMM d, h:mm AM` (with year) when not today. */
export function formatBubbleTime(
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (createdAt == null || createdAt === "") return null;
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const time = formatClock(date);
  if (sameLocalDay(date, now)) return time;
  return `${formatDay(date, now)}, ${time}`;
}

function formatClock(date: Date): string {
  let hour = date.getHours();
  const minute = date.getMinutes();
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const mm = minute < 10 ? `0${minute}` : String(minute);
  return `${hour}:${mm} ${suffix}`;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDay(date: Date, now: Date): string {
  const month = MONTHS[date.getMonth()] ?? "Jan";
  const day = date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}
