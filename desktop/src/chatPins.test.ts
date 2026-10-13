// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FILTER_UNREAD, rosterForFilter } from "./chatListFilter.ts";
import {
  CHAT_PINS_KEY,
  PIN_LABEL,
  PINNED_GROUP_LABEL,
  UNPIN_LABEL,
  groupPinnedChats,
  isChatPinned,
  parseChatPins,
  pinActionLabel,
  readChatPins,
  retainChatPins,
  serializeChatPins,
  toggleChatPin,
  writeChatPins,
  type PinStorage,
} from "./chatPins.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatPins.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatPins.swift"),
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
  "v0.89 pin a chat to the top (right-click or a hover control on a sidebar chat row offers Pin / Unpin; pinned chats sit in a Pinned group at the top in the order they were pinned, with a subtle pin glyph; unpinned chats keep their order below; iOS leading swipe and long-press offer Pin / Unpin with the same group; pins persist in local storage / UserDefaults; deleting a chat drops its pin; the unread dot, last-message preview, relative time, and All / Unread stay; Unread shows pinned unread chats in the pinned group; the quick switcher and iOS name search still cover every chat; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

class MemoryStorage implements PinStorage {
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
  { id: "late", name: "Pikachu" },
];

test("pins append in the order they were pinned and unpin keeps the rest", () => {
  assert.equal(PIN_LABEL, "Pin");
  assert.equal(UNPIN_LABEL, "Unpin");
  assert.equal(PINNED_GROUP_LABEL, "Pinned");
  assert.equal(CHAT_PINS_KEY, "snorlax.chatPins");
  assert.equal(pinActionLabel(false), "Pin");
  assert.equal(pinActionLabel(true), "Unpin");

  assert.deepEqual(parseChatPins(null), []);
  assert.deepEqual(parseChatPins(undefined), []);
  assert.deepEqual(parseChatPins(""), []);
  assert.deepEqual(parseChatPins("nope"), []);
  assert.deepEqual(parseChatPins("{}"), []);
  assert.deepEqual(parseChatPins("[1, \"\", \"a\", \"a\", \"b\"]"), ["a", "b"]);
  assert.equal(serializeChatPins(["b", "b", "", "a"]), '["b","a"]');

  let pins: string[] = [];
  pins = toggleChatPin(pins, "other");
  pins = toggleChatPin(pins, "seed");
  pins = toggleChatPin(pins, "other");
  assert.deepEqual(pins, ["seed"]);
  pins = toggleChatPin(pins, "other");
  assert.deepEqual(pins, ["seed", "other"]);
  assert.equal(isChatPinned(pins, "seed"), true);
  assert.equal(isChatPinned(pins, "late"), false);
  assert.equal(isChatPinned(pins, ""), false);
  assert.deepEqual(toggleChatPin(pins, ""), pins);

  const grouped = groupPinnedChats(rows, pins, (row) => row.id);
  assert.deepEqual(
    grouped.pinned.map((row) => row.id),
    ["seed", "other"],
  );
  assert.deepEqual(
    grouped.rest.map((row) => row.id),
    ["channel", "late"],
  );

  const dropped = retainChatPins(pins, new Set(["other", "late"]));
  assert.deepEqual(dropped, ["other"]);
  assert.deepEqual(retainChatPins(["gone"], new Set()), []);
});

test("Unread keeps pinned unread chats in the pinned group", () => {
  const pins = ["other", "seed"];
  const dots = new Set(["other", "late"]);
  const visible = rosterForFilter(rows, FILTER_UNREAD, (row) => dots.has(row.id));
  const grouped = groupPinnedChats(visible, pins, (row) => row.id);
  assert.deepEqual(
    grouped.pinned.map((row) => row.id),
    ["other"],
  );
  assert.deepEqual(
    grouped.rest.map((row) => row.id),
    ["late"],
  );
  const none = groupPinnedChats(
    rosterForFilter(rows, FILTER_UNREAD, () => false),
    pins,
    (row) => row.id,
  );
  assert.deepEqual(none.pinned, []);
  assert.deepEqual(none.rest, []);
});

test("the pin list persists; a broken store stays empty", () => {
  const memory = new MemoryStorage();
  assert.deepEqual(readChatPins(memory), []);
  assert.deepEqual(readChatPins(null), []);
  writeChatPins(memory, ["seed", "other"]);
  assert.equal(memory.getItem(CHAT_PINS_KEY), '["seed","other"]');
  assert.deepEqual(readChatPins(memory), ["seed", "other"]);
  memory.setItem(CHAT_PINS_KEY, "nope");
  assert.deepEqual(readChatPins(memory), []);

  const boom: PinStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  assert.deepEqual(readChatPins(boom), []);
  writeChatPins(boom, ["seed"]);
  writeChatPins(null, ["seed"]);
});

