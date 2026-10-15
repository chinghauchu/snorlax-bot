// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  audibleUnreadIds,
  paintsUnreadAccent,
  replyMayMarkUnread,
  toggleChatMute,
  writeChatMutes,
} from "./chatMute.ts";
import {
  MUTE_OPEN_CHAT_ACTION,
  MUTE_OPEN_CHAT_KEYS,
  isMuteOpenChatChord,
  muteOpenChatBlocked,
  muteOpenChatShouldToggle,
  overlayTextFieldOwnsMuteOpenChat,
} from "./muteOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "muteOpenChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "MuteOpenChat.swift"),
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
  "v1.09 mute or unmute the open chat from the keyboard (Cmd/Ctrl-Shift-M toggles Mute / Unmute on the currently open chat through the same local-state path as the v1.02 sidebar Mute action; mute persists in local storage / UserDefaults; muted chats skip unread dots and unread count; the chord still works from the composer and does not insert text; IME composition keeps the key; a key repeat does not flap Mute / Unmute; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing changes when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift M; iOS hardware command-shift-M mutes or unmutes the open chat the same way and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-M mutes; other chords do not", () => {
  assert.equal(isMuteOpenChatChord({ key: "m", metaKey: true, shiftKey: true }), true);
  assert.equal(isMuteOpenChatChord({ key: "M", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isMuteOpenChatChord({ key: "M", metaKey: true, shiftKey: true }), true);
  assert.equal(isMuteOpenChatChord({ key: "m", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isMuteOpenChatChord({ key: "m", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isMuteOpenChatChord({ key: "m", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "m", ctrlKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "m", shiftKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "m", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isMuteOpenChatChord({ key: "m", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isMuteOpenChatChord({ key: "m" }), false);
  assert.equal(isMuteOpenChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "p", metaKey: true, shiftKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "n", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "Backspace", metaKey: true, shiftKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "1", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "9", ctrlKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "PageUp" }), false);
  assert.equal(isMuteOpenChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isMuteOpenChatChord({ key: "Escape" }), false);
  assert.equal(isMuteOpenChatChord({ key: "ArrowUp" }), false);
  assert.equal(muteOpenChatShouldToggle({ repeat: false }), true);
  assert.equal(muteOpenChatShouldToggle({}), true);
  assert.equal(muteOpenChatShouldToggle({ repeat: true }), false);
  assert.equal(MUTE_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift M");
  assert.equal(MUTE_OPEN_CHAT_ACTION, "Mute or unmute this chat");
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsMuteOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsMuteOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsMuteOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsMuteOpenChat(false, true), false);
  assert.equal(muteOpenChatBlocked(openGate), false);
  assert.equal(muteOpenChatBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(muteOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("mute order matches the sidebar toggle and a repeat does not flap", () => {
  let ids = toggleChatMute([], "a");
  ids = toggleChatMute(ids, "b");
  assert.deepEqual(ids, ["a", "b"]);
  ids = toggleChatMute(ids, "a");
  assert.deepEqual(ids, ["b"]);
  ids = toggleChatMute(ids, "a");
  assert.deepEqual(ids, ["b", "a"]);
  const held = ids;
  assert.equal(muteOpenChatShouldToggle({ repeat: true }), false);
  assert.deepEqual(held, ids);
  assert.equal(paintsUnreadAccent(true, true), false);
  assert.equal(paintsUnreadAccent(false, true), true);
  assert.equal(replyMayMarkUnread(true), false);
  assert.equal(replyMayMarkUnread(false), true);
  assert.deepEqual([...audibleUnreadIds(new Set(["a", "b"]), ["a"])], ["b"]);
  assert.equal(typeof writeChatMutes, "function");
});

test("desktop wires Cmd/Ctrl-Shift-M to the existing sidebar Mute path", () => {
  const block = sliceFn(
    app,
    "const onMuteOpenChat",
    'addEventListener("keydown", onMuteOpenChat, true)',
  );
  assert.match(block, /isMuteOpenChatChord\(/);
  assert.match(block, /muteOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsMuteOpenChat\(/);
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
  assert.match(block, /muteOpenChatShouldToggle/);
  assert.match(block, /muteOpenChatRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const toggleAt = block.indexOf("muteOpenChatShouldToggle");
  const callAt = block.indexOf("muteOpenChatRef.current()");
  assert.ok(preventAt >= 0 && toggleAt > preventAt && callAt > toggleAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /writeChatMutes/);
  assert.doesNotMatch(block, /toggleChatMute\(/);
  assert.doesNotMatch(block, /setMutedChatIds/);

  const call = sliceFn(app, "muteOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(call, /active\?\.id/);
  assert.match(call, /onToggleMute\(id\)/);
  assert.doesNotMatch(call, /writeChatMutes/);
  assert.doesNotMatch(call, /onSend\(/);

  const muteFn = sliceFn(app, "function onToggleMute(", "// v0.96: archived chats");
  assert.match(muteFn, /toggleChatMute\(mutedChatIdsRef\.current, id\)/);
  assert.match(muteFn, /writeChatMutes\(browserMuteStorage\(\), next\)/);
  assert.match(muteFn, /chatUnread\.current\.clear\(id\)/);
  assert.match(muteFn, /publishReplyUnread\(\)/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "mute-chat");
  assert.ok(row);
  assert.equal(row.keys, MUTE_OPEN_CHAT_KEYS);
  assert.equal(row.action, MUTE_OPEN_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift M/);
  assert.match(shortcuts, /Mute or unmute this chat/);
  assert.match(shortcuts, /v1\.09/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-M uses toggleChatMute; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧M"/);
  assert.match(swift, /static let action = "Mute or unmute this chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func muteOpenChatKey/);
  assert.match(chat, /MuteOpenChat\.isChord/);
  assert.match(chat, /model\.toggleChatMute\(agent\.id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func muteOpenChatFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func muteOpenChatKey", "func muteOpenChatFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const toggleAt = keyFn.indexOf("toggleChatMute");
  assert.ok(repeatAt >= 0 && toggleAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func muteOpenChatFromComposer", "func chatNavKey");
  assert.match(fromComposer, /model\.toggleChatMute\(agent\.id\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(composer, "func muteOpenChatCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "m"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func muteOpenChatFromShortcut/);
  const selector = sliceFn(composer, "func muteOpenChatFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /muteOpenChatConsumed/);
  assert.match(selector, /onMuteOpenChat\?\(\)/);
  const consumedAt = selector.indexOf("if muteOpenChatConsumed");
  const setAt = selector.indexOf("muteOpenChatConsumed = true");
  const fireAt = selector.indexOf("onMuteOpenChat?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /muteOpenChatConsumed/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const muteFn = sliceFn(model, "func toggleChatMute(_ id: String)", "func chatDisplayName");
  assert.match(muteFn, /ChatMute\.toggle\(mutedChatIDs, id: id\)/);
  assert.match(muteFn, /chatUnread\.clear\(id\)/);
  assert.match(muteFn, /publishReplyUnread\(\)/);
  assert.match(model, /didSet \{ ChatMute\.write\(mutedChatIDs\) \}/);
  assert.match(list, /model\.toggleChatMute\(agent\.id\)/);

  assert.match(sheet, /MuteOpenChat\.keysLabel/);
  assert.match(sheet, /MuteOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /muteOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_mute_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.09 /);
  assert.match(roadmap, /mute or unmute the open chat from the keyboard/);
  assert.match(spec, /## 109\. v1\.09/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
