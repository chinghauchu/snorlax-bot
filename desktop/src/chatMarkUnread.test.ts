// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FILTER_UNREAD, rosterForFilter } from "./chatListFilter.ts";
import { groupPinnedChats } from "./chatPins.ts";
import {
  CHAT_UNREAD_KEY,
  ChatUnread,
  MARK_READ_LABEL,
  MARK_UNREAD_LABEL,
  rowShowsUnreadDot,
  unreadActionLabel,
  type UnreadStorage,
} from "./chatUnread.ts";
import { unreadReplyCount } from "./unreadOutside.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatUnread.ts"), "utf8");
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

const PHRASE =
  "v0.90 mark a chat unread (right-click a sidebar chat row offers Mark as unread on a read chat and Mark as read on one that shows the v0.70 unread dot; marking unread paints that same accent dot, counts toward the unread count outside the chat list, and shows the chat under the Unread filter; opening the chat clears it; the mark uses the existing unread persistence; iOS trailing swipe and long-press offer the same action; pinned rows stay pinned; no new HTTP)";

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

const rows = [
  { id: "seed", name: "Snorlax" },
  { id: "channel", name: "Room" },
  { id: "other", name: "Mew" },
  { id: "late", name: "Pikachu" },
];

test("a read row offers Mark as unread; a dotted row offers Mark as read", () => {
  assert.equal(MARK_UNREAD_LABEL, "Mark as unread");
  assert.equal(MARK_READ_LABEL, "Mark as read");
  assert.equal(unreadActionLabel(false), "Mark as unread");
  assert.equal(unreadActionLabel(true), "Mark as read");
  assert.equal(rowShowsUnreadDot("", new Set(["a"]), new Set(["a"])), false);
  assert.equal(rowShowsUnreadDot("seed", new Set(), new Set()), false);
  assert.equal(rowShowsUnreadDot("seed", new Set(["seed"]), new Set()), true);
  assert.equal(rowShowsUnreadDot("channel", new Set(), new Set(["channel"])), true);
  assert.equal(
    unreadActionLabel(rowShowsUnreadDot("seed", new Set(), new Set())),
    "Mark as unread",
  );
  assert.equal(
    unreadActionLabel(rowShowsUnreadDot("seed", new Set(["seed"]), new Set())),
    "Mark as read",
  );
  assert.equal(
    unreadActionLabel(
      rowShowsUnreadDot("channel", new Set(), new Set(["channel"])),
    ),
    "Mark as read",
  );
});

test("mark unread persists in the existing set, counts, and joins Unread", () => {
  const memory = new MemoryStorage();
  const unread = new ChatUnread(memory);
  assert.equal(unread.mark("other"), true);
  assert.equal(unread.mark("other"), false);
  assert.equal(memory.getItem(CHAT_UNREAD_KEY)?.includes("other"), true);

  const revived = new ChatUnread(memory);
  assert.equal(revived.has("other"), true);
  assert.equal(unreadReplyCount(revived.snapshot()), 1);

  const pins = ["other", "seed"];
  const visible = rosterForFilter(rows, FILTER_UNREAD, (row) =>
    rowShowsUnreadDot(row.id, revived.snapshot(), new Set()),
  );
  const grouped = groupPinnedChats(visible, pins, (row) => row.id);
  assert.deepEqual(
    grouped.pinned.map((row) => row.id),
    ["other"],
  );
  assert.deepEqual(grouped.rest, []);
  assert.deepEqual(pins, ["other", "seed"]);

  // Opening the chat clears the same set.
  assert.equal(revived.clear("other"), true);
  assert.equal(revived.has("other"), false);
  assert.equal(unreadReplyCount(revived.snapshot()), 0);
  assert.equal(new ChatUnread(memory).has("other"), false);
  const afterOpen = rosterForFilter(rows, FILTER_UNREAD, (row) =>
    rowShowsUnreadDot(row.id, revived.snapshot(), new Set()),
  );
  assert.deepEqual(afterOpen, []);
});

