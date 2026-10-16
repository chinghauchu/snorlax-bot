// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { isNextUnreadChord } from "./nextUnreadChat.ts";
import { isRegenerateLastReplyChord } from "./regenerateLastReply.ts";
import {
  FOCUS_SIDEBAR_ACTION,
  FOCUS_SIDEBAR_KEYS,
  focusInsideRosterRow,
  focusSidebarBlocked,
  focusSidebarShouldMove,
  isFocusSidebarChord,
  overlayTextFieldOwnsFocusSidebar,
  rosterRowIdFromTarget,
  sidebarFocusTargetId,
  sidebarListArrowDirection,
} from "./focusSidebarList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "focusSidebarList.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "FocusSidebarList.swift"),
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
  "v1.19 focus the sidebar chat list from the keyboard (Cmd/Ctrl-Shift-S moves focus into the sidebar chat list when the open chat is showing and focus is in the composer or elsewhere in the chat column; the currently open chat's row is focused when it is visible, otherwise the first visible row in the current All / Unread, pin, and archive view; once that row is focused, Up and Down move to the previous or next visible row and keep focus in the list; the chord still works from the composer and does not insert text; a key repeat does not move focus again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; a sidebar row that already has focus keeps the key; nothing changes when there is no chat list to focus; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift S; iOS hardware command-shift-S focuses that list and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  chatOpen: true,
  inSidebarRow: false,
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

