// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { chatNavDirection } from "./chatNav.ts";
import { isSwitchChord } from "./chatSwitcher.ts";
import { isNextUnreadChord } from "./nextUnreadChat.ts";
import { isArchiveListChord } from "./archiveListKey.ts";
import { isChatListFilterChord } from "./chatListFilterKey.ts";
import {
  PREVIOUS_UNREAD_ACTION,
  PREVIOUS_UNREAD_KEYS,
  isPreviousUnreadChord,
  overlayTextFieldOwnsPreviousUnread,
  previousUnreadBlocked,
  previousUnreadChatId,
  previousUnreadShouldOpen,
} from "./previousUnreadChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "previousUnreadChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "PreviousUnreadChat.swift"),
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

const PHRASE =
  "v1.21 jump to the previous unread chat from the keyboard (Cmd/Ctrl-Shift-K opens the previous unread chat before the currently open one in the sidebar's current visible order, the same order Alt+Up/Down and Cmd/Ctrl-1..9 use, with the Pinned group first, wrapping around; opening that chat restores its draft and reading place and focuses the composer the same way Alt+Up/Down does; if no chat in that order is unread, nothing changes; the open chat is not selected again when it is the only unread row; muted chats do not count because they do not paint the accent dot; archived chats are included only while that list is showing; the chord still works from the composer and does not insert text; a key repeat does not jump again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift K; iOS hardware command-shift-K opens that previous unread chat and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-K opens the previous unread chat; other chords do not", () => {
  assert.equal(isPreviousUnreadChord({ key: "k", metaKey: true, shiftKey: true }), true);
  assert.equal(isPreviousUnreadChord({ key: "K", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isPreviousUnreadChord({ key: "K", metaKey: true, shiftKey: true }), true);
  assert.equal(isPreviousUnreadChord({ key: "k", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isPreviousUnreadChord({ key: "k", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isPreviousUnreadChord({ key: "k", metaKey: true }), false);
  assert.equal(isPreviousUnreadChord({ key: "k", ctrlKey: true }), false);
  assert.equal(isPreviousUnreadChord({ key: "k", shiftKey: true }), false);
  assert.equal(
    isPreviousUnreadChord({ key: "k", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isPreviousUnreadChord({ key: "k", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isPreviousUnreadChord({ key: "k" }), false);
  assert.equal(isPreviousUnreadChord({ key: "j", metaKey: true, shiftKey: true }), false);
  assert.equal(isPreviousUnreadChord({ key: "h", metaKey: true, shiftKey: true }), false);
  assert.equal(isPreviousUnreadChord({ key: "o", metaKey: true, shiftKey: true }), false);
  assert.equal(isPreviousUnreadChord({ key: "s", metaKey: true, shiftKey: true }), false);
  assert.equal(isNextUnreadChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isNextUnreadChord({ key: "j", metaKey: true, shiftKey: true }), true);
  assert.equal(isSwitchChord({ key: "k", metaKey: true }), true);
  assert.equal(isSwitchChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isSwitchChord({ key: "K", ctrlKey: true }), true);
  assert.equal(chatNavDirection({ key: "ArrowUp", altKey: true, shiftKey: true }), null);
  assert.equal(chatNavDirection({ key: "ArrowUp", altKey: true }), -1);
  assert.equal(isArchiveListChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isChatListFilterChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(previousUnreadShouldOpen({ repeat: false }), true);
  assert.equal(previousUnreadShouldOpen({}), true);
  assert.equal(previousUnreadShouldOpen({ repeat: true }), false);
  assert.equal(PREVIOUS_UNREAD_KEYS, "Cmd/Ctrl Shift K");
  assert.equal(PREVIOUS_UNREAD_ACTION, "Previous unread chat");
});

test("the composer does not own the chord; overlays do", () => {
  assert.equal(overlayTextFieldOwnsPreviousUnread(true, true), false);
  assert.equal(overlayTextFieldOwnsPreviousUnread(true, false), true);
  assert.equal(overlayTextFieldOwnsPreviousUnread(false, false), false);
  assert.equal(overlayTextFieldOwnsPreviousUnread(false, true), false);
  assert.equal(previousUnreadBlocked(openGate), false);
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
    assert.equal(previousUnreadBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("the previous unread chat wraps and skips the open chat", () => {
  const unread = new Set(["pin", "c"]);
  assert.equal(previousUnreadChatId(["pin", "a", "b", "c"], "a", unread), "pin");
  assert.equal(previousUnreadChatId(["pin", "a", "b", "c"], "c", unread), "pin");
  assert.equal(previousUnreadChatId(["pin", "a", "b", "c"], "b", unread), "pin");
  assert.equal(previousUnreadChatId(["pin", "a", "b", "c"], "pin", unread), "c");
  assert.equal(previousUnreadChatId(["a", "b", "c"], "b", new Set(["a"])), "a");
  assert.equal(previousUnreadChatId(["a", "b", "c"], "a", new Set(["a"])), null);
  assert.equal(previousUnreadChatId(["a", "b", "c"], "b", new Set()), null);
  assert.equal(previousUnreadChatId(["a", "b", "c"], null, new Set(["b"])), "b");
  assert.equal(previousUnreadChatId(["a", "b", "c"], "missing", new Set(["c", "a"])), "c");
  assert.equal(previousUnreadChatId([], "a", new Set(["a"])), null);
  assert.equal(previousUnreadChatId(["", "b"], null, new Set(["b"])), "b");
  assert.equal(previousUnreadChatId(["a", "b", "c"], "c", new Set(["b"])), "b");
  assert.equal(previousUnreadChatId(["a", "b"], "a", new Set(["a", "b"])), "b");
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("desktop wires Cmd/Ctrl-Shift-K through the sidebar open path", () => {
  const block = sliceFn(
    app,
    "const onPreviousUnread",
    'addEventListener("keydown", onPreviousUnread, true)',
  );
  assert.match(block, /isPreviousUnreadChord\(/);
  assert.match(block, /previousUnreadBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsPreviousUnread\(/);
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
  assert.match(block, /previousUnreadShouldOpen/);
  assert.match(block, /previousUnreadChatId\(ids, activeId, unread\)/);
  assert.match(block, /selectAgentRef\.current\(previous\)/);
  assert.match(block, /paintsUnreadAccent\(/);
  assert.match(block, /isChatMuted\(mutedChatIds, id\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("previousUnreadShouldOpen");
  const pickAt = block.indexOf("previousUnreadChatId");
  const callAt = block.indexOf("selectAgentRef.current(previous)");
  assert.ok(preventAt >= 0 && startAt > preventAt && pickAt > startAt && callAt > pickAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.match(app, /jumpChatKey \? jumpChatKey\.split/);
  assert.match(app, /visibleJumpIds\(/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "previous-unread");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, PREVIOUS_UNREAD_KEYS);
  assert.equal(shortcut.action, PREVIOUS_UNREAD_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift K/);
  assert.match(shortcuts, /Previous unread chat/);
  assert.match(shortcuts, /v1\.21/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-K opens that previous unread chat; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧K"/);
  assert.match(swift, /static let action = "Previous unread chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func target/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func previousUnreadKey/);
  assert.match(chat, /PreviousUnreadChat\.isChord/);
  assert.match(chat, /openPreviousUnread\(\)/);
  assert.match(chat, /model\.openPreviousUnreadChat\(\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func previousUnreadFromComposer/);
  const keyFn = sliceFn(chat, "func previousUnreadKey", "func previousUnreadFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /openPreviousUnread\(\)/);
  assert.doesNotMatch(keyFn, /hasRealAgent/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const openAt = keyFn.indexOf("openPreviousUnread()");
  assert.ok(repeatAt >= 0 && openAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func previousUnreadFromComposer", "func previousUnreadBlocked");
  assert.match(fromComposer, /openPreviousUnread\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  assert.match(model, /func openPreviousUnreadChat/);
  assert.match(model, /PreviousUnreadChat\.target/);
  assert.match(model, /jumpChatIds\(\)/);
  assert.match(model, /showsUnreadDot/);
  assert.match(model, /wantsComposerFocus = true/);
  assert.match(model, /await select\(previous, push: true\)/);
  assert.doesNotMatch(
    sliceFn(model, "func openPreviousUnreadChat", "func focusSidebarListFromChord"),
    /\/v1\//,
  );

  const commands = sliceFn(composer, "func previousUnreadCommands", "func regenerateLastReplyCommands");
  assert.match(commands, /input: "k"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func previousUnreadFromShortcut/);
  const selector = sliceFn(composer, "func previousUnreadFromShortcut", "func regenerateLastReplyFromShortcut");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /previousUnreadConsumed/);
  assert.match(selector, /onPreviousUnread\?\(\)/);
  const consumedAt = selector.indexOf("if previousUnreadConsumed");
  const setAt = selector.indexOf("previousUnreadConsumed = true");
  const fireAt = selector.indexOf("onPreviousUnread?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardK/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /PreviousUnreadChat\.keysLabel/);
  assert.match(sheet, /PreviousUnreadChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /previousUnreadChat\.test\.ts/);
  assert.match(ci, /test_ios_previous_unread_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.21 /);
  assert.match(roadmap, /jump to the previous unread chat from the keyboard/);
  assert.match(spec, /## 121\. v1\.21/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
