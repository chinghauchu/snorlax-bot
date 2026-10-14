// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FILTER_UNREAD,
  chatVisibleInFilter,
  rosterForFilter,
} from "./chatListFilter.ts";
import {
  CHAT_MUTES_KEY,
  MUTE_LABEL,
  MUTED_GLYPH_LABEL,
  UNMUTE_LABEL,
  audibleUnreadIds,
  isChatMuted,
  muteActionLabel,
  paintsUnreadAccent,
  parseChatMutes,
  readChatMutes,
  replyMayMarkUnread,
  retainChatMutes,
  serializeChatMutes,
  toggleChatMute,
  writeChatMutes,
  type MuteStorage,
} from "./chatMute.ts";
import { unreadChrome, unreadReplyCount } from "./unreadOutside.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatMute.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatMute.swift"),
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
  "v1.02 mute a chat from the sidebar (right-click or a hover control on a sidebar chat row offers Mute / Unmute; a muted chat stops showing the unread accent dot and a new assistant reply does not add it to the unread count outside the list; messages still arrive and opening the chat works as usual; the row shows a subtle muted glyph; mute persists in local storage / UserDefaults; iOS long-press and a swipe offer Mute / Unmute; the Unread filter skips muted chats; pins, rename, archive, Draft: preview, generating ···, relative time, All / Unread, Alt+Up/Down, mark unread, and section headers stay; no new HTTP)";

