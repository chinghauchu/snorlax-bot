// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { isFindChord } from "./chatFind.ts";
import {
  FILTER_ALL,
  FILTER_UNREAD,
  UNREAD_EMPTY_LABEL,
  nextChatListFilter,
  rosterForFilter,
  showUnreadEmpty,
  writeChatListFilter,
  type FilterStorage,
} from "./chatListFilter.ts";
import {
  CHAT_LIST_FILTER_ACTION,
  CHAT_LIST_FILTER_KEYS,
  chatListFilterKeyBlocked,
  chatListFilterShouldToggle,
  isChatListFilterChord,
  overlayTextFieldOwnsChatListFilter,
} from "./chatListFilterKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatListFilterKey.ts"), "utf8");
const filter = readFileSync(join(here, "chatListFilter.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatListFilterKey.swift"),
  "utf8",
);
const filterSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatListFilter.swift"),
  "utf8",
);
const sheet = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);

const PHRASE =
  "v1.15 toggle the All / Unread filter from the keyboard (Cmd/Ctrl-Shift-F toggles the sidebar All / Unread control shipped in v0.88, the same choice as clicking All or Unread; All shows every chat and Unread shows only chats that currently paint the accent dot; an empty Unread list still shows No unread chats; pinned unread chats stay in the Pinned group; archived chats stay out of that list; the choice still persists in local storage / UserDefaults; the chord still works from the composer and does not insert text; a key repeat does not flap and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; the filter still toggles when no chat is open because the sidebar control does; Cmd/Ctrl-F still finds and does not take Shift-F; Cmd/Ctrl-K, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift F; iOS hardware command-shift-F toggles that filter and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  composing: false,
  overlayTextField: false,
  inCard: false,
  findOpen: false,
  switchOpen: false,
  shortcutsOpen: false,
  renaming: false,
  lightboxOpen: false,
  menuOpen: false,
  blocked: false,
};

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("Cmd/Ctrl-Shift-F toggles the filter; find and other chords do not", () => {
  assert.equal(isChatListFilterChord({ key: "f", metaKey: true, shiftKey: true }), true);
  assert.equal(isChatListFilterChord({ key: "F", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isChatListFilterChord({ key: "F", metaKey: true, shiftKey: true }), true);
  assert.equal(isChatListFilterChord({ key: "f", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isChatListFilterChord({ key: "f", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isChatListFilterChord({ key: "f", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "F", ctrlKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "f", shiftKey: true }), false);
  assert.equal(
    isChatListFilterChord({ key: "f", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isChatListFilterChord({ key: "f", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isChatListFilterChord({ key: "f" }), false);
  assert.equal(isChatListFilterChord({ key: "g", metaKey: true, shiftKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "u", metaKey: true, shiftKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "k", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "l", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "n", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "/", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "1", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "PageUp" }), false);
  assert.equal(isChatListFilterChord({ key: "Home", metaKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "Escape" }), false);
  assert.equal(isChatListFilterChord({ key: "ArrowUp" }), false);
  assert.equal(isFindChord({ key: "f", metaKey: true }), true);
  assert.equal(isFindChord({ key: "F", metaKey: true, shiftKey: true }), false);
  assert.equal(isFindChord({ key: "f", ctrlKey: true, shiftKey: true }), false);
  assert.equal(chatListFilterShouldToggle({ repeat: false }), true);
  assert.equal(chatListFilterShouldToggle({}), true);
  assert.equal(chatListFilterShouldToggle({ repeat: true }), false);
  assert.equal(CHAT_LIST_FILTER_KEYS, "Cmd/Ctrl Shift F");
  assert.equal(CHAT_LIST_FILTER_ACTION, "Toggle All / Unread");
});

test("the composer does not own the chord; overlays do; an empty chat does not", () => {
  assert.equal(overlayTextFieldOwnsChatListFilter(true, true), false);
  assert.equal(overlayTextFieldOwnsChatListFilter(true, false), true);
  assert.equal(overlayTextFieldOwnsChatListFilter(false, false), false);
  assert.equal(overlayTextFieldOwnsChatListFilter(false, true), false);
  assert.equal(chatListFilterKeyBlocked(openGate), false);
  assert.equal("chatOpen" in openGate, false);
  for (const flag of [
    "composing",
    "overlayTextField",
    "inCard",
    "findOpen",
    "switchOpen",
    "shortcutsOpen",
    "renaming",
    "lightboxOpen",
    "menuOpen",
    "blocked",
  ] as const) {
    assert.equal(chatListFilterKeyBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("toggling keeps the existing All / Unread rules", () => {
  assert.equal(nextChatListFilter(FILTER_ALL), FILTER_UNREAD);
  assert.equal(nextChatListFilter(FILTER_UNREAD), FILTER_ALL);
  assert.equal(nextChatListFilter(nextChatListFilter(FILTER_ALL)), FILTER_ALL);
  const rows = [
    { id: "pinned", archived: false },
    { id: "open", archived: false },
    { id: "quiet", archived: false },
    { id: "boxed", archived: true },
  ];
  const dots = new Set(["pinned", "boxed"]);
  const main = rows.filter((row) => !row.archived);
  const unread = rosterForFilter(main, nextChatListFilter(FILTER_ALL), (row) =>
    dots.has(row.id),
  );
  assert.deepEqual(
    unread.map((row) => row.id),
    ["pinned"],
  );
  assert.equal(showUnreadEmpty(FILTER_UNREAD, 0), true);
  assert.equal(UNREAD_EMPTY_LABEL, "No unread chats");
  assert.equal(showUnreadEmpty(nextChatListFilter(FILTER_UNREAD), 0), false);
  const memory: FilterStorage = {
    getItem() {
      return null;
    },
    setItem(key, value) {
      assert.equal(key, "snorlax.chatListFilter");
      assert.equal(value, "unread");
    },
  };
  writeChatListFilter(memory, nextChatListFilter(FILTER_ALL));
  assert.match(filter, /nextChatListFilter/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /archiveChat|toggleChatPin/);
});

test("desktop wires Cmd/Ctrl-Shift-F to the existing All / Unread control", () => {
  const block = sliceFn(
    app,
    "const onToggleChatListFilter",
    'addEventListener("keydown", onToggleChatListFilter, true)',
  );
  assert.match(block, /isChatListFilterChord\(/);
  assert.match(block, /chatListFilterKeyBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsChatListFilter\(/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /event\.target === composerRef\.current/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
  assert.doesNotMatch(block, /chatOpen/);
  assert.match(block, /findOpen/);
  assert.match(block, /switchOpen/);
  assert.match(block, /shortcutsOpen/);
  assert.match(block, /renamingId != null/);
  assert.match(block, /lightboxTarget != null/);
  assert.match(block, /contextMenu != null/);
  assert.match(block, /mentionOpen/);
  assert.match(block, /skillMenuOpen/);
  assert.match(block, /preventDefault/);
  assert.match(block, /stopPropagation/);
  assert.match(block, /chatListFilterShouldToggle/);
  assert.match(block, /toggleChatListFilterRef\.current\(\)/);
  const blockedAt = block.indexOf("chatListFilterKeyBlocked(gate)");
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("chatListFilterShouldToggle");
  const callAt = block.indexOf("toggleChatListFilterRef.current()");
  assert.ok(blockedAt >= 0 && preventAt > blockedAt && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const call = sliceFn(app, "toggleChatListFilterRef.current = () => {", "useEffect(() => {");
  assert.match(call, /chooseChatListFilter\(nextChatListFilter\(chatListFilter\)\)/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /fetch\(/);
  assert.doesNotMatch(call, /setArchivedChatIds|setPinnedChatIds/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "unread-filter");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, CHAT_LIST_FILTER_KEYS);
  assert.equal(shortcut.action, CHAT_LIST_FILTER_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift F/);
  assert.match(shortcuts, /Toggle All \/ Unread/);
  assert.match(shortcuts, /v1\.15/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-F toggles that filter; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧F"/);
  assert.match(swift, /static let action = "Toggle All \/ Unread"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(filterSwift, /static func toggled/);
  assert.match(filterSwift, /mode == \.unread \? \.all : \.unread/);

  assert.match(chat, /func chatListFilterKey/);
  assert.match(chat, /ChatListFilterKey\.isChord/);
  assert.match(chat, /toggleChatListFilterFromChord\(\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func toggleChatListFilterFromComposer/);
  const keyFn = sliceFn(chat, "func chatListFilterKey", "func toggleChatListFilterFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /toggleChatListFilterFromChord\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const toggleAt = keyFn.indexOf("toggleChatListFilterFromChord()");
  assert.ok(repeatAt >= 0 && toggleAt > repeatAt);
  assert.doesNotMatch(keyFn, /hasRealAgent/);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(
    chat,
    "func toggleChatListFilterFromComposer",
    "func chatListFilterKeyBlocked",
  );
  assert.match(fromComposer, /toggleChatListFilterFromChord\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const listKey = sliceFn(list, "func chatListFilterKey", "func jumpChatKey");
  assert.match(listKey, /ChatListFilterKey\.isChord/);
  assert.match(listKey, /shouldIgnoreRepeat/);
  assert.match(listKey, /toggleChatListFilterFromChord\(\)/);
  assert.match(listKey, /renamingID != nil/);
  assert.ok(listKey.indexOf("shouldIgnoreRepeat") < listKey.indexOf("toggleChatListFilterFromChord()"));
  assert.doesNotMatch(listKey, /model\.send\(/);

  const commands = sliceFn(composer, "func chatListFilterCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "f"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  const selector = sliceFn(composer, "func toggleChatListFilterFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /chatListFilterConsumed/);
  assert.match(selector, /onToggleChatListFilter\?\(\)/);
  const consumedAt = selector.indexOf("if chatListFilterConsumed");
  const setAt = selector.indexOf("chatListFilterConsumed = true");
  const fireAt = selector.indexOf("onToggleChatListFilter?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardF/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(model, /func toggleChatListFilterFromChord/);
  assert.match(model, /ChatListFilter\.toggled\(chatListFilter\)/);
  assert.match(model, /filterChordAt < 0\.05/);
  assert.match(model, /ChatListFilter\.write\(chatListFilter\)/);

  assert.match(sheet, /ChatListFilterKey\.keysLabel/);
  assert.match(sheet, /ChatListFilterKey\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatListFilterKey\.test\.ts/);
  assert.match(ci, /test_ios_chat_list_filter_key\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.15 /);
  assert.match(roadmap, /toggle the All \/ Unread filter from the keyboard/);
  assert.match(spec, /## 115\. v1\.15/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