test("mark as read clears a reply dot and a channel handoff dot", () => {
  const reply = new Set(["other"]);
  const handoff = new Set(["channel"]);
  assert.equal(rowShowsUnreadDot("other", reply, handoff), true);
  assert.equal(rowShowsUnreadDot("channel", reply, handoff), true);
  assert.equal(rowShowsUnreadDot("seed", reply, handoff), false);

  const readReply = new Set(reply);
  readReply.delete("other");
  const readHandoff = new Set(handoff);
  readHandoff.delete("channel");
  assert.equal(rowShowsUnreadDot("other", readReply, readHandoff), false);
  assert.equal(rowShowsUnreadDot("channel", readReply, readHandoff), false);
  assert.equal(unreadReplyCount(readReply), 0);

  const memory = new MemoryStorage();
  const unread = new ChatUnread(memory);
  unread.mark("other");
  unread.mark("channel");
  assert.equal(unreadReplyCount(unread.snapshot()), 2);
  unread.clear("channel");
  assert.equal(unread.has("channel"), false);
  assert.equal(unread.has("other"), true);
  assert.equal(unreadReplyCount(unread.snapshot()), 1);
  const stillPinned = groupPinnedChats(
    rosterForFilter(rows, FILTER_UNREAD, (row) =>
      rowShowsUnreadDot(row.id, unread.snapshot(), new Set()),
    ),
    ["channel", "other"],
    (row) => row.id,
  );
  assert.deepEqual(
    stillPinned.pinned.map((row) => row.id),
    ["other"],
  );
});

test("the context menu marks unread without moving pins or adding HTTP", () => {
  const toggle = sliceFn(app, "function onToggleRead(", "function retainPins(");
  assert.match(toggle, /rowShowsUnreadDot\(id, replyUnreadIds, unreadIds\)/);
  assert.match(toggle, /chatUnread\.current\.clear\(id\)/);
  assert.match(toggle, /chatUnread\.current\.mark\(id\)/);
  assert.match(toggle, /publishReplyUnread\(\)/);
  assert.match(toggle, /next\.delete\(id\)/);
  assert.doesNotMatch(toggle, /toggleChatPin/);
  assert.doesNotMatch(toggle, /writeChatPins/);
  assert.doesNotMatch(toggle, /fetch\(/);

  const load = sliceFn(
    app,
    "async function loadConversation(",
    "async function selectAgent(",
  );
  assert.match(load, /clearReplyUnread\(id\)/);

  assert.match(app, /pinActionLabel\(isChatPinned\(pinnedChatIds, contextMenu\.agent\.id\)\)/);
  assert.match(app, /onClick=\{\(\) => onToggleRead\(contextMenu\.agent\.id\)\}/);
  assert.match(app, /unreadActionLabel\(\s*rowShowsUnreadDot\(/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /groupPinnedChats\(\s*rosterAgents/);
  assert.match(app, /void applyUnreadChrome\(unreadChrome\(replyUnreadIds\)\)/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let markUnreadLabel = "Mark as unread"/);
  assert.match(swift, /static let markReadLabel = "Mark as read"/);
  assert.match(swift, /showsDot \? markReadLabel : markUnreadLabel/);
  assert.match(swift, /static let storageKey = "snorlax.chatUnread"/);
  assert.match(swift, /if channel, handoffUnread.contains\(chatId\)/);
  assert.match(swift, /No new storage key/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatUnread\.actionLabel\(showsDot: model\.showsUnreadDot\(agent\)\)/);
  assert.match(list, /swipeActions\(edge: \.trailing/);
  assert.match(list, /model\.toggleChatRead\(agent\.id\)/);
  assert.match(list, /systemImage: "envelope\.badge"/);
  assert.match(list, /Button\(ChatUnread\.actionLabel\(showsDot: unread\), action: onRead\)/);
  assert.match(list, /ChatPins\.label\(pinned: model\.isChatPinned\(agent\.id\)\)/);
  assert.match(list, /swipeActions\(edge: \.leading/);
  assert.match(model, /func toggleChatRead\(_ id: String\)/);
  assert.match(model, /chatUnread\.mark\(id\)/);
  assert.match(model, /chatUnread\.clear\(id\)/);
  assert.match(model, /unreadChannelIDs\.remove\(id\)/);
  assert.match(model, /publishReplyUnread\(\)/);
  assert.match(model, /clearReplyUnread\(id\)/);
  assert.match(model, /func toggleChatPin\(_ id: String\)/);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /chatMarkUnread\.test\.ts/);
  assert.match(ci, /test_ios_chat_mark_unread\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.90 /);
  assert.match(roadmap, /mark a chat unread/);
});