class MemoryStorage implements MuteStorage {
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
  assert.ok(end > start, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("mute toggles, persists, and drops a deleted chat", () => {
  assert.equal(MUTE_LABEL, "Mute");
  assert.equal(UNMUTE_LABEL, "Unmute");
  assert.equal(MUTED_GLYPH_LABEL, "Muted");
  assert.equal(CHAT_MUTES_KEY, "snorlax.chatMutes");
  assert.equal(muteActionLabel(false), "Mute");
  assert.equal(muteActionLabel(true), "Unmute");

  assert.deepEqual(parseChatMutes(null), []);
  assert.deepEqual(parseChatMutes(undefined), []);
  assert.deepEqual(parseChatMutes(""), []);
  assert.deepEqual(parseChatMutes("nope"), []);
  assert.deepEqual(parseChatMutes("{}"), []);
  assert.deepEqual(parseChatMutes('[1, "", "a", "a", "b"]'), ["a", "b"]);
  assert.equal(serializeChatMutes(["b", "b", "", "a"]), '["b","a"]');

  let ids = toggleChatMute([], "seed");
  ids = toggleChatMute(ids, "other");
  assert.deepEqual(ids, ["seed", "other"]);
  assert.equal(isChatMuted(ids, "seed"), true);
  assert.equal(isChatMuted(ids, "gone"), false);
  assert.equal(isChatMuted(ids, ""), false);
  ids = toggleChatMute(ids, "seed");
  assert.deepEqual(ids, ["other"]);
  assert.deepEqual(toggleChatMute(ids, ""), ids);
  assert.deepEqual(retainChatMutes(["a", "gone", "b"], new Set(["b"])), ["b"]);
  assert.deepEqual(retainChatMutes(["gone"], new Set()), []);

  const memory = new MemoryStorage();
  assert.deepEqual(readChatMutes(memory), []);
  writeChatMutes(memory, ["b", "b", "", "a"]);
  assert.equal(memory.getItem(CHAT_MUTES_KEY), '["b","a"]');
  assert.deepEqual(readChatMutes(memory), ["b", "a"]);
  memory.setItem(CHAT_MUTES_KEY, "nope");
  assert.deepEqual(readChatMutes(memory), []);
  assert.deepEqual(readChatMutes(null), []);
  writeChatMutes(null, ["a"]);
});

test("a muted chat is not unread for the dot, the badge, or the filter", () => {
  const stored = new Set(["seed", "other", ""]);
  const audible = audibleUnreadIds(stored, ["other"]);
  assert.deepEqual([...audible].sort(), ["seed"]);
  assert.equal(unreadReplyCount(audible), 1);
  assert.equal(unreadChrome(audible).title, "(1) Snorlax-Bot");
  assert.equal(unreadChrome(audibleUnreadIds(stored, ["seed", "other"])).badge, null);

  assert.equal(paintsUnreadAccent(true, true), false);
  assert.equal(paintsUnreadAccent(false, true), true);
  assert.equal(paintsUnreadAccent(false, false), false);
  assert.equal(replyMayMarkUnread(true), false);
  assert.equal(replyMayMarkUnread(false), true);

  const rows = [
    { id: "seed" },
    { id: "other" },
    { id: "late" },
  ];
  const muted = new Set(["other"]);
  const visible = rosterForFilter(rows, FILTER_UNREAD, (row) =>
    paintsUnreadAccent(muted.has(row.id), stored.has(row.id)),
  );
  assert.deepEqual(
    visible.map((row) => row.id),
    ["seed"],
  );
  assert.equal(
    chatVisibleInFilter(FILTER_UNREAD, paintsUnreadAccent(true, true)),
    false,
  );
  assert.equal(
    chatVisibleInFilter("all", paintsUnreadAccent(true, true)),
    true,
  );
});

test("desktop and iOS offer Mute without a new route", () => {
  assert.match(app, /from "\.\/chatMute"/);
  assert.match(app, /readChatMutes\(browserMuteStorage\(\)\)/);
  assert.match(app, /writeChatMutes\(browserMuteStorage\(\), next\)/);
  assert.match(app, /onClick=\{\(\) => onToggleMute\(contextMenu\.agent\.id\)\}/);
  assert.match(
    app,
    /muteActionLabel\(isChatMuted\(mutedChatIds, contextMenu\.agent\.id\)\)/,
  );
  assert.match(app, /className=\{muted \? "row-mute muted" : "row-mute"\}/);
  assert.match(app, /aria-label=\{MUTED_GLYPH_LABEL\}/);
  assert.match(app, /pinActionLabel\(isChatPinned\(pinnedChatIds, contextMenu\.agent\.id\)\)/);
  assert.match(app, /onClick=\{\(\) => onToggleRead\(contextMenu\.agent\.id\)\}/);
  assert.match(app, /retainMutes\(rosterIds\)/);
  assert.match(css, /\.row-mute \{/);
  assert.match(css, /\.row-muted-mark \{/);

  const note = sliceFn(app, "function noteReplyUnread(", "function clearReplyUnread(");
  assert.match(note, /replyMayMarkUnread\(isChatMuted\(mutedChatIdsRef\.current, chatId\)\)/);
  assert.match(note, /replyMarksUnread\(/);
  assert.match(note, /chatUnread\.current\.mark\(chatId\)/);
  assert.doesNotMatch(note, /fetch\(/);

  const toggle = sliceFn(app, "function onToggleMute(", "// v0.96: archived chats");
  assert.match(toggle, /chatUnread\.current\.clear\(id\)/);
  assert.match(toggle, /publishReplyUnread\(\)/);
  assert.doesNotMatch(toggle, /fetch\(/);
  assert.doesNotMatch(toggle, /toggleChatPin/);

  const publish = sliceFn(app, "function publishReplyUnread(", "function noteReplyUnread(");
  assert.match(publish, /audibleUnreadIds\(chatUnread\.current\.snapshot\(\), mutedChatIdsRef\.current\)/);

  assert.match(swift, /static let storageKey = "snorlax.chatMutes"/);
  assert.match(swift, /static let muteLabel = "Mute"/);
  assert.match(swift, /static let unmuteLabel = "Unmute"/);
  assert.match(swift, /static let glyphLabel = "Muted"/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatMute\.label\(muted: muted\)/);
  assert.match(list, /ChatMute\.label\(muted: model\.isChatMuted\(agent\.id\)\)/);
  assert.match(list, /model\.toggleChatMute\(agent\.id\)/);
  assert.match(list, /systemImage: "bell\.slash"/);
  assert.match(list, /accessibilityLabel\(ChatMute\.glyphLabel\)/);
  assert.match(list, /ChatPins\.label\(pinned: model\.isChatPinned\(agent\.id\)\)/);
  assert.match(list, /ChatUnread\.actionLabel\(showsDot: model\.showsUnreadDot\(agent\)\)/);
  assert.match(model, /mutedChatIDs = ChatMute\.read\(\)/);
  assert.match(model, /ChatMute\.write\(mutedChatIDs\)/);
  assert.match(model, /func toggleChatMute\(_ id: String\)/);
  assert.match(model, /ChatMute\.replyMayMarkUnread\(muted: isChatMuted\(chatId\)\)/);
  assert.match(model, /ChatMute\.audible\(replyUnreadIDs, muted: mutedChatIDs\)/);
  assert.match(model, /ChatMute\.paintsUnreadAccent/);
  assert.match(model, /retainChatMutes\(against: agents\)/);
  assert.match(model, /replyUnreadIDs = chatUnread\.snapshot/);

  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /chatMute\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_chat_mute\.py/);
  assert.equal(roadmap.includes(PHRASE), true);
  assert.match(roadmap, /\/ v1\.02 /);
  assert.match(spec, /## 102\. v1\.02/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
