// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  ARCHIVE_LIST_ACTION,
  ARCHIVE_LIST_KEYS,
  archiveListBlocked,
  archiveListShouldToggle,
  isArchiveListChord,
  nextArchiveListOpen,
  overlayTextFieldOwnsArchiveList,
} from "./archiveListKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "archiveListKey.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ArchiveListKey.swift"),
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
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);

const PHRASE =
  "v1.16 open or close Archived chats from the keyboard (Cmd/Ctrl-Shift-H toggles the sidebar Archived list the same way the Archived (n) control does: open when that list is closed and at least one chat is archived, close when it is open; it works while a chat is open and while none is open; the chord still works from the composer and does not insert text; a key repeat does not flap and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing opens when no chat is archived and the list is already closed; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift H; iOS hardware command-shift-H toggles that Archived list and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-H toggles the list; other chords do not", () => {
  assert.equal(isArchiveListChord({ key: "h", metaKey: true, shiftKey: true }), true);
  assert.equal(isArchiveListChord({ key: "H", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isArchiveListChord({ key: "H", metaKey: true, shiftKey: true }), true);
  assert.equal(isArchiveListChord({ key: "h", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isArchiveListChord({ key: "h", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isArchiveListChord({ key: "h", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "h", ctrlKey: true }), false);
  assert.equal(isArchiveListChord({ key: "h", shiftKey: true }), false);
  assert.equal(
    isArchiveListChord({ key: "h", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isArchiveListChord({ key: "h", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isArchiveListChord({ key: "h" }), false);
  assert.equal(isArchiveListChord({ key: "g", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveListChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveListChord({ key: "i", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveListChord({ key: "k", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isArchiveListChord({ key: "f", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveListChord({ key: "F", ctrlKey: true, shiftKey: true }), false);
  assert.equal(isArchiveListChord({ key: "l", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "n", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "/", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "1", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isArchiveListChord({ key: "PageUp" }), false);
  assert.equal(isArchiveListChord({ key: "Home", metaKey: true }), false);
  assert.equal(isArchiveListChord({ key: "Escape" }), false);
  assert.equal(isArchiveListChord({ key: "ArrowUp" }), false);
  assert.equal(archiveListShouldToggle({ repeat: false }), true);
  assert.equal(archiveListShouldToggle({}), true);
  assert.equal(archiveListShouldToggle({ repeat: true }), false);
  assert.equal(ARCHIVE_LIST_KEYS, "Cmd/Ctrl Shift H");
  assert.equal(ARCHIVE_LIST_ACTION, "Open or close Archived chats");
});

test("the composer does not own the chord; overlays do; an empty chat does not", () => {
  assert.equal(overlayTextFieldOwnsArchiveList(true, true), false);
  assert.equal(overlayTextFieldOwnsArchiveList(true, false), true);
  assert.equal(overlayTextFieldOwnsArchiveList(false, false), false);
  assert.equal(overlayTextFieldOwnsArchiveList(false, true), false);
  assert.equal(archiveListBlocked(openGate), false);
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
    assert.equal(archiveListBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("opening matches the Archived control; closing always returns to the main list", () => {
  assert.equal(nextArchiveListOpen(false, 2), true);
  assert.equal(nextArchiveListOpen(true, 2), false);
  assert.equal(nextArchiveListOpen(false, 1), true);
  assert.equal(nextArchiveListOpen(true, 1), false);
  assert.equal(nextArchiveListOpen(false, 0), false);
  assert.equal(nextArchiveListOpen(true, 0), false);
  assert.equal(nextArchiveListOpen(false, -1), false);
  assert.equal(nextArchiveListOpen(false, Number.NaN), false);
  const opened = nextArchiveListOpen(false, 3);
  assert.equal(nextArchiveListOpen(opened, 3), false);
  assert.equal(nextArchiveListOpen(false, 3), true);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("desktop wires Cmd/Ctrl-Shift-H to the existing Archived control", () => {
  const block = sliceFn(
    app,
    "const onToggleArchiveList",
    'addEventListener("keydown", onToggleArchiveList, true)',
  );
  assert.match(block, /isArchiveListChord\(/);
  assert.match(block, /archiveListBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsArchiveList\(/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /event\.target === composerRef\.current/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
  assert.doesNotMatch(block, /chatOpen: active != null/);
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
  assert.match(block, /archiveListShouldToggle/);
  assert.match(block, /toggleArchiveListRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("archiveListShouldToggle");
  const callAt = block.indexOf("toggleArchiveListRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const call = sliceFn(app, "toggleArchiveListRef.current = () => {", "useEffect(() => {");
  assert.match(call, /nextArchiveListOpen\(open, archivedAgents\.length\)/);
  assert.match(call, /setArchiveOpen/);
  assert.doesNotMatch(call, /if \(!active\) return/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /fetch\(/);
  assert.match(app, /onClick=\{\(\) => setArchiveOpen\(\(open\) => !open\)\}/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "archive-list");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, ARCHIVE_LIST_KEYS);
  assert.equal(shortcut.action, ARCHIVE_LIST_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift H/);
  assert.match(shortcuts, /Open or close Archived chats/);
  assert.match(shortcuts, /v1\.16/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-H toggles that Archived list; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧H"/);
  assert.match(swift, /static let action = "Open or close Archived chats"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func nextOpen/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func archiveListKey/);
  assert.match(chat, /ArchiveListKey\.isChord/);
  assert.match(chat, /toggleArchivedList\(\)/);
  assert.match(chat, /model\.toggleArchivedListFromChord\(\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func toggleArchiveListFromComposer/);
  const keyFn = sliceFn(chat, "func archiveListKey", "func toggleArchiveListFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /toggleArchivedList\(\)/);
  assert.doesNotMatch(keyFn, /hasRealAgent/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const toggleAt = keyFn.indexOf("toggleArchivedList()");
  assert.ok(repeatAt >= 0 && toggleAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func toggleArchiveListFromComposer", "func archiveListBlocked");
  assert.match(fromComposer, /toggleArchivedList\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  assert.match(list, /func archiveListKey/);
  assert.match(list, /ArchiveListKey\.isChord/);
  assert.match(list, /toggleArchivedListFromChord\(\)/);
  assert.match(list, /model\.showArchivedList = true/);
  assert.match(list, /model\.showArchivedList = false/);
  assert.match(list, /archiveListShowing = showArchived/);
  const listKey = sliceFn(list, "func archiveListKey", "private var styledList");
  assert.match(listKey, /shouldIgnoreRepeat/);
  assert.doesNotMatch(listKey, /model\.send\(/);

  assert.match(model, /var showArchivedList = false/);
  assert.match(model, /func toggleArchivedListFromChord/);
  assert.match(model, /ArchiveListKey\.nextOpen/);
  assert.doesNotMatch(
    sliceFn(model, "func toggleArchivedListFromChord", "var archivedAgents"),
    /send\(/,
  );

  const commands = sliceFn(composer, "func archiveListCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "h"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func toggleArchiveListFromShortcut/);
  const selector = sliceFn(composer, "func toggleArchiveListFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /archiveListConsumed/);
  assert.match(selector, /onToggleArchiveList\?\(\)/);
  const consumedAt = selector.indexOf("if archiveListConsumed");
  const setAt = selector.indexOf("archiveListConsumed = true");
  const fireAt = selector.indexOf("onToggleArchiveList?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardH/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /ArchiveListKey\.keysLabel/);
  assert.match(sheet, /ArchiveListKey\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /archiveListKey\.test\.ts/);
  assert.match(ci, /test_ios_archive_list_key\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.16 /);
  assert.match(roadmap, /open or close Archived chats from the keyboard/);
  assert.match(spec, /## 116\. v1\.16/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
