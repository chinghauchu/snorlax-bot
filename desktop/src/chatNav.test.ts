// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FILTER_ALL, FILTER_UNREAD, rosterForFilter } from "./chatListFilter.ts";
import { groupPinnedChats } from "./chatPins.ts";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  CHAT_NAV_ACTION,
  CHAT_NAV_KEYS,
  adjacentChatId,
  chatNavDirection,
} from "./chatNav.ts";
import { arrowUpRecalls } from "./recallDraft.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatNav.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatNav.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const sheet = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE =
  "v0.92 keyboard previous/next chat (Alt+Up / Alt+Down, Option on macOS, opens the previous or next chat in the sidebar's current visible order; the Pinned group stays first and the All / Unread filter applies; no wrap at the ends; IME composition does not navigate; plain Up-arrow still recalls the last message and in-chat find keeps its own previous and next; opening the chat clears unread, restores that chat's draft and reading place, and focuses the composer; the keyboard shortcuts list includes it; iOS hardware Option+Up / Option+Down in the chat view does the same; no new HTTP)";

type Row = { id: string; unread: boolean };

function visibleIds(rows: readonly Row[], filter: "all" | "unread", pins: readonly string[]) {
  const shown = rosterForFilter(
    rows,
    filter === "unread" ? FILTER_UNREAD : FILTER_ALL,
    (row) => row.unread,
  );
  const grouped = groupPinnedChats(shown, pins, (row) => row.id);
  return [...grouped.pinned, ...grouped.rest].map((row) => row.id);
}

test("Alt+Up / Alt+Down only; plain Up stays recall; find and IME stay put", () => {
  const altUp = { key: "ArrowUp", altKey: true };
  const altDown = { key: "ArrowDown", altKey: true };
  assert.equal(chatNavDirection(altUp), -1);
  assert.equal(chatNavDirection(altDown), 1);
  assert.equal(chatNavDirection({ key: "ArrowUp" }), null);
  assert.equal(chatNavDirection({ key: "ArrowDown" }), null);
  assert.equal(chatNavDirection({ ...altUp, shiftKey: true }), null);
  assert.equal(chatNavDirection({ ...altUp, metaKey: true }), null);
  assert.equal(chatNavDirection({ ...altDown, ctrlKey: true }), null);
  assert.equal(chatNavDirection({ ...altUp, composing: true }), null);
  assert.equal(chatNavDirection({ ...altDown, findOpen: true }), null);
  assert.equal(chatNavDirection({ ...altUp, switchOpen: true }), null);
  assert.equal(chatNavDirection({ ...altDown, blocked: true }), null);
  assert.equal(chatNavDirection({ key: "ArrowLeft", altKey: true }), null);
  assert.equal(chatNavDirection({ key: "Enter", altKey: true }), null);

  assert.equal(
    arrowUpRecalls({
      key: "ArrowUp",
      composerText: "",
      composing: false,
    }),
    true,
  );
  assert.equal(
    arrowUpRecalls({
      key: "ArrowUp",
      composerText: "",
      composing: false,
      altKey: true,
    }),
    false,
  );
  assert.equal(CHAT_NAV_KEYS, "Alt ↑ / Alt ↓");
  assert.equal(CHAT_NAV_ACTION, "Previous or next chat");
});

test("visible order is pins then the rest, Unread applies, and the ends do not wrap", () => {
  const rows: Row[] = [
    { id: "a", unread: false },
    { id: "b", unread: true },
    { id: "c", unread: true },
    { id: "d", unread: false },
  ];
  const pins = ["c", "a"];
  const all = visibleIds(rows, "all", pins);
  assert.deepEqual(all, ["c", "a", "b", "d"]);
  assert.equal(adjacentChatId(all, "c", -1), null);
  assert.equal(adjacentChatId(all, "c", 1), "a");
  assert.equal(adjacentChatId(all, "a", -1), "c");
  assert.equal(adjacentChatId(all, "a", 1), "b");
  assert.equal(adjacentChatId(all, "d", 1), null);
  assert.equal(adjacentChatId(all, "d", -1), "b");
  assert.equal(adjacentChatId(all, "missing", 1), null);
  assert.equal(adjacentChatId(all, null, -1), null);
  assert.equal(adjacentChatId([], "a", 1), null);

  const unread = visibleIds(rows, "unread", pins);
  assert.deepEqual(unread, ["c", "b"]);
  assert.equal(adjacentChatId(unread, "a", 1), null);
  assert.equal(adjacentChatId(unread, "c", 1), "b");
  assert.equal(adjacentChatId(unread, "b", 1), null);
  assert.equal(adjacentChatId(unread, "b", -1), "c");

  const only = visibleIds([{ id: "solo", unread: true }], "all", []);
  assert.equal(adjacentChatId(only, "solo", -1), null);
  assert.equal(adjacentChatId(only, "solo", 1), null);
});

