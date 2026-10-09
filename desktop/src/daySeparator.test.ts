// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DAY_TODAY,
  DAY_YESTERDAY,
  daySeparatorLabel,
  daySeparatorLabels,
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
  "v0.67 day separators (a muted Today / Yesterday / weekday / date line above the first message of each local day; collapsed tool lines do not count; no animation; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

const now = new Date(2026, 9, 9, 16, 0, 0);

test("Today, Yesterday, weekday, and older dates", () => {
  assert.equal(DAY_TODAY, "Today");
  assert.equal(DAY_YESTERDAY, "Yesterday");
  assert.equal(daySeparatorLabel(new Date(2026, 9, 9, 15, 4, 0), now), "Today");
  assert.equal(daySeparatorLabel(new Date(2026, 9, 9, 0, 0, 0), now), "Today");
  assert.equal(daySeparatorLabel(new Date(2026, 9, 8, 23, 59, 0), now), "Yesterday");
  assert.equal(daySeparatorLabel(new Date(2026, 9, 7, 12, 0, 0), now), "Wednesday");
  assert.equal(daySeparatorLabel(new Date(2026, 9, 3, 8, 0, 0), now), "Saturday");
  assert.equal(daySeparatorLabel(new Date(2026, 9, 2, 8, 0, 0), now), "Oct 2");
  assert.equal(daySeparatorLabel(new Date(2026, 0, 1, 8, 1, 0), now), "Jan 1");
  assert.equal(
    daySeparatorLabel(new Date(2025, 9, 8, 15, 4, 0), now),
    "Oct 8, 2025",
  );
  assert.equal(daySeparatorLabel(new Date(2026, 9, 10, 1, 0, 0), now), "Oct 10");
  const iso = new Date(2026, 9, 9, 15, 4, 0);
  assert.equal(daySeparatorLabel(iso.toISOString(), now), "Today");
  assert.equal(daySeparatorLabel("", now), null);
  assert.equal(daySeparatorLabel(null, now), null);
  assert.equal(daySeparatorLabel(undefined, now), null);
  assert.equal(daySeparatorLabel("not-a-date", now), null);
});

test("first painted row of each day; collapsed tools do not count", () => {
  const oct8 = new Date(2026, 9, 8, 11, 0, 0);
  const oct9a = new Date(2026, 9, 9, 9, 0, 0);
  const oct9b = new Date(2026, 9, 9, 10, 0, 0);
  assert.deepEqual(
    daySeparatorLabels(
      [{ createdAt: oct9a }, { createdAt: oct9b }],
      now,
    ),
    ["Today", null],
  );
  assert.deepEqual(
    daySeparatorLabels(
      [
        { createdAt: oct8 },
        { createdAt: oct9a, hidden: true },
        { createdAt: oct9b },
      ],
      now,
    ),
    ["Yesterday", null, "Today"],
  );
  assert.deepEqual(
    daySeparatorLabels(
      [{ createdAt: "nope" }, { createdAt: oct8 }, { createdAt: oct9a }],
      now,
    ),
    [null, "Yesterday", "Today"],
  );
  assert.deepEqual(
    daySeparatorLabels([{ createdAt: oct9a, hidden: true }], now),
    [null],
  );
});

test("desktop line is 12px muted, centered, and does not animate", () => {
  const line = block(".day-separator");
  assert.match(line, /font-size:\s*12px/);
  assert.match(line, /color:\s*var\(--text-muted\)/);
  assert.match(line, /text-align:\s*center/);
  assert.match(line, /align-self:\s*stretch/);
  assert.doesNotMatch(line, /transition/);
  assert.doesNotMatch(line, /animation/);
  assert.match(src, /No animation/);
  assert.match(swift, /No animation/);
  assert.match(swift, /days == 0/);
  assert.match(swift, /days == 1/);
  assert.match(swift, /\(2\.\.\.6\)\.contains\(days\)/);
  assert.match(swift, /todayLabel = "Today"/);
  assert.match(swift, /yesterdayLabel = "Yesterday"/);

  assert.match(app, /from "\.\/daySeparator"/);
  assert.match(app, /daySeparatorLabels\(/);
  assert.match(app, /hidden: hidePersistedTool\(/);
  assert.match(app, /className="day-separator"/);
  assert.match(app, /role="heading"/);
  assert.match(app, /aria-level=\{2\}/);
  assert.match(app, /className="jump-latest"/);
  assert.match(chat, /DaySeparator\.labels\(/);
  assert.match(chat, /DaySeparator\.Row\(/);
  assert.match(chat, /hidden: CompactToolTraces\.hidePersisted\(/);
  assert.match(chat, /Text\(dayLabel\)/);
  assert.match(chat, /\.font\(\.system\(size: 12\)\)/);
  assert.match(chat, /\.foregroundStyle\(\.secondary\)/);
  assert.match(chat, /\.accessibilityAddTraits\(\.isHeader\)/);
  assert.match(chat, /className="jump-latest"|StickToBottom\.jumpLabel/);
});

test("OpenAPI stays 0.18.0; roadmap + CI; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ci, /python3 ios\/scripts\/test_ios_day_separator\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /withAnimation/);
});
