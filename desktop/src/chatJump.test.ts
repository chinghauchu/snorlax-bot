// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  CHAT_JUMP_ACTION,
  CHAT_JUMP_KEYS,
  chatIdAtJumpSlot,
  chatJumpBlocked,
  chatJumpSlot,
  overlayTextFieldOwnsChatJump,
  visibleJumpIds,
} from "./chatJump.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatJump.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatJump.swift"),
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
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);

const PHRASE =
  "v1.05 jump to a numbered chat (Cmd/Ctrl-1 through Cmd/Ctrl-8 opens that chat in the sidebar's current visible order, the same order Alt+Up/Down uses: the Pinned group first, section headers ignored, the All / Unread filter applied, archived chats excluded unless the archived list is showing; Cmd/Ctrl-9 opens the last visible chat, matching Slack and browsers; a number past the visible count does nothing; the chord works while the composer is focused and opening the chat is the same as clicking the sidebar row, so per-chat drafts stay; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-/, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl 1-9; iOS hardware command-1 through command-9 uses the chat list order, with command-9 opening the last chat, and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-1 through Cmd/Ctrl-9 is the jump chord; other chords are not", () => {
  assert.equal(chatJumpSlot({ key: "1", metaKey: true }), 1);
  assert.equal(chatJumpSlot({ key: "8", ctrlKey: true }), 8);
  assert.equal(chatJumpSlot({ key: "9", metaKey: true }), 9);
  assert.equal(chatJumpSlot({ key: "9", ctrlKey: true }), 9);
  assert.equal(chatJumpSlot({ key: "1", metaKey: true, shiftKey: true }), null);
  assert.equal(chatJumpSlot({ key: "1", ctrlKey: true, altKey: true }), null);
  assert.equal(chatJumpSlot({ key: "1", metaKey: true, ctrlKey: true }), null);
  assert.equal(chatJumpSlot({ key: "1", metaKey: true, repeat: true }), null);
  assert.equal(chatJumpSlot({ key: "1" }), null);
  assert.equal(chatJumpSlot({ key: "0", metaKey: true }), null);
  assert.equal(chatJumpSlot({ key: "k", metaKey: true }), null);
  assert.equal(chatJumpSlot({ key: "n", ctrlKey: true }), null);
  assert.equal(chatJumpSlot({ key: "f", metaKey: true }), null);
  assert.equal(chatJumpSlot({ key: "l", metaKey: true }), null);
  assert.equal(chatJumpSlot({ key: "c", metaKey: true, shiftKey: true }), null);
  assert.equal(chatJumpSlot({ key: "/", metaKey: true }), null);
  assert.equal(chatJumpSlot({ key: "ArrowUp", altKey: true }), null);
  assert.equal(chatJumpSlot({ key: "ArrowDown", altKey: true }), null);
  assert.equal(chatJumpSlot({ key: "PageUp" }), null);
  assert.equal(chatJumpSlot({ key: "PageDown", ctrlKey: true }), null);
  assert.equal(chatJumpSlot({ key: "Home", metaKey: true }), null);
  assert.equal(chatJumpSlot({ key: "End", ctrlKey: true }), null);
  assert.equal(chatJumpSlot({ key: "Escape" }), null);
  assert.equal(chatJumpSlot({ key: "ArrowUp" }), null);
  assert.equal(CHAT_JUMP_KEYS, "Cmd/Ctrl 1-9");
  assert.equal(CHAT_JUMP_ACTION, "Open a chat (9 is last)");
});

test("slots 1-8 are indexes, 9 is the last chat, and a missing slot is nothing", () => {
  const three = ["a", "b", "c"];
  assert.equal(chatIdAtJumpSlot(three, 1), "a");
  assert.equal(chatIdAtJumpSlot(three, 2), "b");
  assert.equal(chatIdAtJumpSlot(three, 3), "c");
  assert.equal(chatIdAtJumpSlot(three, 4), null);
  assert.equal(chatIdAtJumpSlot(three, 8), null);
  assert.equal(chatIdAtJumpSlot(three, 9), "c");
  const twelve = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
  assert.equal(chatIdAtJumpSlot(twelve, 8), "h");
  assert.equal(chatIdAtJumpSlot(twelve, 9), "l");
  assert.notEqual(chatIdAtJumpSlot(twelve, 9), "i");
  const nine = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  assert.equal(chatIdAtJumpSlot(nine, 9), "i");
  assert.equal(chatIdAtJumpSlot(["only"], 9), "only");
  assert.equal(chatIdAtJumpSlot(["only"], 2), null);
  assert.equal(chatIdAtJumpSlot([], 1), null);
  assert.equal(chatIdAtJumpSlot([], 9), null);
  assert.equal(chatIdAtJumpSlot(three, 0), null);
  assert.equal(chatIdAtJumpSlot(three, 10), null);
  assert.equal(chatIdAtJumpSlot(three, 1.5), null);
});

