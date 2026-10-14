// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { adjacentChatId } from "./chatNav.ts";
import { FILTER_UNREAD, rosterForFilter } from "./chatListFilter.ts";
import { groupPinnedChats } from "./chatPins.ts";
import { filterChats } from "./chatSwitcher.ts";
import {
  CHAT_NAME_MAX,
  CHAT_NAMES_KEY,
  RENAME_FIELD_LABEL,
  RENAME_LABEL,
  chatDisplayName,
  clearChatName,
  commitChatName,
  parseChatNames,
  readChatNames,
  retainChatNames,
  serializeChatNames,
  writeChatNames,
  type ChatNameMap,
  type NameStorage,
} from "./chatNames.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatNames.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatNames.swift"),
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
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.95 rename a chat from the sidebar (right-click or a hover control on a sidebar chat row offers Rename; the name becomes an inline field; Enter or blur keeps a trimmed non-empty name and Escape restores the previous one; a blank name is rejected; iOS long-press and a swipe offer Rename with the same rules; the display name persists in local storage / UserDefaults; pins, the unread dot, Draft: preview, generating ···, relative time, All / Unread, mark unread, and Alt+Up/Down order stay; the quick switcher and iOS name search use the new name; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

class MemoryStorage implements NameStorage {
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

test("a trimmed name overlays the server name; blank and over-long stay put", () => {
  assert.equal(RENAME_LABEL, "Rename");
  assert.equal(RENAME_FIELD_LABEL, "Chat name");
  assert.equal(CHAT_NAMES_KEY, "snorlax.chatNames");
  assert.equal(CHAT_NAME_MAX, 80);

  assert.deepEqual(parseChatNames(null), {});
  assert.deepEqual(parseChatNames(undefined), {});
  assert.deepEqual(parseChatNames(""), {});
  assert.deepEqual(parseChatNames("nope"), {});
  assert.deepEqual(parseChatNames("[]"), {});
  assert.deepEqual(parseChatNames('{"seed":"  ","gone":1,"other":" Mew "}'), {
    other: "Mew",
  });
  assert.equal(
    serializeChatNames({ other: " Mew ", seed: "   ", late: "x".repeat(81) }),
    '{"other":"Mew"}',
  );

  let names: ChatNameMap = {};
  const same = commitChatName(names, "seed", "   ", "Snorlax");
  assert.equal(same, names);
  assert.equal(commitChatName(names, "seed", "x".repeat(81), "Snorlax"), names);
  assert.equal(commitChatName(names, "", "Buddy", "Snorlax"), names);

  names = commitChatName(names, "seed", "  Buddy  ", "Snorlax");
  assert.equal(names.seed, "Buddy");
  assert.equal(chatDisplayName(names, "seed", "Snorlax"), "Buddy");
  assert.equal(chatDisplayName(names, "channel", "Room"), "Room");
  assert.equal(chatDisplayName(names, "", "Room"), "Room");

  const again = commitChatName(names, "seed", "Buddy", "Snorlax");
  assert.equal(again, names);
  const cleared = commitChatName(names, "seed", " Snorlax ", "Snorlax");
  assert.deepEqual(cleared, {});
  assert.equal(chatDisplayName(cleared, "seed", "Snorlax"), "Snorlax");
  assert.equal(clearChatName(cleared, "seed"), cleared);

  const kept = retainChatNames({ seed: "Buddy", gone: "Nope" }, new Set(["seed"]));
  assert.deepEqual(kept, { seed: "Buddy" });
  assert.equal(retainChatNames(kept, new Set(["seed"])), kept);
  assert.deepEqual(retainChatNames({ seed: "Buddy" }, new Set()), {});
  assert.deepEqual(clearChatName({ seed: "Buddy" }, "seed"), {});
});

test("rename does not reorder pins, unread, or Alt+Up/Down", () => {
  const names = commitChatName({}, "other", "Buddy", "Mew");
  const labeled = rows.map((row) => ({
    id: row.id,
    name: chatDisplayName(names, row.id, row.name),
  }));
  assert.equal(labeled[2].name, "Buddy");
  const hits = filterChats(labeled, "bud");
  assert.deepEqual(
    hits.map((row) => row.id),
    ["other"],
  );
  assert.deepEqual(filterChats(labeled, "mew"), []);
  assert.deepEqual(
    filterChats(labeled, "   ").map((row) => row.id),
    ["seed", "channel", "other"],
  );

  const pins = ["other", "seed"];
  const dots = new Set(["other", "channel"]);
  const visible = rosterForFilter(rows, FILTER_UNREAD, (row) => dots.has(row.id));
  const grouped = groupPinnedChats(visible, pins, (row) => row.id);
  assert.deepEqual(
    grouped.pinned.map((row) => row.id),
    ["other"],
  );
  assert.deepEqual(
    grouped.rest.map((row) => row.id),
    ["channel"],
  );
  const order = [...grouped.pinned, ...grouped.rest].map((row) => row.id);
  assert.equal(adjacentChatId(order, "other", 1), "channel");
  assert.equal(adjacentChatId(order, "channel", 1), null);
  assert.equal(adjacentChatId(order, "other", -1), null);
});

test("the name map persists; a broken store stays empty", () => {
  const memory = new MemoryStorage();
  assert.deepEqual(readChatNames(memory), {});
  assert.deepEqual(readChatNames(null), {});
  writeChatNames(memory, { seed: "Buddy", other: "  " });
  assert.equal(memory.getItem(CHAT_NAMES_KEY), '{"seed":"Buddy"}');
  assert.deepEqual(readChatNames(memory), { seed: "Buddy" });
  memory.setItem(CHAT_NAMES_KEY, "nope");
  assert.deepEqual(readChatNames(memory), {});

  const boom: NameStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  assert.deepEqual(readChatNames(boom), {});
  writeChatNames(boom, { seed: "Buddy" });
  writeChatNames(null, { seed: "Buddy" });
});

test("sidebar rename keeps the other row chrome and the switcher uses the new name", () => {
  const button = block(".row-rename");
  assert.match(button, /opacity:\s*0/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /width:\s*22px/);
  assert.match(button, /height:\s*22px/);
  assert.match(button, /pointer-events:\s*none/);
  assert.doesNotMatch(button, /transition/);
  assert.doesNotMatch(button, /animation/);
  const hover = block(".row:hover .row-rename");
  assert.match(hover, /opacity:\s*1/);
  assert.doesNotMatch(hover, /transition/);
  const hidden = block(".row.renaming .row-rename");
  assert.match(hidden, /pointer-events:\s*none/);
  const glyph = block(".rename-glyph");
  assert.match(glyph, /width:\s*12px/);
  assert.match(glyph, /height:\s*12px/);
  const field = block(".row-name-input");
  assert.match(field, /font-size:\s*13px/);
  assert.doesNotMatch(field, /transition/);
  assert.doesNotMatch(field, /animation/);

  assert.match(app, /from "\.\/chatNames"/);
  assert.match(app, /aria-label=\{RENAME_LABEL\}/);
  assert.match(app, /aria-label=\{RENAME_FIELD_LABEL\}/);
  assert.match(app, /className="row-rename"/);
  assert.match(app, /className="row-name-input"/);
  assert.match(app, /maxLength=\{CHAT_NAME_MAX\}/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(app, /event\.key === "Enter"/);
  assert.match(app, /onBlur=\{/);
  assert.match(app, /renameCancelRef\.current = agent\.id/);
  assert.match(app, /commitChatName\(/);
  assert.match(app, /\{RENAME_LABEL\}/);
  assert.match(app, /onContextMenu=\{\(e\) => onAgentContext\(e, agent\)\}/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /className="row-draft-prefix"/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /className="row-generating waiting-dots"/);
  assert.match(app, /className="roster-filter"/);
  assert.match(app, /className=\{pinned \? "row-pin pinned" : "row-pin"\}/);
  assert.match(app, /readChatNames\(browserNameStorage\(\)\)/);
  assert.match(app, /writeChatNames\(browserNameStorage\(\), next\)/);
  assert.match(app, /retainNames\(rosterIds\)/);
  assert.match(app, /groupPinnedChats\(\s*rosterAgents/);
  assert.match(app, /adjacentChatId\(ids, activeId, direction\)/);
  assert.match(app, /renamingId != null/);
  assert.match(
    app,
    /name: chatDisplayName\(chatNames, agent\.id, agent\.name\)/,
  );
  assert.match(app, /<span>\{activeLabel\}<\/span>/);
  assert.match(app, /Message \$\{activeLabel\}/);
  assert.match(app, /className="info-name">\{active\.name\}/);
  assert.match(app, /updated\.name !== active\.name/);
  assert.match(app, /clearChatName\(current, updated\.id\)/);
  assert.doesNotMatch(app, /filterChats\(\s*pinnedAgents/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let storageKey = "snorlax.chatNames"/);
  assert.match(swift, /static let renameLabel = "Rename"/);
  assert.match(swift, /static let fieldLabel = "Chat name"/);
  assert.match(swift, /static let maxLength = 80/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /ChatNames\.renameLabel/);
  assert.match(list, /ChatNames\.fieldLabel/);
  assert.match(list, /systemImage: "pencil"/);
  assert.match(list, /swipeActions\(edge: \.leading/);
  assert.match(list, /\.onSubmit \{ finish\(commit: true\) \}/);
  assert.match(list, /\.onKeyPress\(\.escape\)/);
  assert.match(list, /model\.chatDisplayName\(for:/);
  assert.match(list, /model\.commitChatName\(/);
  assert.match(list, /ChatPins\.label\(pinned: model\.isChatPinned\(agent\.id\)\)/);
  assert.match(list, /ChatListTime\.label\(/);
  assert.match(list, /accessibilityLabel\("Unread"\)/);
  assert.match(model, /var chatNames: \[String: String\]/);
  assert.match(model, /ChatNames\.read\(\)/);
  assert.match(model, /ChatNames\.write\(chatNames\)/);
  assert.match(model, /ChatNames\.commit\(/);
  assert.match(model, /ChatNames\.clear\(/);
  assert.match(model, /retainChatNames\(against:/);
  assert.match(model, /updated\.name != previousName/);
  assert.match(chat, /navigationTitle\(chatTitle\)/);
  assert.match(chat, /chatDisplayName\(for: agent\)/);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatNames\.test\.ts/);
  assert.match(ci, /test_ios_chat_names\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.95 /);
  assert.match(roadmap, /rename a chat from the sidebar/);
  assert.match(spec, /## 96\. v0\.95/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
