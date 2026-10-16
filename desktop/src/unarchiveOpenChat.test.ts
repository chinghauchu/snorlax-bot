// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { isArchiveOpenChatChord } from "./archiveOpenChat.ts";
import { isChatArchived, unarchiveChat } from "./chatArchive.ts";
import { isPreviousUnreadChord } from "./previousUnreadChat.ts";
import {
  UNARCHIVE_OPEN_CHAT_ACTION,
  UNARCHIVE_OPEN_CHAT_KEYS,
  isUnarchiveOpenChatChord,
  overlayTextFieldOwnsUnarchiveOpenChat,
  unarchiveOpenChatBlocked,
  unarchiveOpenChatShouldRun,
} from "./unarchiveOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "unarchiveOpenChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "UnarchiveOpenChat.swift"),
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
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);

const PHRASE =
  "v1.22 unarchive the open chat from the keyboard (Cmd/Ctrl-Shift-B restores the currently open chat through the same path as the sidebar Unarchive action when that chat is archived, so it leaves the Archived list and returns to the main list in pin and recency order; the open chat stays open; nothing changes when no chat is open or the open chat is not archived; Cmd/Ctrl-Shift-A still only archives and does not unarchive; the chord still works from the composer and does not insert text; a key repeat does not unarchive again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift B; iOS hardware command-shift-B unarchives that chat and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-B unarchives; archive and other chords do not", () => {
  assert.equal(isUnarchiveOpenChatChord({ key: "b", metaKey: true, shiftKey: true }), true);
  assert.equal(isUnarchiveOpenChatChord({ key: "B", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isUnarchiveOpenChatChord({ key: "B", metaKey: true, shiftKey: true }), true);
  assert.equal(isUnarchiveOpenChatChord({ key: "b", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isUnarchiveOpenChatChord({ key: "b", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isUnarchiveOpenChatChord({ key: "b", metaKey: true }), false);
  assert.equal(isUnarchiveOpenChatChord({ key: "b", ctrlKey: true }), false);
  assert.equal(isUnarchiveOpenChatChord({ key: "b", shiftKey: true }), false);
  assert.equal(
    isUnarchiveOpenChatChord({ key: "b", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isUnarchiveOpenChatChord({ key: "b", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isUnarchiveOpenChatChord({ key: "b" }), false);
  assert.equal(isUnarchiveOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isUnarchiveOpenChatChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isUnarchiveOpenChatChord({ key: "h", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "b", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), true);
  assert.equal(isPreviousUnreadChord({ key: "b", metaKey: true, shiftKey: true }), false);
  assert.equal(unarchiveOpenChatShouldRun({ archived: true }), true);
  assert.equal(unarchiveOpenChatShouldRun({ archived: true, repeat: false }), true);
  assert.equal(unarchiveOpenChatShouldRun({ archived: false }), false);
  assert.equal(unarchiveOpenChatShouldRun({ archived: true, repeat: true }), false);
  assert.equal(unarchiveOpenChatShouldRun({ archived: false, repeat: true }), false);
  assert.equal(UNARCHIVE_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift B");
  assert.equal(UNARCHIVE_OPEN_CHAT_ACTION, "Unarchive this chat");
  assert.deepEqual(unarchiveChat(["a", "b"], "a"), ["b"]);
  assert.deepEqual(unarchiveChat(["b"], "a"), ["b"]);
  assert.equal(isChatArchived(["a"], "a"), true);
  assert.equal(isChatArchived(["b"], "a"), false);
});

test("the composer does not own the chord; overlays and an empty chat do", () => {
  assert.equal(overlayTextFieldOwnsUnarchiveOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsUnarchiveOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsUnarchiveOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsUnarchiveOpenChat(false, true), false);
  assert.equal(unarchiveOpenChatBlocked(openGate), false);
  assert.equal(unarchiveOpenChatBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(unarchiveOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("desktop wires Cmd/Ctrl-Shift-B through the sidebar Unarchive path", () => {
  const block = sliceFn(
    app,
    "const onUnarchiveOpenChat",
    'addEventListener("keydown", onUnarchiveOpenChat, true)',
  );
  assert.match(block, /isUnarchiveOpenChatChord\(/);
  assert.match(block, /unarchiveOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsUnarchiveOpenChat\(/);
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
  assert.match(block, /unarchiveOpenChatShouldRun/);
  assert.match(block, /isChatArchived\(archivedChatIds, active\.id\)/);
  assert.match(block, /unarchiveOpenChatRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const runAt = block.indexOf("unarchiveOpenChatShouldRun");
  const callAt = block.indexOf("unarchiveOpenChatRef.current()");
  assert.ok(preventAt >= 0 && runAt > preventAt && callAt > runAt);
  assert.doesNotMatch(block, /onArchive\(/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /selectAgent/);
  assert.doesNotMatch(block, /setArchiveOpen/);

  const ref = sliceFn(app, "unarchiveOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(ref, /isChatArchived\(archivedChatIds, id\)/);
  assert.match(ref, /onUnarchive\(id\)/);
  assert.doesNotMatch(ref, /onArchive\(/);
  assert.doesNotMatch(ref, /selectAgent/);
  assert.doesNotMatch(ref, /leaveToEmptyChat/);

  const archive = sliceFn(
    app,
    "const onArchiveOpenChat",
    'addEventListener("keydown", onArchiveOpenChat, true)',
  );
  assert.doesNotMatch(archive, /onUnarchive/);
  assert.match(app, /function onUnarchive\(id: string\)/);
  assert.match(app, /unarchiveChat\(current, id\)/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "unarchive-chat");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, UNARCHIVE_OPEN_CHAT_KEYS);
  assert.equal(shortcut.action, UNARCHIVE_OPEN_CHAT_ACTION);
  const archiveRow = CHAT_SHORTCUTS.find((item) => item.id === "archive-chat");
  assert.equal(archiveRow?.keys, "Cmd/Ctrl Shift A");
  assert.equal(archiveRow?.action, "Archive this chat");
  assert.match(shortcuts, /Cmd\/Ctrl Shift B/);
  assert.match(shortcuts, /Unarchive this chat/);
  assert.match(shortcuts, /v1\.22/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-B unarchives that chat; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧B"/);
  assert.match(swift, /static let action = "Unarchive this chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func unarchiveOpenChatKey/);
  assert.match(chat, /UnarchiveOpenChat\.isChord/);
  assert.match(chat, /model\.unarchiveChat\(agent\.id\)/);
  assert.match(chat, /model\.isChatArchived\(agent\.id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func unarchiveOpenChatFromComposer/);
  const keyFn = sliceFn(chat, "func unarchiveOpenChatKey", "func unarchiveOpenChatFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /hasRealAgent/);
  assert.match(keyFn, /isChatArchived\(agent\.id\)/);
  assert.match(keyFn, /unarchiveChat\(agent\.id\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const archivedAt = keyFn.indexOf("isChatArchived(agent.id)");
  const callAt = keyFn.indexOf("unarchiveChat(agent.id)");
  assert.ok(repeatAt >= 0 && archivedAt > repeatAt && callAt > archivedAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  assert.doesNotMatch(keyFn, /model\.archiveChat\(/);
  const fromComposer = sliceFn(
    chat,
    "func unarchiveOpenChatFromComposer",
    "func unarchiveOpenChatBlocked",
  );
  assert.match(fromComposer, /isChatArchived\(agent\.id\)/);
  assert.match(fromComposer, /unarchiveChat\(agent\.id\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  assert.doesNotMatch(fromComposer, /model\.archiveChat\(/);

  assert.match(model, /func unarchiveChat\(_ id: String\)/);
  assert.match(
    sliceFn(model, "func unarchiveChat(_ id: String)", "func retainChatArchives"),
    /ChatArchive\.unarchive/,
  );
  assert.match(list, /model\.unarchiveChat\(agent\.id\)/);
  assert.match(list, /ChatArchive\.unarchiveLabel/);

  const commands = sliceFn(composer, "func unarchiveOpenChatCommands", "func archiveOpenChatCommands");
  assert.match(commands, /input: "b"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func unarchiveOpenChatFromShortcut/);
  const selector = sliceFn(
    composer,
    "func unarchiveOpenChatFromShortcut",
    "func chatNavUp",
  );
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /unarchiveOpenChatConsumed/);
  assert.match(selector, /onUnarchiveOpenChat\?\(\)/);
  const consumedAt = selector.indexOf("if unarchiveOpenChatConsumed");
  const setAt = selector.indexOf("unarchiveOpenChatConsumed = true");
  const fireAt = selector.indexOf("onUnarchiveOpenChat?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardB/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /UnarchiveOpenChat\.keysLabel/);
  assert.match(sheet, /UnarchiveOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /unarchiveOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_unarchive_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.22 /);
  assert.match(roadmap, /unarchive the open chat from the keyboard/);
  assert.match(spec, /## 122\. v1\.22/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
