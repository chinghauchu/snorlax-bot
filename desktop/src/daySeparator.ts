// SPDX-License-Identifier: Apache-2.0

/**
 * v0.67: a muted day line above the first painted transcript row of
 * each local calendar day. Uses the existing `createdAt`. No new HTTP.
 * No animation (Reduce Motion has nothing to shorten).
 * Keep in lockstep with `ios/SnorlaxBot/DaySeparator.swift`.
 *
 * Jump to latest (v0.47–v0.63) already covers scroll-up. This line is
 * the reading aid for the messages you stopped to look at.
 */

export const DAY_TODAY = "Today";
export const DAY_YESTERDAY = "Yesterday";

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

export type DayRow = {
  createdAt?: string | Date | null;
  /** Collapsed tool lines are not painted, so they do not start a day. */
  hidden?: boolean;
};

export function parseCreatedAt(
  createdAt: string | Date | null | undefined,
): Date | null {
  if (createdAt == null || createdAt === "") return null;
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Local midnights. Positive when `date` is before `now`. */
export function calendarDaysBefore(date: Date, now: Date): number {
  const start = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((start(now) - start(date)) / 86_400_000);
}

/**
 * Today, Yesterday, the weekday when it is 2–6 local days ago,
 * otherwise `MMM d` (with the year when it is not this year).
 * Null when `createdAt` is missing or unparseable.
 */
export function daySeparatorLabel(
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const date = parseCreatedAt(createdAt);
  if (!date) return null;
  const days = calendarDaysBefore(date, now);
  if (days === 0) return DAY_TODAY;
  if (days === 1) return DAY_YESTERDAY;
  if (days >= 2 && days <= 6) return WEEKDAYS[date.getDay()] ?? "Sunday";
  const month = MONTHS[date.getMonth()] ?? "Jan";
  const day = date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * One label per input row. The first painted row of each local day
 * gets the label. Hidden rows and rows without a date stay null and
 * do not move the day boundary.
 */
export function daySeparatorLabels(
  rows: DayRow[],
  now: Date = new Date(),
): (string | null)[] {
  const out: (string | null)[] = [];
  let prevKey: string | null = null;
  let seenDated = false;
  for (const row of rows) {
    if (row.hidden) {
      out.push(null);
      continue;
    }
    const date = parseCreatedAt(row.createdAt);
    if (!date) {
      out.push(null);
      continue;
    }
    const key = dayKey(date);
    if (!seenDated || key !== prevKey) {
      out.push(daySeparatorLabel(date, now));
      seenDated = true;
      prevKey = key;
    } else {
      out.push(null);
    }
  }
  return out;
}
