// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CHAT_LIST_FILTER_KEY,
  FILTER_ALL,
  FILTER_ALL_LABEL,
  FILTER_GROUP_LABEL,
  FILTER_UNREAD,
  FILTER_UNREAD_LABEL,
  UNREAD_EMPTY_LABEL,
  chatVisibleInFilter,
  parseChatListFilter,
  readChatListFilter,
  rosterForFilter,
  serializeChatListFilter,
  showUnreadEmpty,
  writeChatListFilter,
  type FilterStorage,
} from "./chatListFilter.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatListFilter.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatListFilter.swift"),
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
  "v0.88 Unread-only filter (a compact All / Unread control on the sidebar and the iOS chat list; All is the default and shows every chat; Unread shows only chats that currently carry the v0.70 unread accent dot; an empty Unread list shows a muted No unread chats; opening a chat still clears its unread; the choice persists in local storage / UserDefaults; relative time, last-message preview, the unread count outside the list, and the dots stay; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

class MemoryStorage implements FilterStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const rows = [
  { id: "seed", name: "Snorlax" },
  { id: "channel", name: "Room" },
  { id: "other", name: "Mew" },
];

test("All is the default and shows every chat", () => {
  assert.equal(FILTER_ALL, "all");
  assert.equal(FILTER_UNREAD, "unread");
  assert.equal(FILTER_ALL_LABEL, "All");
  assert.equal(FILTER_UNREAD_LABEL, "Unread");
  assert.equal(UNREAD_EMPTY_LABEL, "No unread chats");
  assert.equal(FILTER_GROUP_LABEL, "Chat list");
  assert.equal(CHAT_LIST_FILTER_KEY, "snorlax.chatListFilter");

  assert.equal(parseChatListFilter(null), FILTER_ALL);
  assert.equal(parseChatListFilter(undefined), FILTER_ALL);
  assert.equal(parseChatListFilter(""), FILTER_ALL);
  assert.equal(parseChatListFilter("all"), FILTER_ALL);
  assert.equal(parseChatListFilter("ALL"), FILTER_ALL);
  assert.equal(parseChatListFilter("nope"), FILTER_ALL);
  assert.equal(parseChatListFilter(FILTER_UNREAD), FILTER_UNREAD);
  assert.equal(serializeChatListFilter(FILTER_ALL), "all");
  assert.equal(serializeChatListFilter(FILTER_UNREAD), "unread");

  const dots = new Set(["other"]);
  const all = rosterForFilter(rows, FILTER_ALL, (row) => dots.has(row.id));
  assert.deepEqual(
    all.map((row) => row.id),
    ["seed", "channel", "other"],
  );
  assert.equal(chatVisibleInFilter(FILTER_ALL, false), true);
  assert.equal(chatVisibleInFilter(FILTER_ALL, true), true);
  assert.equal(showUnreadEmpty(FILTER_ALL, 0), false);
});

test("Unread keeps only chats that paint the accent dot", () => {
  const reply = new Set(["other"]);
  const handoff = new Set(["channel"]);
  const hasDot = (id: string) => reply.has(id) || handoff.has(id);
  const unread = rosterForFilter(rows, FILTER_UNREAD, (row) => hasDot(row.id));
  assert.deepEqual(
    unread.map((row) => row.id),
    ["channel", "other"],
  );
  assert.equal(chatVisibleInFilter(FILTER_UNREAD, true), true);
  assert.equal(chatVisibleInFilter(FILTER_UNREAD, false), false);
  assert.equal(showUnreadEmpty(FILTER_UNREAD, unread.length), false);

  // Opening a chat clears its unread, so the row leaves Unread.
  reply.delete("other");
  handoff.delete("channel");
  const cleared = rosterForFilter(rows, FILTER_UNREAD, (row) => hasDot(row.id));
  assert.deepEqual(cleared, []);
  assert.equal(showUnreadEmpty(FILTER_UNREAD, cleared.length), true);
  assert.equal(showUnreadEmpty(FILTER_UNREAD, 0), true);
  assert.equal(showUnreadEmpty(FILTER_UNREAD, 1), false);

  const stillAll = rosterForFilter(rows, FILTER_ALL, (row) => hasDot(row.id));
  assert.equal(stillAll.length, rows.length);
});