test("desktop opens that row and does not steal recall or find", () => {
  const start = app.indexOf("const onChatNav");
  assert.ok(start >= 0);
  const end = app.indexOf("window.addEventListener", start);
  const handler = app.slice(start, end);
  assert.match(handler, /chatNavDirection\(/);
  assert.match(handler, /isComposerComposing\(event\)/);
  assert.match(handler, /findOpen/);
  assert.match(handler, /switchOpen/);
  assert.match(handler, /adjacentChatId\(ids, activeId, direction\)/);
  assert.match(handler, /selectAgentRef\.current\(next\)/);
  assert.match(handler, /preventDefault/);
  assert.match(handler, /stopPropagation/);
  assert.doesNotMatch(handler, /stepFindIndex/);
  assert.doesNotMatch(handler, /arrowUpRecalls/);
  assert.doesNotMatch(handler, /fillRecalledDraft/);
  assert.match(
    app.slice(start, app.indexOf("useLayoutEffect", start)),
    /addEventListener\("keydown", onChatNav, true\)/,
  );
  assert.match(app, /\[\.\.\.pinnedAgents, \.\.\.restAgents\]/);
  assert.match(app, /groupPinnedChats\(\s*rosterAgents/);
  assert.match(app, /chatVisibleInFilter\(/);
  assert.match(app, /async function selectAgent\(/);
  assert.match(app, /clearReplyUnread\(id\)/);
  assert.match(app, /moveComposer\(id, thread\)/);
  assert.match(app, /focusComposer\(\)/);
  assert.match(app, /altKey: event\.altKey/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "chat-nav");
  assert.ok(row);
  assert.equal(row.keys, CHAT_NAV_KEYS);
  assert.equal(row.action, CHAT_NAV_ACTION);
  assert.match(shortcuts, /Alt ↑ \/ Alt ↓/);
  assert.match(app, /CHAT_SHORTCUTS\.map/);

  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS hardware Option+Up/Down uses the same order; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "Option ↑ \/ Option ↓"/);
  assert.match(swift, /static let action = "Previous or next chat"/);
  assert.match(swift, /static func adjacent/);
  assert.match(swift, /static func direction/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(model, /func visibleChatOrder\(\)/);
  assert.match(model, /func openAdjacentChat\(direction: Int\)/);
  assert.match(model, /ChatListFilter\.includes/);
  assert.match(model, /ChatPins\.grouped/);
  assert.match(model, /await select\(next, push: true\)/);
  assert.match(model, /wantsComposerFocus = true/);
  assert.match(model, /func select\(_ id: String, push: Bool\)/);
  assert.doesNotMatch(model, /computerPane\.ts/);

  assert.match(chat, /onChatNav:/);
  assert.match(chat, /model\.openAdjacentChat\(direction: direction\)/);
  assert.match(chat, /ChatNav\.direction/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /\.onKeyPress\(phases: \.down\)/);
  assert.match(composer, /modifierFlags: \.alternate/);
  assert.match(composer, /UIKeyCommand\.inputUpArrow/);
  assert.match(composer, /UIKeyCommand\.inputDownArrow/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /onChatNav\?\(direction\)/);
  assert.match(composer, /func recallFromArrowUp/);
  assert.match(sheet, /ChatNav\.keysLabel/);
  assert.match(sheet, /ChatNav\.action/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatNav\.test\.ts/);
  assert.match(ci, /test_ios_chat_nav\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.92 /);
  assert.match(spec, /## 93\. v0\.92/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
