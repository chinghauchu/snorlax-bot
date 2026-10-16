// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { isChatListFilterChord } from "./chatListFilterKey.ts";
import { isFocusSidebarChord } from "./focusSidebarList.ts";
import { isRegenerateLastReplyChord } from "./regenerateLastReply.ts";
import {
  MARK_ALL_READ_ACTION,
  MARK_ALL_READ_KEYS,
  isMarkAllReadChord,
  markAllReadIsNoOp,
  markAllReadKeyBlocked,
  markAllReadShouldClear,
  overlayTextFieldOwnsMarkAllRead,
} from "./markAllReadKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "markAllReadKey.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkAllReadKey.swift"),
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
  "v1.20 mark all as read from the keyboard (Cmd/Ctrl-Shift-O marks every chat read through the same local-state path as the v1.01 Mark all as read control under All / Unread; it clears every unread accent dot, including archived chats and channel handoff dots, so the window title and badge count go to zero and the Unread filter shows No unread chats; the chord is a no-op when nothing is unread; it still works from the composer and does not insert text; a key repeat does not clear again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; it still clears when no chat is open, because the sidebar control does; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift O; iOS hardware command-shift-O marks every chat read and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-O marks all read; other chords do not", () => {
  assert.equal(isMarkAllReadChord({ key: "o", metaKey: true, shiftKey: true }), true);
  assert.equal(isMarkAllReadChord({ key: "O", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isMarkAllReadChord({ key: "O", metaKey: true, shiftKey: true }), true);
  assert.equal(isMarkAllReadChord({ key: "o", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isMarkAllReadChord({ key: "o", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isMarkAllReadChord({ key: "o", metaKey: true }), false);
  assert.equal(isMarkAllReadChord({ key: "o", ctrlKey: true }), false);
  assert.equal(isMarkAllReadChord({ key: "o", shiftKey: true }), false);
  assert.equal(
    isMarkAllReadChord({ key: "o", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isMarkAllReadChord({ key: "o", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isMarkAllReadChord({ key: "o" }), false);
  assert.equal(isMarkAllReadChord({ key: "s", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkAllReadChord({ key: "y", metaKey: true, shiftKey: true }), false);
  assert.equal(isMarkAllReadChord({ key: "f", metaKey: true, shiftKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "o", metaKey: true, shiftKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "o", ctrlKey: true, shiftKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "o", metaKey: true, shiftKey: true }), false);
  assert.equal(markAllReadShouldClear({ repeat: false }), true);
  assert.equal(markAllReadShouldClear({}), true);
  assert.equal(markAllReadShouldClear({ repeat: true }), false);
  assert.equal(MARK_ALL_READ_KEYS, "Cmd/Ctrl Shift O");
  assert.equal(MARK_ALL_READ_ACTION, "Mark all as read");
});

test("nothing unread is a no-op; archived and handoff dots are not", () => {
  assert.equal(markAllReadIsNoOp(new Set(), new Set()), true);
  assert.equal(markAllReadIsNoOp(new Set([""]), new Set([""])), true);
  assert.equal(markAllReadIsNoOp(new Set(["live"]), new Set()), false);
  assert.equal(markAllReadIsNoOp(new Set(["archived"]), new Set()), false);
  assert.equal(markAllReadIsNoOp(new Set(), new Set(["channel"])), false);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("the composer does not own the chord; overlays do", () => {
  assert.equal(overlayTextFieldOwnsMarkAllRead(true, true), false);
  assert.equal(overlayTextFieldOwnsMarkAllRead(true, false), true);
  assert.equal(overlayTextFieldOwnsMarkAllRead(false, false), false);
  assert.equal(overlayTextFieldOwnsMarkAllRead(false, true), false);
  assert.equal(markAllReadKeyBlocked(openGate), false);
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
    assert.equal(markAllReadKeyBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("desktop wires Cmd/Ctrl-Shift-O through Mark all as read", () => {
  const refBody = sliceFn(app, "markAllReadRef.current = () => {", "const onMarkAllReadKey");
  assert.match(refBody, /markAllReadIsNoOp\(replyUnreadIds, unreadIds\)/);
  assert.match(refBody, /onMarkAllRead\(\)/);
  const noopAt = refBody.indexOf("markAllReadIsNoOp");
  const clearAt = refBody.indexOf("onMarkAllRead()");
  assert.ok(noopAt >= 0 && clearAt > noopAt);

  const block = sliceFn(
    app,
    "const onMarkAllReadKey",
    'addEventListener("keydown", onMarkAllReadKey, true)',
  );
  assert.match(block, /isMarkAllReadChord\(/);
  assert.match(block, /markAllReadKeyBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsMarkAllRead\(/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /event\.target === composerRef\.current/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
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
  assert.match(block, /markAllReadShouldClear/);
  assert.match(block, /markAllReadRef\.current\(\)/);
  assert.doesNotMatch(block, /chatOpen:/);
  assert.doesNotMatch(block, /focusInsideRosterRow/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("markAllReadShouldClear");
  const callAt = block.indexOf("markAllReadRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const markAll = sliceFn(app, "function onMarkAllRead(", "function retainPins(");
  assert.match(markAll, /chatUnread\.current\.clearAll\(\)/);
  assert.match(markAll, /setUnreadIds/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "mark-all-read");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, MARK_ALL_READ_KEYS);
  assert.equal(shortcut.action, MARK_ALL_READ_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift O/);
  assert.match(shortcuts, /Mark all as read/);
  assert.match(shortcuts, /v1\.20/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-O marks every chat read; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧O"/);
  assert.match(swift, /static let action = "Mark all as read"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func markAllReadKey/);
  assert.match(chat, /MarkAllReadKey\.isChord/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /markAllReadBlocked\(\)/);
  assert.match(chat, /func markAllReadFromComposer/);
  const keyFn = sliceFn(chat, "func markAllReadKey", "func markAllReadFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /markAllReadFromChord\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const runAt = keyFn.indexOf("markAllReadFromChord()");
  assert.ok(repeatAt >= 0 && runAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  assert.doesNotMatch(keyFn, /hasRealAgent/);
  const fromComposer = sliceFn(chat, "func markAllReadFromComposer", "func markAllReadBlocked");
  assert.match(fromComposer, /markAllReadFromChord\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  const blocked = sliceFn(chat, "func markAllReadBlocked", "func markAllReadFromChord");
  assert.match(blocked, /findOpen/);
  assert.match(blocked, /shortcutsOpen/);
  assert.match(blocked, /lightbox != nil/);
  assert.match(blocked, /renameChatID != nil/);
  const run = sliceFn(chat, "func markAllReadFromChord", "func openFind");
  assert.match(run, /model\.markAllChatsReadFromChord\(\)/);
  assert.doesNotMatch(run, /model\.send\(/);

  assert.match(model, /func markAllChatsReadFromChord\(\)/);
  const chordFn = sliceFn(model, "func markAllChatsReadFromChord()", "func openJump(");
  assert.match(chordFn, /hasAnyUnreadChat/);
  assert.match(chordFn, /markAllChatsRead\(\)/);
  const guardAt = chordFn.indexOf("hasAnyUnreadChat");
  const clearCall = chordFn.indexOf("markAllChatsRead()");
  assert.ok(guardAt >= 0 && clearCall > guardAt);
  assert.doesNotMatch(chordFn, /\/v1\//);

  assert.match(list, /func markAllReadKey/);
  assert.match(list, /model\.markAllChatsReadFromChord\(\)/);
  assert.match(list, /model\.markAllChatsRead\(\)/);

  const commands = sliceFn(composer, "func markAllReadCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "o"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func markAllReadFromShortcut/);
  const selector = sliceFn(composer, "func markAllReadFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /markAllReadConsumed/);
  assert.match(selector, /onMarkAllRead\?\(\)/);
  const consumedAt = selector.indexOf("if markAllReadConsumed");
  const setAt = selector.indexOf("markAllReadConsumed = true");
  const fireAt = selector.indexOf("onMarkAllRead?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardO/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /MarkAllReadKey\.keysLabel/);
  assert.match(sheet, /MarkAllReadKey\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /markAllReadKey\.test\.ts/);
  assert.match(ci, /test_ios_mark_all_read_key\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.20 /);
  assert.match(roadmap, /mark all as read from the keyboard/);
  assert.match(spec, /## 120\. v1\.20/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
