// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  BUBBLE_TIME_FADE_MS,
  bubbleTimeFadeMs,
  bubbleTimeLabel,
  formatBubbleTime,
  showBubbleTimestamp,
} from "./bubbleTime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "bubbleTime.ts"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "BubbleTime.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE =
  "v0.65 bubble timestamps (hover / long-press shows local time from createdAt; hide while streaming; no layout shift; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function reducedMotionBlocks(): string[] {
  const needle = "@media (prefers-reduced-motion: reduce)";
  const out: string[] = [];
  let from = 0;
  while (true) {
    const idx = css.indexOf(needle, from);
    if (idx < 0) break;
    const start = css.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push(css.slice(idx, end + 1));
    from = end + 1;
  }
  return out;
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("today is local h:mm AM; other days include the date", () => {
  const now = new Date(2026, 9, 9, 16, 0, 0);
  assert.equal(formatBubbleTime(new Date(2026, 9, 9, 15, 4, 0), now), "3:04 PM");
  assert.equal(formatBubbleTime(new Date(2026, 9, 9, 9, 5, 0), now), "9:05 AM");
  assert.equal(formatBubbleTime(new Date(2026, 9, 9, 0, 0, 0), now), "12:00 AM");
  assert.equal(formatBubbleTime(new Date(2026, 9, 9, 0, 7, 0), now), "12:07 AM");
  assert.equal(formatBubbleTime(new Date(2026, 9, 9, 12, 0, 0), now), "12:00 PM");
  assert.equal(formatBubbleTime(new Date(2026, 9, 9, 12, 9, 0), now), "12:09 PM");

  assert.equal(
    formatBubbleTime(new Date(2026, 9, 8, 15, 4, 0), now),
    "Oct 8, 3:04 PM",
  );
  assert.equal(
    formatBubbleTime(new Date(2026, 0, 1, 8, 1, 0), now),
    "Jan 1, 8:01 AM",
  );
  assert.equal(
    formatBubbleTime(new Date(2025, 9, 8, 15, 4, 0), now),
    "Oct 8, 2025, 3:04 PM",
  );
  assert.equal(
    formatBubbleTime(new Date(2026, 11, 31, 23, 59, 0), now),
    "Dec 31, 11:59 PM",
  );

  const iso = new Date(2026, 9, 9, 15, 4, 0);
  assert.equal(formatBubbleTime(iso.toISOString(), now), "3:04 PM");
  assert.equal(formatBubbleTime("", now), null);
  assert.equal(formatBubbleTime(null, now), null);
  assert.equal(formatBubbleTime(undefined, now), null);
  assert.equal(formatBubbleTime("not-a-date", now), null);
});

test("streaming hides the label; fade is 120ms and 0 under Reduce Motion", () => {
  const now = new Date(2026, 9, 9, 15, 4, 0);
  const created = new Date(2026, 9, 9, 15, 4, 0);
  assert.equal(showBubbleTimestamp(true), false);
  assert.equal(showBubbleTimestamp(false), true);
  assert.equal(bubbleTimeLabel(created, true, now), null);
  assert.equal(bubbleTimeLabel(created, false, now), "3:04 PM");
  assert.equal(bubbleTimeLabel("nope", false, now), null);
  assert.equal(BUBBLE_TIME_FADE_MS, 120);
  assert.equal(bubbleTimeFadeMs(false), 120);
  assert.equal(bubbleTimeFadeMs(true), 0);
  assert.match(src, /Instant when Reduce Motion/);
  assert.match(swift, /reduceMotion \? 0 : fadeMs/);
  assert.match(swift, /guard !streaming/);
  assert.match(swift, /inSameDayAs/);
});

test("desktop label is hover/focus, out of flow, and hidden while streaming", () => {
  const time = block(".bubble-time");
  assert.match(time, /position:\s*absolute/);
  assert.match(time, /opacity:\s*0/);
  assert.match(time, /pointer-events:\s*none/);
  assert.match(time, /transition:\s*opacity\s+120ms/);
  assert.match(time, /color:\s*var\(--text-muted\)/);
  assert.match(time, /font-size:\s*12px/);
  assert.match(time, /margin:\s*0/);
  assert.doesNotMatch(time, /position:\s*fixed/);
  const bubble = block(".bubble");
  assert.match(bubble, /position:\s*relative/);
  assert.match(block(".bubble:hover > .bubble-time"), /opacity:\s*1/);
  assert.match(block(".bubble:focus-visible > .bubble-time"), /opacity:\s*1/);
  const reduce = reducedMotionBlocks().find((part) =>
    part.includes(".bubble-time"),
  );
  assert.ok(reduce, "missing Reduce Motion rule for bubble time");
  assert.match(reduce, /\.bubble-time \{[\s\S]*transition:\s*none/);
  assert.doesNotMatch(reduce, /opacity\s+120ms/);

  assert.match(app, /bubbleTimeLabel\(\s*message\.createdAt,\s*!completed/);
  assert.match(app, /className="bubble user"/);
  assert.match(app, /tabIndex=\{bubbleStamp \? 0 : undefined\}/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.match(user, /<BubbleStamp label=\{bubbleStamp\} \/>/);
  const agent = sliceFn(app, "leftBubbles.map", "showAssistantCopy");
  assert.match(agent, /<BubbleStamp label=\{bubbleStamp\} \/>/);
  assert.match(agent, /className="streaming-caret"/);
  const actions = sliceFn(app, "function MessageActions(", "function AgentSkillRow");
  assert.doesNotMatch(actions, /bubble-time/);
  assert.doesNotMatch(actions, /bubbleTimeLabel/);
  assert.match(actions, /COPY_CONTROL_LABEL/);
  assert.match(actions, />\s*Regenerate\s*</);
});

test("OpenAPI stays 0.18.0; roadmap + iOS menu; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[()]/g, "\\$&")));
  assert.match(ci, /python3 ios\/scripts\/test_ios_bubble_time\.py/);
  assert.match(chat, /streaming: !completed/);
  assert.match(chat, /\.contextMenu/);
  const menu = sliceFn(chat, "struct BubbleTimestampMenu", "struct AttachmentShareSheet");
  const header = sliceFn(menu, "} header: {", "}");
  assert.match(header, /Text\(stamp\)/);
  assert.doesNotMatch(header, /Button/);
  assert.match(menu, /Button\("Copy"\)/);
  assert.match(menu, /Button\("Regenerate"\)/);
  assert.match(menu, /\.disabled\(true\)/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(src, /\/v1\//);
});
