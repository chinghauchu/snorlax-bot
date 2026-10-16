// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { showAssistantRegenerate } from "./messageActions.ts";
import { isNextUnreadChord } from "./nextUnreadChat.ts";
import {
  REGENERATE_LAST_REPLY_ACTION,
  REGENERATE_LAST_REPLY_KEYS,
  isRegenerateLastReplyChord,
  overlayTextFieldOwnsRegenerateLastReply,
  regenerateLastReplyAllowed,
  regenerateLastReplyBlocked,
  regenerateLastReplyShouldRun,
} from "./regenerateLastReply.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "regenerateLastReply.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "RegenerateLastReply.swift"),
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
  "v1.18 regenerate the last assistant reply from the keyboard (Cmd/Ctrl-Shift-Y regenerates the latest completed assistant LEFT kind=message in the open chat through the same path as the Regenerate hover control, POST { regenerate: true }; only the latest completed LEFT in a 1:1 chat that already allows Regenerate; skip when no chat is open, there is no completed LEFT, a reply is still streaming, Regenerate would not be shown, or the chat is a channel; the chord still works from the composer and does not insert text; a key repeat does not regenerate again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift Y; iOS hardware command-shift-Y regenerates that reply and is listed in Gestures & shortcuts; no new HTTP)";

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

