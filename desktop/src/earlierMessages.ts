// SPDX-License-Identifier: Apache-2.0

/**
 * v2.14: load an earlier page of the open chat.
 * GET /v1/agents/{id}/messages already returns the newest page
 * (default 100, oldest-first) and accepts `before` plus `limit`.
 * A full page offers Load earlier messages. The click requests the
 * next older page and prepends it. A short page, or a page that
 * adds nothing, hides the control. Sending or regenerating keeps
 * pages already loaded above the latest window. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/EarlierMessages.swift`.
 */

/** Matches the server default and maximum page the clients request. */
export const EARLIER_PAGE_SIZE = 100;

export const LOAD_EARLIER_LABEL = "Load earlier messages";
export const LOADING_EARLIER_LABEL = "Loading earlier messages";
export const EARLIER_FAILED_LABEL = "Couldn't load earlier messages";

/** Same prefix as `optimisticSend.ts`. Local bubbles are not cursors. */
export const EARLIER_LOCAL_PREFIX = "local-";

export type EarlierRow = {
  id: string;
  createdAt?: string | null;
};

export type EarlierPage<T> = {
  rows: T[];
  added: number;
  mayHaveEarlier: boolean;
  revealId: string | null;
};

export function isEarlierServerId(id: string): boolean {
  return !id.startsWith(EARLIER_LOCAL_PREFIX);
}

/** A full page may have older rows. A short page is the start. */
export function pageMayHaveEarlier(
  count: number,
  pageSize = EARLIER_PAGE_SIZE,
): boolean {
  return count >= pageSize;
}

export function showEarlierControl(
  mayHaveEarlier: boolean,
  messageCount: number,
): boolean {
  return mayHaveEarlier && messageCount > 0;
}

/** Oldest server id in an oldest-first transcript. */
export function earlierCursor(rows: readonly { id: string }[]): string | null {
  for (const row of rows) {
    if (isEarlierServerId(row.id)) return row.id;
  }
  return null;
}

/**
 * Prepend an older page. Ids already on screen stay put.
 * `mayHaveEarlier` stays true only when this page both added rows
 * and filled the page size.
 */
export function applyEarlierPage<T extends { id: string }>(
  existing: readonly T[],
  page: readonly T[],
  pageSize = EARLIER_PAGE_SIZE,
): EarlierPage<T> {
  const seen = new Set(existing.map((row) => row.id));
  const older: T[] = [];
  for (const row of page) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    older.push(row);
  }
  return {
    rows: [...older, ...existing],
    added: older.length,
    mayHaveEarlier: older.length > 0 && page.length >= pageSize,
    revealId: older[0]?.id ?? null,
  };
}

function stamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * A refresh of the latest page must not drop history the user
 * already loaded. Rows before the oldest id in `latest` stay.
 * Local bubbles are left for the failed-send paint. An empty
 * latest page does not wipe what is already on screen.
 */
export function mergeLatestPage<T extends EarlierRow>(
  existing: readonly T[],
  latest: readonly T[],
): T[] {
  const serverLatest = latest.filter((row) => isEarlierServerId(row.id));
  if (serverLatest.length === 0) {
    return existing.filter((row) => isEarlierServerId(row.id));
  }
  const latestIds = new Set(serverLatest.map((row) => row.id));
  const boundary = serverLatest[0]!;
  const cut = existing.findIndex((row) => row.id === boundary.id);
  if (cut >= 0) {
    const older = existing
      .slice(0, cut)
      .filter((row) => isEarlierServerId(row.id) && !latestIds.has(row.id));
    return [...older, ...serverLatest];
  }
  const boundaryTime = stamp(boundary.createdAt);
  const older = existing.filter((row) => {
    if (!isEarlierServerId(row.id) || latestIds.has(row.id)) return false;
    const rowTime = stamp(row.createdAt);
    if (rowTime == null || boundaryTime == null) return false;
    return rowTime < boundaryTime;
  });
  return [...older, ...serverLatest];
}
