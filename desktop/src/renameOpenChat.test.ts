// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { commitChatName } from "./chatNames.ts";
import {
  RENAME_OPEN_CHAT_ACTION,
  RENAME_OPEN_CHAT_KEYS,
  isRenameOpenChatChord,
  overlayTextFieldOwnsRenameOpenChat,
  renameOpenChatBlocked,
  renameOpenChatShouldStart,
} from "./renameOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "renameOpenChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "RenameOpenChat.swift"),
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
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);

const PHRASE =
  "v1.11 rename the open chat from the keyboard (Cmd/Ctrl-Shift-R starts rename on the currently open chat through the same local-state path as the v0.95 sidebar Rename action; the name becomes an inline field; Enter or blur keeps a trimmed non-empty name and Escape restores the previous one; a blank name is rejected; the chord still works from the composer and does not insert text; IME composition keeps the key; a key repeat does not start a second rename; if rename is already in progress the chord does not flap; find, the quick switcher, the shortcuts list, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing changes when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift R; iOS hardware command-shift-R starts that same rename and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  chatOpen: true,
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

test("Cmd/Ctrl-Shift-R starts rename; other chords do not", () => {
  assert.equal(isRenameOpenChatChord({ key: "r", metaKey: true, shiftKey: true }), true);
  assert.equal(isRenameOpenChatChord({ key: "R", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isRenameOpenChatChord({ key: "R", metaKey: true, shiftKey: true }), true);
  assert.equal(isRenameOpenChatChord({ key: "r", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isRenameOpenChatChord({ key: "r", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isRenameOpenChatChord({ key: "r", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "r", ctrlKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "r", shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "r", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isRenameOpenChatChord({ key: "r", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isRenameOpenChatChord({ key: "r" }), false);
  assert.equal(isRenameOpenChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "n", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "p", metaKey: true, shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "m", metaKey: true, shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "Backspace", metaKey: true, shiftKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "1", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "9", ctrlKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "PageUp" }), false);
  assert.equal(isRenameOpenChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isRenameOpenChatChord({ key: "Escape" }), false);
  assert.equal(isRenameOpenChatChord({ key: "ArrowUp" }), false);
  assert.equal(renameOpenChatShouldStart({ repeat: false }, false), true);
  assert.equal(renameOpenChatShouldStart({}, false), true);
  assert.equal(renameOpenChatShouldStart({ repeat: true }, false), false);
  assert.equal(renameOpenChatShouldStart({ repeat: false }, true), false);
  assert.equal(renameOpenChatShouldStart({ repeat: true }, true), false);
  assert.equal(RENAME_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift R");
  assert.equal(RENAME_OPEN_CHAT_ACTION, "Rename this chat");
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsRenameOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsRenameOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsRenameOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsRenameOpenChat(false, true), false);
  assert.equal(renameOpenChatBlocked(openGate), false);
  assert.equal(renameOpenChatBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(renameOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("the inline rename rules stay: trim, keep, reject blank, do not flap", () => {
  const renamed = commitChatName({}, "a", "  Ada Lovelace  ", "Ada");
  assert.deepEqual(renamed, { a: "Ada Lovelace" });
  assert.equal(commitChatName(renamed, "a", "   ", "Ada"), renamed);
  assert.equal(commitChatName(renamed, "a", "Ada Lovelace", "Ada"), renamed);
  const held = renamed;
  assert.equal(renameOpenChatShouldStart({ repeat: true }, false), false);
  assert.equal(renameOpenChatShouldStart({}, true), false);
  assert.deepEqual(held, renamed);
});

test("desktop wires Cmd/Ctrl-Shift-R to the existing sidebar Rename path", () => {
  const block = sliceFn(
    app,
    "const onRenameOpenChat",
    'addEventListener("keydown", onRenameOpenChat, true)',
  );
  assert.match(block, /isRenameOpenChatChord\(/);
  assert.match(block, /renameOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsRenameOpenChat\(/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /event\.target === composerRef\.current/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
  assert.match(block, /chatOpen: active != null/);
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
  assert.match(block, /renameOpenChatShouldStart/);
  assert.match(block, /renameOpenChatRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("renameOpenChatShouldStart");
  const callAt = block.indexOf("renameOpenChatRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /commitChatName/);
  assert.doesNotMatch(block, /writeChatNames/);
  assert.doesNotMatch(block, /setRenamingId/);

  const call = sliceFn(app, "renameOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(call, /renamingIdRef\.current != null/);
  assert.match(call, /beginRename\(agent\)/);
  assert.doesNotMatch(call, /commitChatName/);
  assert.doesNotMatch(call, /writeChatNames/);
  assert.doesNotMatch(call, /onSend\(/);

  const renameFn = sliceFn(app, "function beginRename(", "function visibleName(");
  assert.match(renameFn, /setRenamingId\(agent\.id\)/);
  assert.match(renameFn, /chatDisplayName\(chatNames, agent\.id, agent\.name\)/);
  const row = sliceFn(
    app,
    'className="row-name-input"',
    "onClick={(event) => event.stopPropagation()}",
  );
  assert.match(row, /commitChatName\(/);
  assert.match(row, /writeChatNames\(browserNameStorage\(\), next\)/);
  assert.match(row, /event\.key === "Escape"/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "rename-chat");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, RENAME_OPEN_CHAT_KEYS);
  assert.equal(shortcut.action, RENAME_OPEN_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift R/);
  assert.match(shortcuts, /Rename this chat/);
  assert.match(shortcuts, /v1\.11/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-R uses the list rename field; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧R"/);
  assert.match(swift, /static let action = "Rename this chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func shouldStart/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func renameOpenChatKey/);
  assert.match(chat, /RenameOpenChat\.isChord/);
  assert.match(chat, /model\.beginRenameOpenChat\(agent\.id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func renameOpenChatFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func renameOpenChatKey", "func renameOpenChatFromComposer");
  assert.match(keyFn, /shouldStart/);
  const startAt = keyFn.indexOf("shouldStart");
  const callAt = keyFn.indexOf("beginRenameOpenChat");
  assert.ok(startAt >= 0 && callAt > startAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func renameOpenChatFromComposer", "func chatNavKey");
  assert.match(fromComposer, /model\.beginRenameOpenChat\(agent\.id\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(composer, "func renameOpenChatCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "r"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func renameOpenChatFromShortcut/);
  const selector = sliceFn(composer, "func renameOpenChatFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /renameOpenChatConsumed/);
  assert.match(selector, /onRenameOpenChat\?\(\)/);
  const consumedAt = selector.indexOf("if renameOpenChatConsumed");
  const setAt = selector.indexOf("renameOpenChatConsumed = true");
  const fireAt = selector.indexOf("onRenameOpenChat?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /renameOpenChatConsumed/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const startFn = sliceFn(model, "func beginRenameOpenChat(_ id: String)", "func noteListRename");
  assert.match(startFn, /if renameChatID != nil \{ return \}/);
  assert.match(startFn, /renameChatID = id/);
  assert.doesNotMatch(startFn, /ChatNames\.commit/);
  const listFn = sliceFn(list, "private func beginRename(", "private var deletePresented");
  assert.match(listFn, /model\.noteListRename\(agent\.id\)/);
  assert.match(list, /renamingID/);
  assert.match(list, /model\.renameChatID/);
  assert.match(list, /model\.commitChatName\(/);
  assert.match(list, /model\.endRename\(agent\.id\)/);
  assert.match(list, /ChatRenameField/);

  assert.match(sheet, /RenameOpenChat\.keysLabel/);
  assert.match(sheet, /RenameOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /renameOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_rename_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.11 /);
  assert.match(roadmap, /rename the open chat from the keyboard/);
  assert.match(spec, /## 111\. v1\.11/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