const left = { kind: "message", role: "assistant", senderId: "agent" };
const user = { kind: "message", role: "user", senderId: "user" };

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("Cmd/Ctrl-Shift-Y regenerates; other chords do not", () => {
  assert.equal(isRegenerateLastReplyChord({ key: "y", metaKey: true, shiftKey: true }), true);
  assert.equal(isRegenerateLastReplyChord({ key: "Y", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isRegenerateLastReplyChord({ key: "Y", metaKey: true, shiftKey: true }), true);
  assert.equal(isRegenerateLastReplyChord({ key: "y", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isRegenerateLastReplyChord({ key: "y", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isRegenerateLastReplyChord({ key: "y", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "y", ctrlKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "y", shiftKey: true }), false);
  assert.equal(
    isRegenerateLastReplyChord({ key: "y", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isRegenerateLastReplyChord({ key: "y", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isRegenerateLastReplyChord({ key: "y" }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "h", metaKey: true, shiftKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "j", metaKey: true, shiftKey: true }), false);
  assert.equal(isNextUnreadChord({ key: "y", metaKey: true, shiftKey: true }), false);
  assert.equal(isNextUnreadChord({ key: "Y", ctrlKey: true, shiftKey: true }), false);
  assert.equal(isNextUnreadChord({ key: "j", metaKey: true, shiftKey: true }), true);
  assert.equal(isRegenerateLastReplyChord({ key: "i", metaKey: true, shiftKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "k", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "f", metaKey: true, shiftKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "l", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "n", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "/", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "1", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "PageUp" }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "Home", metaKey: true }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "Escape" }), false);
  assert.equal(isRegenerateLastReplyChord({ key: "ArrowUp" }), false);
  assert.equal(regenerateLastReplyShouldRun({ repeat: false }), true);
  assert.equal(regenerateLastReplyShouldRun({}), true);
  assert.equal(regenerateLastReplyShouldRun({ repeat: true }), false);
  assert.equal(REGENERATE_LAST_REPLY_KEYS, "Cmd/Ctrl Shift Y");
  assert.equal(REGENERATE_LAST_REPLY_ACTION, "Regenerate the last reply");
});

test("the composer does not own the chord; overlays and an empty chat do", () => {
  assert.equal(overlayTextFieldOwnsRegenerateLastReply(true, true), false);
  assert.equal(overlayTextFieldOwnsRegenerateLastReply(true, false), true);
  assert.equal(overlayTextFieldOwnsRegenerateLastReply(false, false), false);
  assert.equal(overlayTextFieldOwnsRegenerateLastReply(false, true), false);
  assert.equal(regenerateLastReplyBlocked(openGate), false);
  assert.equal(regenerateLastReplyBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(regenerateLastReplyBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("regenerate only when the hover control would show on the latest completed LEFT", () => {
  const messages = [user, left, { kind: "tool", role: "assistant" }, left];
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: false,
      messages,
      liveAssistantIdx: -1,
    }),
    true,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: false,
      messages,
      liveAssistantIdx: -1,
    }),
    showAssistantRegenerate({
      message: left,
      completed: true,
      isLatest: true,
      isChannel: false,
      streaming: false,
    }),
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: false,
      isChannel: false,
      streaming: false,
      messages,
      liveAssistantIdx: -1,
    }),
    false,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: true,
      streaming: false,
      messages,
      liveAssistantIdx: -1,
    }),
    false,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: true,
      messages,
      liveAssistantIdx: 3,
    }),
    false,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: true,
      messages: [user, left],
      liveAssistantIdx: -1,
    }),
    false,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: false,
      messages: [user],
      liveAssistantIdx: -1,
    }),
    false,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: false,
      messages: [],
      liveAssistantIdx: -1,
    }),
    false,
  );
  assert.equal(
    regenerateLastReplyAllowed({
      chatOpen: true,
      isChannel: false,
      streaming: false,
      messages: [user, { kind: "widget", role: "assistant" }],
      liveAssistantIdx: -1,
    }),
    false,
  );
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("desktop wires Cmd/Ctrl-Shift-Y to the existing Regenerate path", () => {
  const block = sliceFn(
    app,
    "const onRegenerateLastReply",
    'addEventListener("keydown", onRegenerateLastReply, true)',
  );
  assert.match(block, /isRegenerateLastReplyChord\(/);
  assert.match(block, /regenerateLastReplyBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsRegenerateLastReply\(/);
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
  assert.match(block, /regenerateLastReplyShouldRun/);
  assert.match(block, /regenerateLastReplyRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("regenerateLastReplyShouldRun");
  const callAt = block.indexOf("regenerateLastReplyRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const call = sliceFn(app, "regenerateLastReplyRef.current = () => {", "useEffect(() => {");
  assert.match(call, /regenerateLastReplyAllowed\(/);
  assert.match(call, /onRegenerate\(\)/);
  assert.match(call, /active\?\.kind === "channel"/);
  assert.match(call, /streaming: busy/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /fetch\(/);
  assert.match(app, /onRegenerate\(\) \{[\s\S]*regeneratePostBody\(\)/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "regenerate-last");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, REGENERATE_LAST_REPLY_KEYS);
  assert.equal(shortcut.action, REGENERATE_LAST_REPLY_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift Y/);
  assert.match(shortcuts, /Regenerate the last reply/);
  assert.match(shortcuts, /v1\.18/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-Y regenerates that reply; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧Y"/);
  assert.match(swift, /static let action = "Regenerate the last reply"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func regenerateLastReplyKey/);
  assert.match(chat, /RegenerateLastReply\.isChord/);
  assert.match(chat, /showsRegenerate\(/);
  assert.match(chat, /model\.regenerate\(\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func regenerateLastReplyFromComposer/);
  const keyFn = sliceFn(chat, "func regenerateLastReplyKey", "func regenerateLastReplyFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /regenerateLastReplyFromChord\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const runAt = keyFn.indexOf("regenerateLastReplyFromChord()");
  assert.ok(repeatAt >= 0 && runAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(
    chat,
    "func regenerateLastReplyFromComposer",
    "func regenerateLastReplyBlocked",
  );
  assert.match(fromComposer, /regenerateLastReplyFromChord\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  const run = sliceFn(chat, "func regenerateLastReplyFromChord", "func focusComposerKey");
  assert.match(run, /showsRegenerate\(/);
  assert.match(run, /await model\.regenerate\(\)/);
  assert.match(run, /agent\.isChannel/);
  assert.match(run, /model\.isSending/);
  assert.doesNotMatch(run, /model\.send\(/);

  assert.match(model, /func regenerate\(\) async/);
  assert.match(model, /regenerate: true/);

  const commands = sliceFn(composer, "func regenerateLastReplyCommands", "func chatNavCommands");
  assert.match(commands, /input: "y"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func regenerateLastReplyFromShortcut/);
  const selector = sliceFn(composer, "func regenerateLastReplyFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /regenerateLastReplyConsumed/);
  assert.match(selector, /onRegenerateLastReply\?\(\)/);
  const consumedAt = selector.indexOf("if regenerateLastReplyConsumed");
  const setAt = selector.indexOf("regenerateLastReplyConsumed = true");
  const fireAt = selector.indexOf("onRegenerateLastReply?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardY/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /RegenerateLastReply\.keysLabel/);
  assert.match(sheet, /RegenerateLastReply\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /regenerateLastReply\.test\.ts/);
  assert.match(ci, /test_ios_regenerate_last_reply\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.18 /);
  assert.match(roadmap, /regenerate the last reply from the keyboard/);
  assert.match(spec, /## 118\. v1\.18/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
