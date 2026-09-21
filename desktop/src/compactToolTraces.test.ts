// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COLLAPSE_AT,
  TOOL_STACK_CHEVRON,
  TOOL_STACK_FONT_PX,
  collapsedToolsLabel,
  compactToolStacks,
  hidePersistedTool,
  isFoldableTool,
  liveToolPaint,
  neverFoldsIntoToolStack,
  shouldCollapseToolRun,
  showStackHeader,
  stackCollapsed,
  stackForMessageIndex,
  toggleExpanded,
} from "./compactToolTraces.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "compactToolTraces.ts"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

const tools = (
  ids: string[],
): { id: string; kind: string; content: string }[] =>
  ids.map((id, i) => ({
    id,
    kind: "tool",
    content: `Read ${i}`,
  }));

test("2+ consecutive tools collapse to N tools", () => {
  assert.equal(COLLAPSE_AT, 2);
  assert.equal(TOOL_STACK_FONT_PX, 12);
  assert.equal(collapsedToolsLabel(2), "2 tools");
  assert.equal(collapsedToolsLabel(3), "3 tools");
  assert.equal(shouldCollapseToolRun(1), false);
  assert.equal(shouldCollapseToolRun(2), true);
  assert.equal(shouldCollapseToolRun(8), true);

  const stacks = compactToolStacks({ messages: tools(["a", "b", "c"]) });
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0]!.id, "a");
  assert.equal(stacks[0]!.items.length, 3);
  assert.deepEqual(stacks[0]!.messageIndexes, [0, 1, 2]);
  assert.equal(shouldCollapseToolRun(stacks[0]!.items.length), true);
  assert.equal(stackCollapsed(new Set(), "a", 3), true);
  assert.equal(showStackHeader(stacks[0], 0), true);
  assert.equal(showStackHeader(stacks[0], 1), false);
  assert.equal(hidePersistedTool(stacks[0], 1, true), true);
  assert.equal(hidePersistedTool(stacks[0], 0, true), false);

  assert.match(app, /collapsedToolsLabel/);
  assert.match(app, /className="tool-trace tool-stack"/);
  assert.match(app, /compactToolStacks/);
  assert.match(app, /showStackHeader/);
  assert.match(app, /hidePersistedTool/);
  const header = block(".tool-stack");
  assert.match(header, /font-size:\s*12px/);
  assert.match(header, /color:\s*var\(--text-muted\)/);
  assert.match(css, /\.tool-stack-chevron/);
  assert.equal(TOOL_STACK_CHEVRON, "▸");
});

test("single tool line is unchanged (no collapse chrome)", () => {
  const stacks = compactToolStacks({ messages: tools(["only"]) });
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0]!.items.length, 1);
  assert.equal(shouldCollapseToolRun(1), false);
  assert.equal(stackCollapsed(new Set(), "only", 1), false);
  assert.equal(showStackHeader(stacks[0], 0), false);
  assert.equal(hidePersistedTool(stacks[0], 0, false), false);
  assert.equal(isFoldableTool("tool"), true);
  assert.equal(isFoldableTool("message"), false);

  const render = app.slice(
    app.indexOf("isToolLine(message) ? ("),
    app.indexOf("isWidget(message) && message.widget"),
  );
  assert.match(render, /className="tool-trace"/);
  assert.match(render, /message\.content/);
  assert.match(render, /showStackHeader/);
});

test("expand/collapse toggles the existing per-tool lines", () => {
  let expanded = new Set<string>();
  assert.equal(stackCollapsed(expanded, "a", 3), true);
  expanded = toggleExpanded(expanded, "a");
  assert.equal(stackCollapsed(expanded, "a", 3), false);
  expanded = toggleExpanded(expanded, "a");
  assert.equal(stackCollapsed(expanded, "a", 3), true);

  assert.match(app, /toggleExpanded/);
  assert.match(app, /expandedToolStacks/);
  assert.match(app, /aria-expanded/);
  assert.match(app, /setExpandedToolStacks/);
  const chevron = block(".tool-stack-chevron.open");
  assert.match(chevron, /rotate\(90deg\)/);
  assert.doesNotMatch(block(".tool-stack-chevron"), /transition:/);
});

