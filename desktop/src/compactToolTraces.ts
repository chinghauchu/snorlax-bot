// SPDX-License-Identifier: Apache-2.0

/**
 * v0.56: compact tool traces. Within one assistant turn, 2+ consecutive
 * kind=tool lines collapse client-side into one 12px muted `N tools`
 * line with a small chevron. Default collapsed. Single tool unchanged.
 * Live: first tool paints normally; on the 2nd, swap to collapsed and
 * bump N. kind=widget / approve / connect never fold into the stack.
 * No new HTTP. Stick-to-bottom / Jump / multi-bubble gap unchanged.
 */

export const COLLAPSE_AT = 2;

export const TOOL_STACK_FONT_PX = 12;

/** Collapsed (▸) / expanded (▾ via CSS rotate) chevron glyph. */
export const TOOL_STACK_CHEVRON = "▸";

export type ToolKindRow = {
  id: string;
  kind?: string | null;
  content?: string | null;
};

export type LiveToolItem = {
  id: string;
  summary: string;
};

export type CompactToolItem = {
  id: string;
  summary: string;
  /** Persisted transcript index, or -1 for a live-only trace. */
  messageIndex: number;
};

export type CompactToolStack = {
  /** First tool id — stable expand/collapse key. */
  id: string;
  items: CompactToolItem[];
  messageIndexes: number[];
  liveIds: string[];
};

export function collapsedToolsLabel(count: number): string {
  return `${count} tools`;
}

export function shouldCollapseToolRun(count: number): boolean {
  return count >= COLLAPSE_AT;
}

/** kind=widget / approve / connect never fold into the tool stack. */
export function neverFoldsIntoToolStack(
  kind: string | undefined | null,
): boolean {
  return kind === "widget" || kind === "approve" || kind === "connect";
}

export function isFoldableTool(kind: string | undefined | null): boolean {
  return kind === "tool";
}

/**
 * Consecutive kind=tool runs. widget / approve / connect / message / user
 * break the run. Live traces insert at `liveAt` (assistant index, or
 * messages.length for a standalone live streak).
 */
export function compactToolStacks(input: {
  messages: ToolKindRow[];
  liveTraces?: LiveToolItem[];
  liveAt?: number | null;
}): CompactToolStack[] {
  type Row = {
    id: string;
    kind: string;
    summary: string;
    messageIndex: number;
    live: boolean;
  };
  const rows: Row[] = [];
  const live = input.liveTraces ?? [];
  const liveAt =
    live.length === 0
      ? null
      : input.liveAt == null || input.liveAt < 0
        ? input.messages.length
        : input.liveAt;

  const insertLive = () => {
    for (const trace of live) {
      rows.push({
        id: trace.id,
        kind: "tool",
        summary: trace.summary,
        messageIndex: -1,
        live: true,
      });
    }
  };

  input.messages.forEach((message, index) => {
    if (liveAt === index && live.length) insertLive();
    rows.push({
      id: message.id,
      kind: message.kind ?? "message",
      summary: message.content ?? "",
      messageIndex: index,
      live: false,
    });
  });
  if (liveAt === input.messages.length && live.length) insertLive();

  const stacks: CompactToolStack[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!isFoldableTool(rows[i]!.kind)) {
      i += 1;
      continue;
    }
    const items: CompactToolItem[] = [];
    const messageIndexes: number[] = [];
    const liveIds: string[] = [];
    while (i < rows.length && isFoldableTool(rows[i]!.kind)) {
      const row = rows[i]!;
      items.push({
        id: row.id,
        summary: row.summary,
        messageIndex: row.messageIndex,
      });
      if (!row.live && row.messageIndex >= 0) {
        messageIndexes.push(row.messageIndex);
      }
      if (row.live) liveIds.push(row.id);
      i += 1;
    }
    stacks.push({
      id: items[0]!.id,
      items,
      messageIndexes,
      liveIds,
    });
  }
  return stacks;
}

/** Default collapsed when the run is 2+. Single tool: never collapsed chrome. */
export function stackCollapsed(
  expanded: ReadonlySet<string>,
  stackId: string,
  count: number,
): boolean {
  if (!shouldCollapseToolRun(count)) return false;
  return !expanded.has(stackId);
}

export function toggleExpanded(
  expanded: ReadonlySet<string>,
  stackId: string,
): Set<string> {
  const next = new Set(expanded);
  if (next.has(stackId)) next.delete(stackId);
  else next.add(stackId);
  return next;
}

export function stackForMessageIndex(
  stacks: CompactToolStack[],
  index: number,
): CompactToolStack | undefined {
  return stacks.find((stack) => stack.messageIndexes.includes(index));
}

/** Skip subsequent persisted tools in a collapsed 2+ run. */
export function hidePersistedTool(
  stack: CompactToolStack | undefined,
  messageIndex: number,
  collapsed: boolean,
): boolean {
  if (!stack || !collapsed) return false;
  const first = stack.messageIndexes[0];
  return first != null && messageIndex !== first;
}

/** Chevron + `N tools` on the first persisted tool of a 2+ run. */
export function showStackHeader(
  stack: CompactToolStack | undefined,
  messageIndex: number,
): boolean {
  if (!stack || !shouldCollapseToolRun(stack.items.length)) return false;
  return stack.messageIndexes[0] === messageIndex;
}

export type LiveToolPaint = {
  header: CompactToolStack | null;
  lines: LiveToolItem[];
};

/**
 * Live chrome. Mixed stacks (persisted + live) keep the header on the
 * first persisted tool. Live-only 2+ swap to collapsed `N tools`.
 * Single live tool: unchanged per-tool lines.
 */
export function liveToolPaint(
  stacks: CompactToolStack[],
  liveTraces: LiveToolItem[],
  expanded: ReadonlySet<string>,
): LiveToolPaint {
  if (!liveTraces.length) return { header: null, lines: [] };
  const liveIds = new Set(liveTraces.map((trace) => trace.id));
  const stack = stacks.find((row) =>
    row.liveIds.some((id) => liveIds.has(id)),
  );
  if (!stack) return { header: null, lines: liveTraces };
  const collapse = shouldCollapseToolRun(stack.items.length);
  const collapsed = collapse && !expanded.has(stack.id);
  const mixed = stack.messageIndexes.length > 0;
  if (mixed) {
    return { header: null, lines: collapsed ? [] : liveTraces };
  }
  if (!collapse) return { header: null, lines: liveTraces };
  return { header: stack, lines: collapsed ? [] : liveTraces };
}
