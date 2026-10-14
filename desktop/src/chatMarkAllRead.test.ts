// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FILTER_UNREAD,
  UNREAD_EMPTY_LABEL,
  rosterForFilter,
  showUnreadEmpty,
} from "./chatListFilter.ts";
import {
  CHAT_UNREAD_KEY,
  ChatUnread,
  MARK_ALL_READ_LABEL,
  anyChatUnread,
  rowShowsUnreadDot,
  type UnreadStorage,
} from "./chatUnread.ts";
import { APP_TITLE, unreadChrome, unreadReplyCount } from "./unreadOutside.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatUnread.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatUnread.swift"),
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
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE =
  "v1.01 mark all as read (when one or more chats are unread, a muted Mark all as read control sits under the All / Unread control in the sidebar, and the iOS chat list shows the same control in its toolbar; using it clears every unread dot, including archived chats and channel handoff dots, so the window title and badge count go to zero and the Unread filter shows No unread chats; the control is hidden when nothing is unread; the clear uses the existing unread persistence; pins stay; no keyboard shortcut; no new HTTP)";

class MemoryStorage implements UnreadStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

const rows = [
  { id: "live", name: "Snorlax" },
  { id: "archived", name: "Old" },
  { id: "channel", name: "Room" },
];

test("the control is hidden until a chat is unread", () => {
  assert.equal(MARK_ALL_READ_LABEL, "Mark all as read");
  assert.equal(anyChatUnread(new Set(), new Set()), false);
  assert.equal(anyChatUnread(new Set([""]), new Set([""])), false);
  assert.equal(anyChatUnread(new Set(["live"]), new Set()), true);
  assert.equal(anyChatUnread(new Set(), new Set(["channel"])), true);
  assert.equal(anyChatUnread(new Set(["archived"]), new Set()), true);
});

test("mark all clears archived chats and handoff dots, then the badge is zero", () => {
  const memory = new MemoryStorage();
  const unread = new ChatUnread(memory);
  assert.equal(unread.mark("live"), true);
  assert.equal(unread.mark("archived"), true);
  const handoff = new Set(["channel"]);
  assert.equal(anyChatUnread(unread.snapshot(), handoff), true);
  assert.equal(unreadReplyCount(unread.snapshot()), 2);

  const pins = ["live", "archived"];
  assert.equal(unread.clearAll(), true);
  assert.equal(unread.clearAll(), false);
  const handoffAfter = new Set<string>();
  assert.equal(anyChatUnread(unread.snapshot(), handoffAfter), false);
  assert.equal(unread.has("live"), false);
  assert.equal(unread.has("archived"), false);
  assert.equal(unreadReplyCount(unread.snapshot()), 0);
  assert.deepEqual(unreadChrome(unread.snapshot()), {
    title: APP_TITLE,
    badge: null,
  });
  assert.equal(memory.getItem(CHAT_UNREAD_KEY), "[]");
  assert.equal(new ChatUnread(memory).snapshot().size, 0);
  assert.deepEqual(pins, ["live", "archived"]);

  const visible = rosterForFilter(rows, FILTER_UNREAD, (row) =>
    rowShowsUnreadDot(row.id, unread.snapshot(), handoffAfter),
  );
  assert.deepEqual(visible, []);
  assert.equal(showUnreadEmpty(FILTER_UNREAD, visible.length), true);
  assert.equal(UNREAD_EMPTY_LABEL, "No unread chats");
});

test("a handoff-only dot still offers the control and leaves with it", () => {
  const memory = new MemoryStorage();
  const unread = new ChatUnread(memory);
  const handoff = new Set(["channel"]);
  assert.equal(anyChatUnread(unread.snapshot(), handoff), true);
  assert.equal(unread.clearAll(), false);
  assert.equal(memory.getItem(CHAT_UNREAD_KEY), null);
  const cleared = new Set<string>();
  assert.equal(anyChatUnread(unread.snapshot(), cleared), false);
  assert.equal(unreadReplyCount(unread.snapshot()), 0);
  assert.equal(unreadChrome(unread.snapshot()).badge, null);
  const visible = rosterForFilter(rows, FILTER_UNREAD, (row) =>
    rowShowsUnreadDot(row.id, unread.snapshot(), cleared),
  );
  assert.deepEqual(visible, []);
});

test("the sidebar shows the control and does not add a shortcut or HTTP", () => {
  const markAll = sliceFn(app, "function onMarkAllRead(", "function retainPins(");
  assert.match(markAll, /chatUnread\.current\.clearAll\(\)/);
  assert.match(markAll, /setUnreadIds\(\(prev\) => \(prev\.size === 0 \? prev : new Set<string>\(\)\)\)/);
  assert.match(markAll, /publishReplyUnread\(\)/);
  assert.doesNotMatch(markAll, /toggleChatPin|writeChatPins|writeChatArchives|chooseChatListFilter/);
  assert.doesNotMatch(markAll, /fetch\(/);

  assert.match(app, /anyChatUnread\(replyUnreadIds, unreadIds\)/);
  assert.match(app, /className="roster-mark-all"/);
  assert.match(app, /onClick=\{onMarkAllRead\}/);
  assert.match(app, /\{MARK_ALL_READ_LABEL\}/);
  assert.match(app, /showUnreadEmpty\(chatListFilter, unreadRosterCount\)/);
  assert.match(app, /\{UNREAD_EMPTY_LABEL\}/);
  assert.match(app, /void applyUnreadChrome\(unreadChrome\(replyUnreadIds\)\)/);

  const paint = block(".roster-mark-all button");
  assert.match(paint, /color: var\(--text-muted\)/);
  assert.match(paint, /font-size: 12px/);
  assert.doesNotMatch(paint, /transition|animation/);
  assert.match(css, /v1\.01: muted Mark all as read/);

  assert.doesNotMatch(shortcuts, /Mark all as read/);
  assert.doesNotMatch(iosShortcuts, /Mark all as read/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let markAllReadLabel = "Mark all as read"/);
  assert.match(swift, /static func anyChatUnread/);
  assert.match(swift, /func clearAll\(\) -> Bool/);
  assert.match(swift, /static let storageKey = "snorlax.chatUnread"/);
  assert.match(swift, /No new storage key/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatUnread\.markAllReadLabel/);
  assert.match(list, /model\.hasAnyUnreadChat/);
  assert.match(list, /model\.markAllChatsRead\(\)/);
  assert.match(list, /placement: \.topBarLeading/);
  assert.match(list, /\.foregroundStyle\(\.secondary\)/);
  assert.match(model, /func markAllChatsRead\(\)/);
  assert.match(model, /chatUnread\.clearAll\(\)/);
  assert.match(model, /unreadChannelIDs = \[\]/);
  assert.match(model, /publishReplyUnread\(\)/);
  assert.match(model, /var hasAnyUnreadChat: Bool/);
  assert.doesNotMatch(list, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(pkg, /chatMarkAllRead\.test\.ts/);
  assert.match(ci, /test_ios_mark_all_read\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.01 /);
  assert.match(roadmap, /mark all as read(?:\)| \+)/);
  assert.match(spec, /## 101\. v1\.01/);
  assert.match(spec, /including ids for archived chats/);
});