test("the choice persists; a broken store stays All", () => {
  const memory = new MemoryStorage();
  assert.equal(readChatListFilter(memory), FILTER_ALL);
  assert.equal(readChatListFilter(null), FILTER_ALL);
  writeChatListFilter(memory, FILTER_UNREAD);
  assert.equal(memory.getItem(CHAT_LIST_FILTER_KEY), "unread");
  assert.equal(readChatListFilter(memory), FILTER_UNREAD);
  writeChatListFilter(memory, FILTER_ALL);
  assert.equal(memory.getItem(CHAT_LIST_FILTER_KEY), "all");
  assert.equal(readChatListFilter(memory), FILTER_ALL);
  memory.setItem(CHAT_LIST_FILTER_KEY, "nope");
  assert.equal(readChatListFilter(memory), FILTER_ALL);

  const boom: FilterStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  assert.equal(readChatListFilter(boom), FILTER_ALL);
  writeChatListFilter(boom, FILTER_UNREAD);
  writeChatListFilter(null, FILTER_UNREAD);
});

test("sidebar control filters the roster and leaves the dots", () => {
  const control = block(".roster-filter");
  assert.match(control, /display:\s*flex/);
  assert.doesNotMatch(control, /transition/);
  assert.doesNotMatch(control, /animation/);
  const button = block(".roster-filter button");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  const pressed = block('.roster-filter button[aria-pressed="true"]');
  assert.match(pressed, /color:\s*var\(--text\)/);
  assert.doesNotMatch(pressed, /transition/);
  const empty = block(".roster-empty");
  assert.match(empty, /font-size:\s*12px/);
  assert.match(empty, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(empty, /animation/);

  assert.match(app, /from "\.\/chatListFilter"/);
  assert.match(app, /role="group"/);
  assert.match(app, /aria-label=\{FILTER_GROUP_LABEL\}/);
  assert.match(app, /aria-pressed=\{chatListFilter !== FILTER_UNREAD\}/);
  assert.match(app, /aria-pressed=\{chatListFilter === FILTER_UNREAD\}/);
  assert.match(app, /\{FILTER_ALL_LABEL\}/);
  assert.match(app, /\{FILTER_UNREAD_LABEL\}/);
  assert.match(app, /chooseChatListFilter\(FILTER_ALL\)/);
  assert.match(app, /chooseChatListFilter\(FILTER_UNREAD\)/);
  assert.match(app, /className="roster-empty"/);
  assert.match(app, /\{UNREAD_EMPTY_LABEL\}/);
  assert.match(app, /showUnreadEmpty\(chatListFilter,/);
  assert.match(app, /chatVisibleInFilter\(/);
  assert.match(app, /unreadIds\.has\(agent\.id\) \|\| replyUnreadIds\.has\(agent\.id\)/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /readChatListFilter\(browserFilterStorage\(\)\)/);
  assert.match(app, /writeChatListFilter\(browserFilterStorage\(\), next\)/);
  assert.match(app, /clearReplyUnread\(id\)/);
  assert.match(
    app,
    /agents\.map\(\(agent\) => \(\{\s*id: agent\.id,/,
  );
  assert.match(app, /groupPinnedChats\(\s*rosterAgents/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let storageKey = "snorlax.chatListFilter"/);
  assert.match(swift, /static let allLabel = "All"/);
  assert.match(swift, /static let unreadLabel = "Unread"/);
  assert.match(swift, /static let emptyLabel = "No unread chats"/);
  assert.match(swift, /static let groupLabel = "Chat list"/);
  assert.match(swift, /raw == Mode\.unread\.rawValue \? \.unread : \.all/);
  assert.match(swift, /filter != \.unread \|\| hasUnreadDot/);
  assert.match(swift, /filter == \.unread && unreadCount == 0/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatListFilter\.groupLabel/);
  assert.match(list, /\.pickerStyle\(\.segmented\)/);
  assert.match(list, /ChatListFilter\.allLabel/);
  assert.match(list, /ChatListFilter\.unreadLabel/);
  assert.match(list, /ChatListFilter\.emptyLabel/);
  assert.match(list, /ChatListFilter\.includes/);
  assert.match(list, /model\.showsUnreadDot/);
  assert.match(list, /ChatListFilter\.showEmpty/);
  assert.match(list, /ChatSwitcher\.filter/);
  assert.match(list, /model\.chatPreviews\[agent\.id\]/);
  assert.match(list, /ChatListTime\.label\(/);
  assert.match(model, /var chatListFilter: ChatListFilter\.Mode/);
  assert.match(model, /ChatListFilter\.read\(\)/);
  assert.match(model, /ChatListFilter\.write\(chatListFilter\)/);
  assert.match(model, /clearReplyUnread\(id\)/);
  assert.match(model, /replyUnreadIDs = chatUnread\.snapshot/);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(pkg, /chatListFilter\.test\.ts/);
  assert.match(ci, /test_ios_chat_list_filter\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.88 /);
  assert.match(roadmap, /Unread-only filter/);
});
