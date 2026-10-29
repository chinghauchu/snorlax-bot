// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EARLIER_FAILED_LABEL,
  EARLIER_LOCAL_PREFIX,
  EARLIER_PAGE_SIZE,
  LOADING_EARLIER_LABEL,
  LOAD_EARLIER_LABEL,
  applyEarlierPage,
  earlierCursor,
  mergeLatestPage,
  pageMayHaveEarlier,
  showEarlierControl,
} from "./earlierMessages.ts";
import { OPTIMISTIC_ID_PREFIX } from "./optimisticSend.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const api = readFileSync(join(here, "api.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "earlierMessages.ts"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "EarlierMessages.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE = "v2.14 load earlier messages";

function row(id: string, createdAt: string) {
  return { id, createdAt };
}

test("a full page offers earlier messages and a short page does not", () => {
  assert.equal(EARLIER_PAGE_SIZE, 100);
  assert.equal(pageMayHaveEarlier(99), false);
  assert.equal(pageMayHaveEarlier(100), true);
  assert.equal(pageMayHaveEarlier(0), false);
  assert.equal(showEarlierControl(true, 100), true);
  assert.equal(showEarlierControl(true, 0), false);
  assert.equal(showEarlierControl(false, 40), false);
});

test("the cursor is the oldest server message, not a local bubble", () => {
  assert.equal(EARLIER_LOCAL_PREFIX, OPTIMISTIC_ID_PREFIX);
  assert.equal(
    earlierCursor([
      { id: "local-1" },
      { id: "m-old" },
      { id: "m-new" },
    ]),
    "m-old",
  );
  assert.equal(earlierCursor([{ id: "local-only" }]), null);
  assert.equal(earlierCursor([]), null);
});

test("an older page is prepended once and a short page ends the history", () => {
  const existing = [row("m3", "2026-01-03"), row("m4", "2026-01-04")];
  const full = applyEarlierPage(
    existing,
    [row("m1", "2026-01-01"), row("m2", "2026-01-02"), row("m3", "2026-01-03")],
    3,
  );
  assert.deepEqual(
    full.rows.map((item) => item.id),
    ["m1", "m2", "m3", "m4"],
  );
  assert.equal(full.added, 2);
  assert.equal(full.mayHaveEarlier, true);
  assert.equal(full.revealId, "m1");

  const again = applyEarlierPage(full.rows, [row("m1", "2026-01-01")], 1);
  assert.equal(again.added, 0);
  assert.equal(again.mayHaveEarlier, false);
  assert.deepEqual(
    again.rows.map((item) => item.id),
    ["m1", "m2", "m3", "m4"],
  );

  const tail = applyEarlierPage(existing, [row("m0", "2025-12-31")], 3);
  assert.equal(tail.added, 1);
  assert.equal(tail.mayHaveEarlier, false);
});

test("a latest-page refresh keeps loaded history and drops a replaced tail", () => {
  const existing = [
    row("m1", "2026-01-01"),
    row("m2", "2026-01-02"),
    row("m3", "2026-01-03"),
    row("old-reply", "2026-01-04"),
    row("local-failed", "2026-01-05"),
  ];
  const latest = [
    row("m2", "2026-01-02"),
    row("m3", "2026-01-03"),
    row("new-reply", "2026-01-06"),
  ];
  assert.deepEqual(
    mergeLatestPage(existing, latest).map((item) => item.id),
    ["m1", "m2", "m3", "new-reply"],
  );
  assert.deepEqual(
    mergeLatestPage(
      [row("a", "2026-01-01"), row("b", "2026-01-02")],
      [row("a", "2026-01-01"), row("b", "2026-01-02"), row("c", "2026-01-03")],
    ).map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    mergeLatestPage(existing, []).map((item) => item.id),
    ["m1", "m2", "m3", "old-reply"],
  );
  const shifted = mergeLatestPage(
    [row("early", "2026-01-01T00:00:00Z")],
    [row("later", "2026-01-02T00:00:00Z")],
  );
  assert.deepEqual(
    shifted.map((item) => item.id),
    ["early", "later"],
  );
});

test("desktop and iOS share the control and the existing before cursor", () => {
  assert.equal(LOAD_EARLIER_LABEL, "Load earlier messages");
  assert.equal(LOADING_EARLIER_LABEL, "Loading earlier messages");
  assert.equal(EARLIER_FAILED_LABEL, "Couldn't load earlier messages");
  assert.match(swift, /static let label = "Load earlier messages"/);
  assert.match(swift, /static let loadingLabel = "Loading earlier messages"/);
  assert.match(swift, /static let failedLabel = "Couldn't load earlier messages"/);
  assert.match(swift, /static let pageSize = 100/);
  assert.match(swift, /static func mergeEarlier/);
  assert.match(swift, /static func mergeLatest/);
  assert.match(swift, /static func stillHasEarlier/);
  assert.match(swift, /static func pageMayHaveEarlier/);
  assert.match(model, /func loadEarlier\(\)/);
  assert.match(model, /noteFreshEarlier/);
  assert.match(model, /listedKeepingEarlier/);
  assert.match(model, /earlierHold = true/);
  assert.match(chat, /EarlierMessages\.label/);
  assert.match(chat, /EarlierMessages\.loadingLabel/);
  assert.match(chat, /EarlierMessages\.failedLabel/);
  assert.match(chat, /model\.loadEarlier\(\)/);
  assert.match(chat, /model\.earlierHold/);
  assert.match(chat, /scrollTo\(edge: \.top\)/);
  assert.match(chat, /disablesAnimations = true/);
  assert.match(app, /LOAD_EARLIER_LABEL/);
  assert.match(app, /LOADING_EARLIER_LABEL/);
  assert.match(app, /EARLIER_FAILED_LABEL/);
  assert.match(app, /className="load-earlier"/);
  assert.match(app, /void loadEarlier\(\)/);
  assert.match(app, /applyEarlierPage/);
  assert.match(app, /mergeLatestPage/);
  assert.match(app, /earlierHoldRef/);
  assert.match(app, /scrollTop = 0/);
  assert.match(api, /params\.set\("before", opts\.before\)/);
  assert.match(api, /params\.set\("limit", String\(opts\.limit\)\)/);
  assert.match(src, /No new HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.equal(src.includes("computerPane.ts"), false);
  const block = css.slice(css.indexOf(".load-earlier {"), css.indexOf(".transcript-line {"));
  assert.ok(block.includes(".load-earlier"));
  assert.equal(block.includes("transition"), false);
  assert.equal(block.includes("animation"), false);
});

test("docs keep OpenAPI 0.18.0 and the messages before cursor", () => {
  for (const body of [openapi, protocol, runtimeOpenapi]) {
    assert.match(body, /version: 0\.18\.0/);
    assert.match(body, /name: before/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
  assert.match(ci, /test_ios_earlier_messages\.py/);
  assert.match(pkg, /src\/earlierMessages\.test\.ts/);
  assert.equal(src.includes("/v1/"), true);
});