test("Cmd/Ctrl-Shift-S focuses the list; other chords do not", () => {
  assert.equal(isFocusSidebarChord({ key: "s", metaKey: true, shiftKey: true }), true);
  assert.equal(isFocusSidebarChord({ key: "S", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isFocusSidebarChord({ key: "S", metaKey: true, shiftKey: true }), true);
  assert.equal(isFocusSidebarChord({ key: "s", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isFocusSidebarChord({ key: "s", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isFocusSidebarChord({ key: "s", metaKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "s", ctrlKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "s", shiftKey: true }), false);
  assert.equal(
    isFocusSidebarChord({ key: "s", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isFocusSidebarChord({ key: "s", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isFocusSidebarChord({ key: "s" }), false);
  assert.equal(isFocusSidebarChord({ key: "y", metaKey: true, shiftKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "j", metaKey: true, shiftKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "s", metaKey: true, shiftKey: true }), false);
  assert.equal(isNextUnreadChord({ key: "s", ctrlKey: true, shiftKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "l", metaKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "f", metaKey: true, shiftKey: true }), false);
  assert.equal(isFocusSidebarChord({ key: "ArrowDown" }), false);
  assert.equal(focusSidebarShouldMove({ repeat: false }), true);
  assert.equal(focusSidebarShouldMove({}), true);
  assert.equal(focusSidebarShouldMove({ repeat: true }), false);
  assert.equal(FOCUS_SIDEBAR_KEYS, "Cmd/Ctrl Shift S");
  assert.equal(FOCUS_SIDEBAR_ACTION, "Focus the chat list");
});

test("the composer does not own the chord; a focused row and overlays do", () => {
  assert.equal(overlayTextFieldOwnsFocusSidebar(true, true), false);
  assert.equal(overlayTextFieldOwnsFocusSidebar(true, false), true);
  assert.equal(overlayTextFieldOwnsFocusSidebar(false, false), false);
  assert.equal(overlayTextFieldOwnsFocusSidebar(false, true), false);
  assert.equal(focusSidebarBlocked(openGate), false);
  assert.equal(focusSidebarBlocked({ ...openGate, chatOpen: false }), true);
  assert.equal(focusSidebarBlocked({ ...openGate, inSidebarRow: true }), true);
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
    assert.equal(focusSidebarBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("focus the open row when it is visible, else the first visible row", () => {
  assert.equal(sidebarFocusTargetId(["pin", "rest"], "rest"), "rest");
  assert.equal(sidebarFocusTargetId(["pin", "rest"], "pin"), "pin");
  assert.equal(sidebarFocusTargetId(["pin", "rest"], "hidden"), "pin");
  assert.equal(sidebarFocusTargetId(["pin", "rest"], null), "pin");
  assert.equal(sidebarFocusTargetId(["pin", "rest"], ""), "pin");
  assert.equal(sidebarFocusTargetId([], "pin"), null);
  assert.equal(sidebarFocusTargetId(["", "rest"], "missing"), "rest");
  assert.equal(sidebarListArrowDirection({ key: "ArrowUp" }), -1);
  assert.equal(sidebarListArrowDirection({ key: "ArrowDown" }), 1);
  assert.equal(sidebarListArrowDirection({ key: "ArrowDown", altKey: true }), null);
  assert.equal(sidebarListArrowDirection({ key: "ArrowUp", metaKey: true }), null);
  assert.equal(sidebarListArrowDirection({ key: "ArrowDown", shiftKey: true }), null);
  assert.equal(sidebarListArrowDirection({ key: "ArrowUp", composing: true }), null);
  assert.equal(sidebarListArrowDirection({ key: "s" }), null);

  const row = {
    closest(selector: string) {
      if (selector !== "[data-roster-row]") return null;
      return {
        getAttribute(name: string) {
          return name === "data-roster-id" ? "chat-2" : null;
        },
      };
    },
  };
  assert.equal(focusInsideRosterRow(row), true);
  assert.equal(rosterRowIdFromTarget(row), "chat-2");
  assert.equal(focusInsideRosterRow(null), false);
  assert.equal(rosterRowIdFromTarget({ closest: () => null }), null);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("desktop wires Cmd/Ctrl-Shift-S to the sidebar row", () => {
  const block = sliceFn(
    app,
    "const onFocusSidebar",
    'addEventListener("keydown", onFocusSidebar, true)',
  );
  assert.match(block, /isFocusSidebarChord\(/);
  assert.match(block, /focusSidebarBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsFocusSidebar\(/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /event\.target === composerRef\.current/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
  assert.match(block, /focusInsideRosterRow\(event\.target\)/);
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
  assert.match(block, /focusSidebarShouldMove/);
  assert.match(block, /sidebarFocusTargetId\(/);
  assert.match(block, /focusSidebarRow\(target\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("focusSidebarShouldMove");
  const callAt = block.indexOf("focusSidebarRow(target)");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const arrows = sliceFn(
    app,
    "const onSidebarListArrow",
    'addEventListener("keydown", onSidebarListArrow, true)',
  );
  assert.match(arrows, /sidebarListArrowDirection\(/);
  assert.match(arrows, /focusInsideRosterRow\(event\.target\)/);
  assert.match(arrows, /focusIsTextField\(event\.target\)/);
  assert.match(arrows, /rosterRowIdFromTarget\(event\.target\)/);
  assert.match(arrows, /adjacentChatId\(/);
  assert.match(arrows, /loadSidebarChatRef\.current\(next\)/);
  assert.match(app, /loadConversation\(id, null, "sidebar"\)/);
  assert.match(app, /data-roster-row=""/);
  assert.match(app, /data-roster-id=\{agent\.id\}/);
  const load = sliceFn(app, "async function loadConversation(", "async function selectAgent(");
  assert.match(load, /focusAfter === "sidebar"/);
  assert.match(load, /focusSidebarRow\(id\)/);
  assert.match(load, /focusComposer\(\)/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "focus-sidebar");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, FOCUS_SIDEBAR_KEYS);
  assert.equal(shortcut.action, FOCUS_SIDEBAR_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift S/);
  assert.match(shortcuts, /Focus the chat list/);
  assert.match(shortcuts, /v1\.19/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-S focuses the chat list; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧S"/);
  assert.match(swift, /static let action = "Focus the chat list"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func target/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func focusSidebarKey/);
  assert.match(chat, /FocusSidebarList\.isChord/);
  assert.match(chat, /hasRealAgent/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /focusSidebarBlocked\(\)/);
  assert.match(chat, /func focusSidebarFromComposer/);
  const keyFn = sliceFn(chat, "func focusSidebarKey", "func focusSidebarFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /focusSidebarFromChord\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const runAt = keyFn.indexOf("focusSidebarFromChord()");
  assert.ok(repeatAt >= 0 && runAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func focusSidebarFromComposer", "func focusSidebarBlocked");
  assert.match(fromComposer, /focusSidebarFromChord\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  const blocked = sliceFn(chat, "func focusSidebarBlocked", "func focusSidebarFromChord");
  assert.match(blocked, /findOpen/);
  assert.match(blocked, /shortcutsOpen/);
  assert.match(blocked, /lightbox != nil/);
  assert.match(blocked, /renameChatID != nil/);
  const run = sliceFn(chat, "func focusSidebarFromChord", "func openFind");
  assert.match(run, /model\.focusSidebarListFromChord\(\)/);
  assert.doesNotMatch(run, /model\.send\(/);

  assert.match(model, /func focusSidebarListFromChord\(\)/);
  assert.match(model, /FocusSidebarList\.target\(/);
  assert.match(model, /sidebarKeyboardFocus = true/);
  assert.match(model, /navigationPath = \[\]/);
  assert.doesNotMatch(
    sliceFn(model, "func focusSidebarListFromChord()", "func openJump("),
    /\/v1\//,
  );

  const commands = sliceFn(composer, "func focusSidebarCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "s"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func focusSidebarFromShortcut/);
  const selector = sliceFn(composer, "func focusSidebarFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /focusSidebarConsumed/);
  assert.match(selector, /onFocusSidebarList\?\(\)/);
  const consumedAt = selector.indexOf("if focusSidebarConsumed");
  const setAt = selector.indexOf("focusSidebarConsumed = true");
  const fireAt = selector.indexOf("onFocusSidebarList?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardS/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.match(list, /focusedChatID/);
  assert.match(list, /sidebarFocusRequest/);
  assert.match(list, /\.focused\(\$focusedChatID, equals: agent\.id\)/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /FocusSidebarList\.keysLabel/);
  assert.match(sheet, /FocusSidebarList\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /focusSidebarList\.test\.ts/);
  assert.match(ci, /test_ios_focus_sidebar_list\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.19 /);
  assert.match(roadmap, /focus the sidebar chat list from the keyboard/);
  assert.match(spec, /## 119\. v1\.19/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
