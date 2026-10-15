// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  ARCHIVE_OPEN_CHAT_ACTION,
  ARCHIVE_OPEN_CHAT_KEYS,
  archiveOpenChatBlocked,
  isArchiveOpenChatChord,
  overlayTextFieldOwnsArchiveOpenChat,
} from "./archiveOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "archiveOpenChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ArchiveOpenChat.swift"),
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

const PHRASE =
  "v1.06 archive the open chat from the keyboard (Cmd/Ctrl-Shift-A archives the currently open chat through the same path as the sidebar Archive action; if that open chat is archived, the next chat in Alt+Up/Down visible order opens, or the empty state; the chord still works from the composer because the platform does nothing useful with Shift-A there for chat; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing is archived when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift A; iOS hardware command-shift-A archives the open chat the same way and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-A archives; other chords do not", () => {
  assert.equal(isArchiveOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), true);
  assert.equal(isArchiveOpenChatChord({ key: "A", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isArchiveOpenChatChord({ key: "A", metaKey: true, shiftKey: true }), true);
  assert.equal(isArchiveOpenChatChord({ key: "a", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isArchiveOpenChatChord({ key: "a", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "a", ctrlKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "a", shiftKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "a", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isArchiveOpenChatChord({ key: "a", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(
    isArchiveOpenChatChord({ key: "a", metaKey: true, shiftKey: true, repeat: true }),
    false,
  );
  assert.equal(isArchiveOpenChatChord({ key: "a" }), false);
  assert.equal(isArchiveOpenChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "n", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "n", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "c", ctrlKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "1", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "9", ctrlKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "ArrowDown", altKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "PageUp" }), false);
  assert.equal(isArchiveOpenChatChord({ key: "PageDown" }), false);
  assert.equal(isArchiveOpenChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "End", ctrlKey: true }), false);
  assert.equal(isArchiveOpenChatChord({ key: "Escape" }), false);
  assert.equal(isArchiveOpenChatChord({ key: "ArrowUp" }), false);
  assert.equal(ARCHIVE_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift A");
  assert.equal(ARCHIVE_OPEN_CHAT_ACTION, "Archive this chat");
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsArchiveOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsArchiveOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsArchiveOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsArchiveOpenChat(false, true), false);
  assert.equal(archiveOpenChatBlocked(openGate), false);
  assert.equal(archiveOpenChatBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(archiveOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("desktop wires Cmd/Ctrl-Shift-A to the existing sidebar Archive path", () => {
  const block = sliceFn(
    app,
    "const onArchiveOpenChat",
    'addEventListener("keydown", onArchiveOpenChat, true)',
  );
  assert.match(block, /isArchiveOpenChatChord\(/);
  assert.match(block, /archiveOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsArchiveOpenChat\(/);
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
  assert.match(block, /archiveOpenChatRef\.current\(\)/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /writeChatArchives/);
  assert.doesNotMatch(block, /archiveChat\(/);
  assert.doesNotMatch(block, /setArchivedChatIds/);

  const call = sliceFn(app, "archiveOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(call, /active\?\.id/);
  assert.match(call, /onArchive\(id\)/);
  assert.doesNotMatch(call, /writeChatArchives/);
  assert.doesNotMatch(call, /onSend\(/);

  const archiveFn = sliceFn(app, "function onArchive(", "function onUnarchive(");
  assert.match(archiveFn, /selectionAfterArchive/);
  assert.match(archiveFn, /writeChatArchives/);
  assert.match(archiveFn, /archiveChat\(/);
  assert.match(archiveFn, /leaveToEmptyChat\(\)/);
  assert.match(archiveFn, /selectAgent\(nextOpen\)/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "archive-chat");
  assert.ok(row);
  assert.equal(row.keys, ARCHIVE_OPEN_CHAT_KEYS);
  assert.equal(row.action, ARCHIVE_OPEN_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift A/);
  assert.match(shortcuts, /Archive this chat/);
  assert.match(shortcuts, /v1\.06/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-A uses archiveChat; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧A"/);
  assert.match(swift, /static let action = "Archive this chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func archiveOpenChatKey/);
  assert.match(chat, /ArchiveOpenChat\.isChord/);
  assert.match(chat, /model\.archiveChat\(agent\.id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func archiveOpenChatFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func archiveOpenChatKey", "func archiveOpenChatFromComposer");
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func archiveOpenChatFromComposer", "func chatNavKey");
  assert.match(fromComposer, /model\.archiveChat\(agent\.id\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(composer, "func archiveOpenChatCommands", "func chatNavCommands");
  assert.match(commands, /input: "a"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(composer, /func archiveOpenChatFromShortcut/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /onArchiveOpenChat\?\(\)/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const archiveFn = sliceFn(model, "func archiveChat(_ id: String)", "func unarchiveChat");
  assert.match(archiveFn, /ChatArchive\.selectionAfterArchive/);
  assert.match(archiveFn, /visibleChatOrder\(\)/);
  assert.doesNotMatch(archiveFn, /func archiveChatFromChord/);

  assert.match(sheet, /ArchiveOpenChat\.keysLabel/);
  assert.match(sheet, /ArchiveOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /archiveOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_archive_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.06 /);
  assert.match(roadmap, /archive the open chat from the keyboard/);
  assert.match(spec, /## 106\. v1\.06/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
