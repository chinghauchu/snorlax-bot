// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CHAT_LIST_NOW,
  CHAT_LIST_TIME_TICK_MS,
  CHAT_LIST_YESTERDAY,
  applyFinishedActivity,
  chatListTimeLabel,
  latestMessageAt,
  rememberChatActivity,
  retainChatActivity,
} from "./chatListTime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatListTime.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
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
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatListTime.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);

const PHRASE =
  "v0.83 sidebar relative time (a compact time beside each chat's last-message preview, from that chat's latest message already in memory; now, 5m, 3h, Yesterday, the weekday name within the past week, then a short date like Oct 3; a light timer refreshes it as time passes; a new message updates it; empty chats show no time; the iOS chat list matches; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

const now = new Date(2026, 9, 9, 16, 0, 0);

test("now, minutes, hours, Yesterday, weekday, then a short date", () => {
  assert.equal(CHAT_LIST_NOW, "now");
  assert.equal(CHAT_LIST_YESTERDAY, "Yesterday");
  assert.equal(CHAT_LIST_TIME_TICK_MS, 30_000);

  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 15, 59, 30), now), "now");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 16, 0, 0), now), "now");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 16, 0, 20), now), "now");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 15, 59, 0), now), "1m");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 15, 55, 0), now), "5m");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 15, 0, 1), now), "59m");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 15, 0, 0), now), "1h");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 13, 0, 0), now), "3h");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 9, 0, 0, 0), now), "16h");

  const early = new Date(2026, 9, 9, 1, 0, 0);
  assert.equal(chatListTimeLabel(new Date(2026, 9, 8, 23, 0, 0), early), "Yesterday");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 8, 23, 59, 0), now), "Yesterday");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 7, 12, 0, 0), now), "Wednesday");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 3, 8, 0, 0), now), "Saturday");
  assert.equal(chatListTimeLabel(new Date(2026, 9, 2, 8, 0, 0), now), "Oct 2");
  assert.equal(chatListTimeLabel(new Date(2026, 0, 1, 8, 1, 0), now), "Jan 1");
  assert.equal(
    chatListTimeLabel(new Date(2025, 9, 3, 8, 0, 0), now),
    "Oct 3, 2025",
  );
  assert.equal(chatListTimeLabel(new Date(2026, 9, 10, 1, 0, 0), now), "now");

  const iso = new Date(2026, 9, 9, 13, 0, 0);
  assert.equal(chatListTimeLabel(iso.toISOString(), now), "3h");
  assert.equal(chatListTimeLabel("", now), null);
  assert.equal(chatListTimeLabel(null, now), null);
  assert.equal(chatListTimeLabel(undefined, now), null);
  assert.equal(chatListTimeLabel("not-a-date", now), null);
});

test("the latest message owns the stamp; a new one replaces it", () => {
  const older = new Date(2026, 9, 9, 12, 0, 0).toISOString();
  const newer = new Date(2026, 9, 9, 15, 55, 0).toISOString();
  assert.equal(latestMessageAt([]), null);
  assert.equal(latestMessageAt([{ createdAt: "" }, { createdAt: "nope" }]), null);
  assert.equal(
    latestMessageAt([{ createdAt: older }, { createdAt: newer }]),
    newer,
  );
  assert.equal(
    latestMessageAt([{ createdAt: newer }, { createdAt: null }]),
    newer,
  );

  const first = rememberChatActivity({}, "a", [{ createdAt: older }]);
  assert.deepEqual(first, { a: older });
  assert.equal(chatListTimeLabel(first.a, now), "4h");
  const updated = rememberChatActivity(first, "a", [
    { createdAt: older },
    { createdAt: newer },
  ]);
  assert.equal(updated.a, newer);
  assert.equal(chatListTimeLabel(updated.a, now), "5m");
  assert.equal(
    rememberChatActivity(updated, "a", [{ createdAt: newer }]),
    updated,
  );
  assert.deepEqual(rememberChatActivity(updated, "a", []), {});
  assert.equal(rememberChatActivity(updated, "", [{ createdAt: newer }]), updated);

  const finished = applyFinishedActivity(first, "a", newer);
  assert.equal(finished.a, newer);
  assert.equal(applyFinishedActivity(finished, "a", older), finished);
  assert.equal(applyFinishedActivity(finished, "a", "nope"), finished);
  assert.equal(applyFinishedActivity(finished, "", newer), finished);
  const other = applyFinishedActivity(finished, "b", older);
  assert.deepEqual(other, { a: newer, b: older });

  assert.deepEqual(retainChatActivity(other, new Set(["a"])), { a: newer });
  const kept = { a: newer };
  assert.equal(retainChatActivity(kept, new Set(["a"])), kept);
});

test("sidebar time sits on the preview row; OpenAPI stays 0.18.0", () => {
  const meta = block(".row-meta");
  assert.match(meta, /display:\s*flex/);
  assert.match(meta, /min-width:\s*0/);
  const preview = block(".row-preview");
  assert.match(preview, /flex:\s*1/);
  assert.match(preview, /min-width:\s*0/);
  assert.match(preview, /text-overflow:\s*ellipsis/);
  const time = block(".row-time");
  assert.match(time, /font-size:\s*12px/);
  assert.match(time, /color:\s*var\(--text-muted\)/);
  assert.match(time, /white-space:\s*nowrap/);
  assert.match(time, /margin-left:\s*auto/);
  assert.doesNotMatch(time, /transition/);
  assert.doesNotMatch(time, /animation/);

  assert.match(app, /from "\.\/chatListTime"/);
  assert.match(app, /className="row-meta"/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /dateTime=\{stamp\}/);
  assert.match(app, /chatListTimeLabel\(stamp, activityNow\)/);
  assert.match(app, /rememberChatActivity\(/);
  assert.match(app, /applyFinishedActivity\(/);
  assert.match(app, /retainChatActivity\(/);
  assert.match(app, /CHAT_LIST_TIME_TICK_MS/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /message\.createdAt/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let nowLabel = "now"/);
  assert.match(swift, /static let yesterdayLabel = "Yesterday"/);
  assert.match(swift, /static let tickSeconds: TimeInterval = 30/);
  assert.match(swift, /elapsed < 60 \|\| days < 0/);
  assert.match(swift, /days == 0/);
  assert.match(swift, /days == 1/);
  assert.match(swift, /\(2\.\.\.6\)\.contains\(days\)/);
  assert.match(swift, /No new HTTP/);
  assert.match(list, /ChatListTime\.label\(/);
  assert.match(list, /ChatListTime\.tickSeconds/);
  assert.match(list, /TimelineView\(\.periodic/);
  assert.match(list, /chatActivity\[agentId\]/);
  assert.match(list, /model\.chatPreviews\[agent\.id\]/);
  assert.match(model, /storeChatActivity\(/);
  assert.match(model, /noteFinishedActivity\(/);
  assert.match(model, /messages\.last\?\.createdAt/);
  assert.match(model, /chatActivity = chatActivity\.filter/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(pkg, /chatListTime\.test\.ts/);
  assert.match(ci, /test_ios_chat_list_time\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.83 /);
  assert.match(roadmap, /sidebar relative time/);
});
