// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { toggleChatPin, writeChatPins } from "./chatPins.ts";
import {
  PIN_OPEN_CHAT_ACTION,
  PIN_OPEN_CHAT_KEYS,
  isPinOpenChatChord,
  overlayTextFieldOwnsPinOpenChat,
  pinOpenChatBlocked,
  pinOpenChatShouldToggle,
} from "./pinOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "pinOpenChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "PinOpenChat.swift"),
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
  "v1.08 pin or unpin the open chat from the keyboard (Cmd/Ctrl-Shift-P toggles Pin / Unpin on the currently open chat through the same local-state path as the v0.89 sidebar Pin action; pinned chats sit in the Pinned group in the order they were pinned; the chord still works from the composer and does not insert text; IME composition keeps the key; a key repeat does not flap the pin; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing is pinned when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift P; iOS hardware command-shift-P pins or unpins the open chat the same way and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-P pins; other chords do not", () => {
  assert.equal(isPinOpenChatChord({ key: "p", metaKey: true, shiftKey: true }), true);
  assert.equal(isPinOpenChatChord({ key: "P", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isPinOpenChatChord({ key: "P", metaKey: true, shiftKey: true }), true);
  assert.equal(isPinOpenChatChord({ key: "p", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isPinOpenChatChord({ key: "p", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isPinOpenChatChord({ key: "p", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "p", ctrlKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "p", shiftKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "p", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isPinOpenChatChord({ key: "p", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isPinOpenChatChord({ key: "p" }), false);
  assert.equal(isPinOpenChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "n", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "Backspace", metaKey: true, shiftKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "1", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "9", ctrlKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "PageUp" }), false);
  assert.equal(isPinOpenChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isPinOpenChatChord({ key: "Escape" }), false);
  assert.equal(isPinOpenChatChord({ key: "ArrowUp" }), false);
  assert.equal(pinOpenChatShouldToggle({ repeat: false }), true);
  assert.equal(pinOpenChatShouldToggle({}), true);
  assert.equal(pinOpenChatShouldToggle({ repeat: true }), false);
  assert.equal(PIN_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift P");
  assert.equal(PIN_OPEN_CHAT_ACTION, "Pin or unpin this chat");
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsPinOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsPinOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsPinOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsPinOpenChat(false, true), false);
  assert.equal(pinOpenChatBlocked(openGate), false);
  assert.equal(pinOpenChatBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(pinOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("pin order matches the sidebar toggle and a repeat does not flap", () => {
  let pins = toggleChatPin([], "a");
  pins = toggleChatPin(pins, "b");
  assert.deepEqual(pins, ["a", "b"]);
  pins = toggleChatPin(pins, "a");
  assert.deepEqual(pins, ["b"]);
  pins = toggleChatPin(pins, "a");
  assert.deepEqual(pins, ["b", "a"]);
  const held = pins;
  assert.equal(pinOpenChatShouldToggle({ repeat: true }), false);
  assert.deepEqual(held, pins);
});

test("desktop wires Cmd/Ctrl-Shift-P to the existing sidebar Pin path", () => {
  const block = sliceFn(
    app,
    "const onPinOpenChat",
    'addEventListener("keydown", onPinOpenChat, true)',
  );
  assert.match(block, /isPinOpenChatChord\(/);
  assert.match(block, /pinOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsPinOpenChat\(/);
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
  assert.match(block, /pinOpenChatShouldToggle/);
  assert.match(block, /pinOpenChatRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const toggleAt = block.indexOf("pinOpenChatShouldToggle");
  const callAt = block.indexOf("pinOpenChatRef.current()");
  assert.ok(preventAt >= 0 && toggleAt > preventAt && callAt > toggleAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /writeChatPins/);
  assert.doesNotMatch(block, /toggleChatPin\(/);
  assert.doesNotMatch(block, /setPinnedChatIds/);

  const call = sliceFn(app, "pinOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(call, /active\?\.id/);
  assert.match(call, /onTogglePin\(id\)/);
  assert.doesNotMatch(call, /writeChatPins/);
  assert.doesNotMatch(call, /onSend\(/);

  const pinFn = sliceFn(app, "function onTogglePin(", "function onToggleRead(");
  assert.match(pinFn, /toggleChatPin\(current, id\)/);
  assert.match(pinFn, /writeChatPins\(browserPinStorage\(\), next\)/);
  assert.equal(typeof writeChatPins, "function");

  const row = CHAT_SHORTCUTS.find((item) => item.id === "pin-chat");
  assert.ok(row);
  assert.equal(row.keys, PIN_OPEN_CHAT_KEYS);
  assert.equal(row.action, PIN_OPEN_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift P/);
  assert.match(shortcuts, /Pin or unpin this chat/);
  assert.match(shortcuts, /v1\.08/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-P uses toggleChatPin; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧P"/);
  assert.match(swift, /static let action = "Pin or unpin this chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func pinOpenChatKey/);
  assert.match(chat, /PinOpenChat\.isChord/);
  assert.match(chat, /model\.toggleChatPin\(agent\.id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func pinOpenChatFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func pinOpenChatKey", "func pinOpenChatFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const toggleAt = keyFn.indexOf("toggleChatPin");
  assert.ok(repeatAt >= 0 && toggleAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func pinOpenChatFromComposer", "func chatNavKey");
  assert.match(fromComposer, /model\.toggleChatPin\(agent\.id\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(composer, "func pinOpenChatCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "p"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func pinOpenChatFromShortcut/);
  const selector = sliceFn(composer, "func pinOpenChatFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /pinOpenChatConsumed/);
  assert.match(selector, /onPinOpenChat\?\(\)/);
  const consumedAt = selector.indexOf("if pinOpenChatConsumed");
  const setAt = selector.indexOf("pinOpenChatConsumed = true");
  const fireAt = selector.indexOf("onPinOpenChat?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /pinOpenChatConsumed/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const pinFn = sliceFn(model, "func toggleChatPin(_ id: String)", "func chatDisplayName");
  assert.match(pinFn, /ChatPins\.toggle\(pinnedChatIDs, id: id\)/);
  assert.match(model, /didSet \{ ChatPins\.write\(pinnedChatIDs\) \}/);
  assert.match(list, /model\.toggleChatPin\(agent\.id\)/);

  assert.match(sheet, /PinOpenChat\.keysLabel/);
  assert.match(sheet, /PinOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /pinOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_pin_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.08 /);
  assert.match(roadmap, /pin or unpin the open chat from the keyboard/);
  assert.match(spec, /## 108\. v1\.08/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