test("visible order is pinned then the rest; archive joins only while it is showing", () => {
  const main = ["pin-a", "pin-b", "chat-c"];
  const archived = ["old-1", "old-2"];
  assert.deepEqual(
    visibleJumpIds({
      mainIds: main,
      archivedIds: archived,
      archiveListShowing: false,
    }),
    main,
  );
  assert.deepEqual(
    visibleJumpIds({
      mainIds: main,
      archivedIds: archived,
      archiveListShowing: true,
    }),
    ["pin-a", "pin-b", "chat-c", "old-1", "old-2"],
  );
  assert.deepEqual(
    visibleJumpIds({
      mainIds: main,
      archivedIds: archived,
      archiveListShowing: true,
      archiveReplacesMain: true,
    }),
    archived,
  );
  assert.deepEqual(
    visibleJumpIds({
      mainIds: ["", "pin-a"],
      archivedIds: ["", "old-1", "pin-a"],
      archiveListShowing: true,
    }),
    ["pin-a", "old-1"],
  );
  assert.equal(
    chatIdAtJumpSlot(
      visibleJumpIds({
        mainIds: main,
        archivedIds: archived,
        archiveListShowing: true,
      }),
      9,
    ),
    "old-2",
  );
});

test("the composer does not own the chord; IME, overlays, and cards do", () => {
  assert.equal(overlayTextFieldOwnsChatJump(true, true), false);
  assert.equal(overlayTextFieldOwnsChatJump(true, false), true);
  assert.equal(overlayTextFieldOwnsChatJump(false, false), false);
  assert.equal(overlayTextFieldOwnsChatJump(false, true), false);
  assert.equal(chatJumpBlocked(openGate), false);
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
    assert.equal(chatJumpBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("desktop wires the chord to the same open path as a sidebar click", () => {
  const order = sliceFn(app, "const jumpChatIds = visibleJumpIds(", "const jumpChatKey");
  assert.match(order, /pinnedAgents/);
  assert.match(order, /restAgents/);
  assert.match(order, /archivedAgents/);
  assert.match(order, /archiveListShowing: archiveOpen/);
  assert.doesNotMatch(order, /PINNED_GROUP_LABEL/);
  assert.doesNotMatch(order, /CHATS_SECTION_LABEL/);
  assert.doesNotMatch(order, /archiveReplacesMain: true/);

  const block = sliceFn(
    app,
    "const onJumpChatKey",
    'addEventListener("keydown", onJumpChatKey, true)',
  );
  assert.match(block, /chatJumpSlot\(/);
  assert.match(block, /chatJumpBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsChatJump\(/);
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
  assert.match(block, /chatIdAtJumpSlot\(ids, slot\)/);
  assert.match(block, /preventDefault/);
  assert.match(block, /stopPropagation/);
  assert.match(block, /selectAgentRef\.current\(id\)/);
  const preventAt = block.indexOf("preventDefault");
  const selectAt = block.indexOf("selectAgentRef.current(id)");
  assert.ok(preventAt >= 0 && selectAt > preventAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /onCreate\(/);
  assert.match(app, /onClick=\{\(\) => void selectAgent\(agent\.id\)\}/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "jump-chat");
  assert.ok(row);
  assert.equal(row.keys, CHAT_JUMP_KEYS);
  assert.equal(row.action, CHAT_JUMP_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl 1-9/);
  assert.match(shortcuts, /Open a chat \(9 is last\)/);
  assert.match(shortcuts, /v1\.05/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-1 through command-9 uses the chat list order; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘1-⌘9"/);
  assert.match(swift, /static let action = "Open a chat \(9 is last\)"/);
  assert.match(swift, /static func slot/);
  assert.match(swift, /static func target/);
  assert.match(swift, /static func order/);
  assert.match(swift, /archiveReplacesMain/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func jumpChatKey/);
  assert.match(chat, /ChatJump\.slot/);
  assert.match(chat, /openChatAtJumpSlot/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(list, /func jumpChatKey/);
  assert.match(list, /ChatJump\.slot/);
  assert.match(list, /openChatAtJumpSlot/);
  assert.match(list, /archiveListShowing = showArchived/);
  assert.match(model, /func openChatAtJumpSlot/);
  assert.match(model, /func jumpChatIds/);
  assert.match(model, /archiveReplacesMain: true/);
  assert.match(model, /await select\(id, push: true\)/);
  assert.match(model, /wantsComposerFocus = true/);
  assert.match(model, /visibleChatOrder\(\)/);
  assert.doesNotMatch(
    sliceFn(model, "func openChatAtJumpSlot", "func openJump"),
    /send\(/,
  );

  const commands = sliceFn(composer, "func jumpChatCommands", "func chatNavCommands");
  assert.match(commands, /input: digit/);
  assert.match(commands, /modifierFlags: \.command/);
  assert.match(commands, /modifierFlags: \.control/);
  assert.match(composer, /func jumpChatFromShortcut/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /onJumpChat\?\(slot\)/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /ChatJump\.keysLabel/);
  assert.match(sheet, /ChatJump\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatJump\.test\.ts/);
  assert.match(ci, /test_ios_chat_jump\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.05 /);
  assert.match(roadmap, /jump to a numbered chat/);
  assert.match(spec, /## 105\. v1\.05/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
