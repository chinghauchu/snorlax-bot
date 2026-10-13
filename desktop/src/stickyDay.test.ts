// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  dayGroups,
  pinnedDayLabel,
  type DaySpan,
} from "./daySeparator.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "daySeparator.ts"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "DaySeparator.swift"),
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
  "v0.85 sticky day header (the v0.67 Today / Yesterday / weekday / date line pins to the top of the transcript while scrolling through that day; the next day pushes it off; it stays above that day's first message and above New messages; no animation; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("day groups split on each label and keep nulls in the run", () => {
  assert.deepEqual(dayGroups([]), []);
  assert.deepEqual(dayGroups([null, null]), [
    { label: null, start: 0, end: 2 },
  ]);
  assert.deepEqual(dayGroups(["Today", null, null]), [
    { label: "Today", start: 0, end: 3 },
  ]);
  assert.deepEqual(dayGroups(["Yesterday", null, "Today", null]), [
    { label: "Yesterday", start: 0, end: 2 },
    { label: "Today", start: 2, end: 4 },
  ]);
  assert.deepEqual(dayGroups([null, "Today"]), [
    { label: null, start: 0, end: 1 },
    { label: "Today", start: 1, end: 2 },
  ]);
  assert.deepEqual(dayGroups(["Yesterday", "Today"]), [
    { label: "Yesterday", start: 0, end: 1 },
    { label: "Today", start: 1, end: 2 },
  ]);
});

test("the group covering the top stays pinned; the next day pushes it off", () => {
  const spans: DaySpan[] = [
    { label: "Yesterday", top: 0, bottom: 400 },
    { label: "Today", top: 400, bottom: 900 },
  ];
  assert.equal(pinnedDayLabel([], 0), null);
  assert.equal(pinnedDayLabel(spans, -10), null);
  assert.equal(pinnedDayLabel(spans, 0), "Yesterday");
  assert.equal(pinnedDayLabel(spans, 399), "Yesterday");
  assert.equal(pinnedDayLabel(spans, 400), "Today");
  assert.equal(pinnedDayLabel(spans, 899), "Today");
  assert.equal(pinnedDayLabel(spans, 900), null);
  assert.equal(
    pinnedDayLabel([{ label: null, top: 0, bottom: 200 }], 40),
    null,
  );
  assert.match(src, /group\.bottom <= viewportTop/);
  assert.match(src, /group\.top > viewportTop/);
  assert.match(swift, /group\.bottom <= viewportTop/);
  assert.match(swift, /group\.top > viewportTop/);
  assert.match(swift, /func groups\(/);
  assert.match(swift, /func pinnedDayLabel\(/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
});

test("desktop pins the day line inside its section; reading place stays in flow", () => {
  const line = block(".day-separator");
  assert.match(line, /position:\s*sticky/);
  assert.match(line, /top:\s*0/);
  assert.match(line, /z-index:\s*2/);
  assert.match(line, /background:\s*var\(--bg\)/);
  assert.match(line, /font-size:\s*12px/);
  assert.match(line, /color:\s*var\(--text-muted\)/);
  assert.match(line, /text-align:\s*center/);
  assert.doesNotMatch(line, /transition/);
  assert.doesNotMatch(line, /animation/);
  const group = block(".day-group");
  assert.match(group, /display:\s*flex/);
  assert.match(group, /flex-direction:\s*column/);
  assert.doesNotMatch(group, /overflow/);
  assert.doesNotMatch(group, /animation/);
  const anchor = block(".day-reading-anchor");
  assert.match(anchor, /height:\s*0/);
  assert.match(anchor, /min-height:\s*0/);

  assert.match(app, /dayGroups\(dayLabels\)/);
  assert.match(app, /className="day-group"/);
  assert.match(app, /className="day-reading-anchor"/);
  assert.match(app, /data-reading-id=\{`day:\$\{message\.id\}`\}/);
  const sep = app.indexOf('className="day-separator"');
  assert.ok(sep >= 0);
  const sepTag = app.slice(sep, app.indexOf("</p>", sep));
  assert.doesNotMatch(sepTag, /data-reading-id/);
  const handoff = app.indexOf('className="handoff-row"');
  const article = app.indexOf("className={`turn");
  assert.ok(
    app.lastIndexOf('className="day-separator"', handoff) <
      app.lastIndexOf("<NewMessagesDivider", handoff),
  );
  assert.ok(
    app.lastIndexOf('className="day-separator"', article) <
      app.lastIndexOf("<NewMessagesDivider", article),
  );
});

test("iOS pins the same line as a section header", () => {
  assert.match(chat, /pinnedViews: \[.sectionHeaders\]/);
  assert.match(chat, /DaySeparator\.groups\(/);
  const header = chat.indexOf("if let dayLabel = group.label");
  assert.ok(header >= 0);
  const band = chat.slice(header, header + 700);
  assert.match(band, /Text\(dayLabel\)/);
  assert.match(band, /\.font\(\.system\(size: 12\)\)/);
  assert.match(band, /\.foregroundStyle\(\.secondary\)/);
  assert.match(band, /\.accessibilityAddTraits\(\.isHeader\)/);
  assert.match(band, /Color\(uiColor: \.systemBackground\)/);
  assert.doesNotMatch(band, /withAnimation/);
  assert.doesNotMatch(band, /animation\(/);
  const divider = chat.indexOf("NewMessagesDivider()");
  const row = chat.indexOf("transcriptItem(", divider);
  assert.ok(divider >= 0 && divider < row && row < header);
});

test("OpenAPI stays 0.18.0; roadmap + CI; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ci, /python3 ios\/scripts\/test_ios_sticky_day\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(src, /fetch\(/);
});