test("sidebar pin control groups rows and leaves the switcher on every chat", () => {
  const pin = block(".row-pin");
  assert.match(pin, /opacity:\s*0/);
  assert.match(pin, /color:\s*var\(--text-muted\)/);
  assert.match(pin, /width:\s*22px/);
  assert.match(pin, /height:\s*22px/);
  assert.doesNotMatch(pin, /transition/);
  assert.doesNotMatch(pin, /animation/);
  const hover = block(".row:hover .row-pin");
  assert.match(hover, /opacity:\s*1/);
  assert.doesNotMatch(hover, /transition/);
  const pinned = block(".row-pin.pinned");
  assert.match(pinned, /opacity:\s*1/);
  assert.match(pinned, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(pinned, /animation/);
  const glyph = block(".pin-glyph");
  assert.match(glyph, /width:\s*12px/);
  assert.match(glyph, /height:\s*12px/);
  const group = block(".roster-group");
  assert.match(group, /font-size:\s*12px/);
  assert.match(group, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(group, /animation/);

  assert.match(app, /from "\.\/chatPins"/);
  assert.match(app, /onContextMenu=\{\(e\) => onAgentContext\(e, agent\)\}/);
  assert.match(app, /aria-label=\{pinned \? UNPIN_LABEL : PIN_LABEL\}/);
  assert.match(app, /className=\{pinned \? "row-pin pinned" : "row-pin"\}/);
  assert.match(app, /className="roster-group">\{PINNED_GROUP_LABEL\}/);
  assert.match(app, /pinActionLabel\(isChatPinned\(pinnedChatIds, contextMenu\.agent\.id\)\)/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /readChatPins\(browserPinStorage\(\)\)/);
  assert.match(app, /writeChatPins\(browserPinStorage\(\), next\)/);
  assert.match(app, /retainPins\(rosterIds\)/);
  assert.match(app, /groupPinnedChats\(\s*rosterAgents/);
  assert.match(
    app,
    /filterChats\(\s*agents\.map\(\(agent\) => \(\{ id: agent\.id, name: agent\.name \}\)\)/,
  );
  assert.doesNotMatch(app, /filterChats\(\s*pinnedAgents/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let storageKey = "snorlax.chatPins"/);
  assert.match(swift, /static let pinLabel = "Pin"/);
  assert.match(swift, /static let unpinLabel = "Unpin"/);
  assert.match(swift, /static let groupLabel = "Pinned"/);
  assert.match(swift, /static let glyphLabel = "Pinned"/);
  assert.match(swift, /pinned \? unpinLabel : pinLabel/);
  assert.match(swift, /ids\.filter \{ \$0 != id \} \+ \[id\]/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatPins\.groupLabel/);
  assert.match(list, /swipeActions\(edge: \.leading/);
  assert.match(list, /ChatPins\.label\(pinned: model\.isChatPinned\(agent\.id\)\)/);
  assert.match(list, /systemImage: "pin"/);
  assert.match(list, /Image\(systemName: "pin\.fill"\)/);
  assert.match(list, /ChatPins\.glyphLabel/);
  assert.match(list, /ChatPins\.grouped\(listedAgents, pinned: model\.pinnedChatIDs\)/);
  assert.match(list, /ChatSwitcher\.filter/);
  assert.match(list, /filteredAgents\.map/);
  assert.match(list, /model\.chatPreviews\[agent\.id\]/);
  assert.match(list, /ChatListTime\.label\(/);
  assert.match(list, /accessibilityLabel\("Unread"\)/);
  assert.match(model, /var pinnedChatIDs: \[String\]/);
  assert.match(model, /ChatPins\.read\(\)/);
  assert.match(model, /ChatPins\.write\(pinnedChatIDs\)/);
  assert.match(model, /ChatPins\.toggle\(pinnedChatIDs, id: id\)/);
  assert.match(model, /retainChatPins\(against: agents\)/);
  assert.match(model, /clearReplyUnread\(id\)/);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /chatPins\.test\.ts/);
  assert.match(ci, /test_ios_chat_pins\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.89 /);
  assert.match(roadmap, /pin a chat to the top/);
});
