// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  APP_TITLE,
  applyUnreadChrome,
  unreadBadgeCount,
  unreadChrome,
  unreadOutsideTitle,
  unreadReplyCount,
} from "./unreadOutside.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "unreadOutside.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "UnreadOutside.swift"),
  "utf8",
);
const content = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ContentView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const rust = readFileSync(
  join(here, "..", "src-tauri", "src", "main.rs"),
  "utf8",
);
const caps = readFileSync(
  join(here, "..", "src-tauri", "capabilities", "default.json"),
  "utf8",
);

const PHRASE =
  "v0.77 unread count outside the chat list (when one or more chats carry the v0.70 unread dot, the desktop window title reads (2) Snorlax-Bot and the dock or taskbar badge shows that count where Tauri supports it; both clear when nothing is unread; the iOS chat list title shows the same count; the app icon badge shows it only when badge permission is already granted; no new HTTP)";

test("the title and badge follow the unread-dot count", () => {
  assert.equal(APP_TITLE, "Snorlax-Bot");
  assert.equal(unreadReplyCount(new Set()), 0);
  assert.equal(unreadReplyCount(new Set(["", "agent-a"])), 1);
  assert.equal(unreadReplyCount(new Set(["agent-a", "agent-b"])), 2);
  assert.equal(unreadOutsideTitle(0), "Snorlax-Bot");
  assert.equal(unreadOutsideTitle(-1), "Snorlax-Bot");
  assert.equal(unreadOutsideTitle(Number.NaN), "Snorlax-Bot");
  assert.equal(unreadOutsideTitle(2), "(2) Snorlax-Bot");
  assert.equal(unreadOutsideTitle(2.9), "(2) Snorlax-Bot");
  assert.equal(unreadBadgeCount(0), null);
  assert.equal(unreadBadgeCount(2), 2);
  assert.deepEqual(unreadChrome(new Set(["b", "a"])), {
    title: "(2) Snorlax-Bot",
    badge: 2,
  });
  assert.deepEqual(unreadChrome(new Set()), {
    title: "Snorlax-Bot",
    badge: null,
  });
});

test("chrome sets the title and asks Tauri for the badge", async () => {
  const doc = { title: "old" };
  const calls: Array<[string, Record<string, unknown>]> = [];
  await applyUnreadChrome(
    unreadChrome(new Set(["agent-a", "agent-b"])),
    doc,
    async (cmd, args) => {
      calls.push([cmd, args]);
    },
  );
  assert.equal(doc.title, "(2) Snorlax-Bot");
  assert.deepEqual(calls, [
    ["set_unread_chrome", { title: "(2) Snorlax-Bot", badge: 2 }],
  ]);

  calls.length = 0;
  await applyUnreadChrome(unreadChrome(new Set()), doc, async (cmd, args) => {
    calls.push([cmd, args]);
  });
  assert.equal(doc.title, "Snorlax-Bot");
  assert.deepEqual(calls, [
    ["set_unread_chrome", { title: "Snorlax-Bot", badge: 0 }],
  ]);

  await applyUnreadChrome(
    unreadChrome(new Set(["agent-a"])),
    doc,
    async () => {
      throw new Error("unsupported");
    },
  );
  assert.equal(doc.title, "(1) Snorlax-Bot");

  const quiet = { title: "stay" };
  await applyUnreadChrome(unreadChrome(new Set(["agent-a"])), quiet, null);
  assert.equal(quiet.title, "(1) Snorlax-Bot");
});

test("desktop and iOS read the v0.70 unread set, not handoff", () => {
  assert.match(app, /from "\.\/unreadOutside"/);
  assert.match(
    app,
    /applyUnreadChrome\(unreadChrome\(replyUnreadIds\)\)/,
  );
  assert.doesNotMatch(app, /unreadChrome\(unreadIds\)/);
  assert.match(rust, /fn set_unread_chrome/);
  assert.match(rust, /set_title/);
  assert.match(rust, /set_badge_count/);
  assert.match(caps, /allow-set-unread-chrome/);

  assert.match(swift, /static let appName = "Snorlax-Bot"/);
  assert.match(swift, /iconBadgeAllowed/);
  assert.match(swift, /authorizationStatus == \.authorized/);
  assert.match(swift, /badgeSetting == \.enabled/);
  assert.match(swift, /setBadgeCount/);
  assert.doesNotMatch(swift, /requestAuthorization/);
  assert.equal(
    (content.match(/UnreadOutside\.title\(count: UnreadOutside\.count\(model\.replyUnreadIDs\)\)/g) ??
      []).length,
    2,
  );
  assert.doesNotMatch(content, /navigationTitle\("Snorlax-Bot"\)/);
  assert.match(model, /publishReplyUnread\(\)/);
  assert.match(model, /UnreadOutside\.applyIconBadge/);
  assert.doesNotMatch(model, /requestAuthorization/);
  assert.doesNotMatch(model, /unreadChannelIDs\.count/);
});

test("OpenAPI stays 0.18.0; count is local; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /unreadOutside\.test\.ts/);
  assert.match(ci, /test_ios_unread_outside\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