test("live: first tool paints normally; 2nd swaps to N tools and bumps N", () => {
  const one = compactToolStacks({
    messages: [],
    liveTraces: [{ id: "t1", summary: "Searching…" }],
    liveAt: 0,
  });
  assert.equal(one.length, 1);
  assert.equal(one[0]!.items.length, 1);
  assert.equal(shouldCollapseToolRun(one[0]!.items.length), false);
  const paintOne = liveToolPaint(one, [{ id: "t1", summary: "Searching…" }], new Set());
  assert.equal(paintOne.header, null);
  assert.equal(paintOne.lines.length, 1);

  const two = compactToolStacks({
    messages: [],
    liveTraces: [
      { id: "t1", summary: "Searching…" },
      { id: "t2", summary: "Read a" },
    ],
    liveAt: 0,
  });
  assert.equal(two[0]!.items.length, 2);
  const paintTwo = liveToolPaint(
    two,
    [
      { id: "t1", summary: "Searching…" },
      { id: "t2", summary: "Read a" },
    ],
    new Set(),
  );
  assert.equal(paintTwo.header?.items.length, 2);
  assert.equal(collapsedToolsLabel(paintTwo.header!.items.length), "2 tools");
  assert.equal(paintTwo.lines.length, 0);

  const three = compactToolStacks({
    messages: [],
    liveTraces: [
      { id: "t1", summary: "Searching…" },
      { id: "t2", summary: "Read a" },
      { id: "t3", summary: "Wrote b" },
    ],
    liveAt: 0,
  });
  assert.equal(three[0]!.items.length, 3);
  assert.equal(collapsedToolsLabel(3), "3 tools");

  const mixed = compactToolStacks({
    messages: [{ id: "t1", kind: "tool", content: "Searching…" }],
    liveTraces: [{ id: "t2", summary: "Read a" }],
    liveAt: 1,
  });
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0]!.items.length, 2);
  assert.deepEqual(mixed[0]!.messageIndexes, [0]);
  assert.deepEqual(mixed[0]!.liveIds, ["t2"]);
  const paintMixed = liveToolPaint(
    mixed,
    [{ id: "t2", summary: "Read a" }],
    new Set(),
  );
  assert.equal(paintMixed.header, null);
  assert.equal(paintMixed.lines.length, 0);
  assert.equal(showStackHeader(mixed[0], 0), true);

  assert.match(app, /liveToolPaint/);
  assert.match(src, /first tool paints normally/);
});

test("kind=widget / approve / connect never fold into the tool stack", () => {
  assert.equal(neverFoldsIntoToolStack("widget"), true);
  assert.equal(neverFoldsIntoToolStack("approve"), true);
  assert.equal(neverFoldsIntoToolStack("connect"), true);
  assert.equal(neverFoldsIntoToolStack("tool"), false);
  assert.equal(neverFoldsIntoToolStack("message"), false);

  const stacks = compactToolStacks({
    messages: [
      { id: "t1", kind: "tool", content: "Read a" },
      { id: "w", kind: "widget", content: "" },
      { id: "t2", kind: "tool", content: "Read b" },
      { id: "t3", kind: "tool", content: "Read c" },
      { id: "ap", kind: "approve", content: "" },
      { id: "t4", kind: "tool", content: "Ran ls" },
      { id: "cn", kind: "connect", content: "" },
      { id: "t5", kind: "tool", content: "Wrote d" },
      { id: "t6", kind: "tool", content: "Wrote e" },
    ],
  });
  assert.equal(stacks.length, 4);
  assert.equal(stacks[0]!.items.length, 1);
  assert.equal(stacks[1]!.items.length, 2);
  assert.equal(stacks[1]!.id, "t2");
  assert.equal(stacks[2]!.items.length, 1);
  assert.equal(stacks[3]!.items.length, 2);
  assert.equal(shouldCollapseToolRun(stacks[0]!.items.length), false);
  assert.equal(shouldCollapseToolRun(stacks[1]!.items.length), true);
  assert.equal(stackForMessageIndex(stacks, 2)?.id, "t2");
  assert.equal(stackForMessageIndex(stacks, 1), undefined);

  const brokenByMessage = compactToolStacks({
    messages: [
      { id: "t1", kind: "tool", content: "Read a" },
      { id: "m", kind: "message", content: "hi" },
      { id: "t2", kind: "tool", content: "Read b" },
    ],
  });
  assert.equal(brokenByMessage.length, 2);
  assert.equal(brokenByMessage[0]!.items.length, 1);
  assert.equal(brokenByMessage[1]!.items.length, 1);

  assert.match(src, /never fold/);
  assert.match(app, /isWidget\(message\)/);
  assert.match(app, /isApprove\(message\)/);
  assert.match(app, /isConnect\(message\)/);
});

test("OpenAPI stays 0.18.0; v0.56 is documented; no new HTTP", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.56/);
  assert.match(protocol, /v0\.56/);
  assert.match(runtimeOpenapi, /v0\.56/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(src, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(src, /\/v1\/chats\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.55 intact stack stays wired; stick / Jump / gap unchanged", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop\(busy\)/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /className="stop-generating"/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /className="assistant-bubbles"/);
  assert.match(app, /sendMutedWhileGenerating\(busy\)/);
  assert.match(app, /JUMP_TO_LATEST_LABEL/);
  assert.match(app, /className="jump-latest"/);
  assert.match(css, /\.turn\.left\.same-sender \{[\s\S]*margin-top:\s*12px/);
  assert.match(css, /\.assistant-bubbles \{[\s\S]*gap:\s*6px/);
  const trace = block(".tool-trace");
  assert.match(trace, /font-size:\s*12px/);
  assert.match(trace, /color:\s*var\(--text-muted\)/);
});
