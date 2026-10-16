// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { isUnarchiveOpenChatChord } from "./unarchiveOpenChat.ts";
import {
  CHAT_HISTORY_ACTION,
  CHAT_HISTORY_KEYS,
  chatHistoryBlocked,
  chatHistoryDirection,
  chatHistoryShouldMove,
  emptyChatOpenHistory,
  noteChatOpenClosed,
  overlayTextFieldOwnsChatHistory,
  recordChatOpen,
  seedChatOpenHistory,
  stepChatOpenHistory,
  type ChatOpenHistory,
} from "./chatOpenHistory.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatOpenHistory.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatOpenHistory.swift"),
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
  "v1.23 keyboard back and forward between recently opened chats (Cmd/Ctrl-[ opens the previously opened chat and Cmd/Ctrl-] opens the next one again, using a small in-memory per-window history of chat opens; opening a chat from the sidebar, the quick switcher, Cmd/Ctrl-1..9, next or previous unread, Alt+Up/Down, and the other open paths pushes onto that history; going back and then opening a new chat truncates the forward history; deleted chats are skipped; archived chats stay valid targets; either end is a no-op; the chord still works from the composer and does not insert text; a key repeat does not move again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-B, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, Cmd/Ctrl-Shift-H, Cmd/Ctrl-Shift-J, Cmd/Ctrl-Shift-Y, Cmd/Ctrl-Shift-S, Cmd/Ctrl-Shift-O, Cmd/Ctrl-Shift-K, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl [ / ]; iOS hardware command-[ and command-] (and the control variants) move through that history and are listed in Gestures & shortcuts; no new HTTP)";

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

function alive(ids: string[]) {
  const keep = new Set(ids);
  return (id: string) => keep.has(id);
}

function open(history: ChatOpenHistory, id: string): ChatOpenHistory {
  return recordChatOpen(history, id);
}

test("history pushes, truncates forward, and no-ops at the ends", () => {
  let history = emptyChatOpenHistory();
  assert.equal(stepChatOpenHistory(history, "back", alive(["a"])).id, null);
  assert.equal(stepChatOpenHistory(history, "forward", alive(["a"])).id, null);
  history = seedChatOpenHistory("a");
  assert.deepEqual(history, { ids: ["a"], index: 0 });
  assert.equal(stepChatOpenHistory(history, "back", alive(["a"])).id, null);
  history = open(history, "b");
  history = open(history, "c");
  assert.deepEqual(history.ids, ["a", "b", "c"]);
  assert.equal(history.index, 2);
  history = open(history, "c");
  assert.deepEqual(history.ids, ["a", "b", "c"]);
  const back = stepChatOpenHistory(history, "back", alive(["a", "b", "c"]));
  assert.equal(back.id, "b");
  assert.equal(back.history.index, 1);
  const backAgain = stepChatOpenHistory(back.history, "back", alive(["a", "b", "c"]));
  assert.equal(backAgain.id, "a");
  assert.equal(stepChatOpenHistory(backAgain.history, "back", alive(["a", "b", "c"])).id, null);
  const forward = stepChatOpenHistory(back.history, "forward", alive(["a", "b", "c"]));
  assert.equal(forward.id, "c");
  assert.equal(stepChatOpenHistory(forward.history, "forward", alive(["a", "b", "c"])).id, null);
  const branched = open(back.history, "d");
  assert.deepEqual(branched.ids, ["a", "b", "d"]);
  assert.equal(branched.index, 2);
  assert.equal(stepChatOpenHistory(branched, "forward", alive(["a", "b", "d"])).id, null);
  assert.equal(stepChatOpenHistory(branched, "back", alive(["a", "b", "d"])).id, "b");
});

test("deleted chats are skipped and archived chats stay valid", () => {
  let history = seedChatOpenHistory("a");
  history = open(history, "b");
  history = open(history, "c");
  const skipped = stepChatOpenHistory(history, "back", alive(["a", "c"]));
  assert.equal(skipped.id, "a");
  assert.equal(skipped.history.index, 0);
  assert.deepEqual(skipped.history.ids, ["a", "b", "c"]);
  const forward = stepChatOpenHistory(skipped.history, "forward", alive(["a", "c"]));
  assert.equal(forward.id, "c");
  assert.equal(forward.history.index, 2);
  const archived = stepChatOpenHistory(history, "back", alive(["a", "b", "c"]));
  assert.equal(archived.id, "b");
  const onlyDeleted = stepChatOpenHistory(history, "back", alive(["c"]));
  assert.equal(onlyDeleted.id, null);
  assert.equal(onlyDeleted.history.index, 2);
  const hole = stepChatOpenHistory(
    { ids: ["gone", "also"], index: 1 },
    "back",
    alive(["kept"]),
  );
  assert.equal(hole.id, null);
  assert.equal(recordChatOpen(history, "  ").ids.length, 3);
  assert.equal(seedChatOpenHistory("  ").index, -1);
  assert.equal(seedChatOpenHistory(null).index, -1);
});

test("closing the last chat parks so Back can return, including an archived chat", () => {
  let history = open(open(emptyChatOpenHistory(), "a"), "b");
  history = noteChatOpenClosed(history);
  assert.equal(history.index, 2);
  history = noteChatOpenClosed(history);
  assert.equal(history.index, 2);
  const back = stepChatOpenHistory(history, "back", alive(["a", "b"]));
  assert.equal(back.id, "b");
  assert.equal(stepChatOpenHistory(history, "forward", alive(["a", "b"])).id, null);
  const reopened = recordChatOpen(history, "b");
  assert.deepEqual(reopened.ids, ["a", "b"]);
  assert.equal(reopened.index, 1);
  const elsewhere = recordChatOpen(history, "c");
  assert.deepEqual(elsewhere.ids, ["a", "b", "c"]);
  assert.equal(noteChatOpenClosed(emptyChatOpenHistory()).index, -1);
});

test("Cmd/Ctrl-[ and Cmd/Ctrl-] move; other chords do not", () => {
  assert.equal(chatHistoryDirection({ key: "[", metaKey: true }), "back");
  assert.equal(chatHistoryDirection({ key: "]", ctrlKey: true }), "forward");
  assert.equal(chatHistoryDirection({ key: "BracketLeft", metaKey: true }), "back");
  assert.equal(chatHistoryDirection({ key: "BracketRight", ctrlKey: true }), "forward");
  assert.equal(
    chatHistoryDirection({ key: "[", metaKey: true, repeat: true }),
    "back",
  );
  assert.equal(chatHistoryDirection({ key: "[" }), null);
  assert.equal(chatHistoryDirection({ key: "[", shiftKey: true }), null);
  assert.equal(chatHistoryDirection({ key: "[", altKey: true, metaKey: true }), null);
  assert.equal(
    chatHistoryDirection({ key: "[", metaKey: true, ctrlKey: true }),
    null,
  );
  assert.equal(chatHistoryDirection({ key: "{", metaKey: true, shiftKey: true }), null);
  assert.equal(chatHistoryDirection({ key: "b", metaKey: true, shiftKey: true }), null);
  assert.equal(isUnarchiveOpenChatChord({ key: "[", metaKey: true }), false);
  assert.equal(chatHistoryShouldMove({}), true);
  assert.equal(chatHistoryShouldMove({ repeat: true }), false);
  assert.equal(chatHistoryBlocked(openGate), false);
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
    assert.equal(chatHistoryBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(overlayTextFieldOwnsChatHistory(true, true), false);
  assert.equal(overlayTextFieldOwnsChatHistory(true, false), true);
  assert.equal(overlayTextFieldOwnsChatHistory(false, false), false);
  assert.equal(CHAT_HISTORY_KEYS, "Cmd/Ctrl [ / ]");
  assert.equal(CHAT_HISTORY_ACTION, "Back or forward chat");
});

test("desktop and iOS wire the history through the existing open path", () => {
  const load = app.slice(
    app.indexOf("async function loadConversation"),
    app.indexOf("async function selectAgent"),
  );
  assert.match(load, /historyMode === "record"/);
  assert.match(load, /recordChatOpen\(chatOpenHistoryRef\.current, id\)/);
  assert.match(load, /moveComposer\(id, thread\)/);
  const handler = app.slice(
    app.indexOf("const onChatHistory"),
    app.indexOf('addEventListener("keydown", onChatHistory, true)'),
  );
  assert.match(handler, /chatHistoryDirection/);
  assert.match(handler, /chatHistoryBlocked/);
  assert.match(handler, /overlayTextFieldOwnsChatHistory/);
  assert.match(handler, /focusInsideCard/);
  assert.match(handler, /isComposerComposing/);
  assert.ok(handler.indexOf("preventDefault") < handler.indexOf("chatHistoryShouldMove"));
  assert.ok(handler.indexOf("chatHistoryShouldMove") < handler.indexOf("openChatHistoryRef.current"));
  assert.match(handler, /composerRef\.current/);
  assert.doesNotMatch(handler, /recordChatOpen/);
  const restore = app.slice(
    app.indexOf("openChatHistoryRef.current = (direction)"),
    app.indexOf("const onChatHistory"),
  );
  assert.match(restore, /stepChatOpenHistory/);
  assert.match(restore, /rosterIdsRef\.current\.has\(id\)/);
  assert.match(restore, /"restore"/);
  assert.doesNotMatch(restore, /recordChatOpen/);
  assert.match(app, /seedChatOpenHistory\(preferred\)/);
  assert.match(app, /seedChatOpenHistory\(SEED_CHANNEL_ID\)/);
  assert.match(app, /recordChatOpen\(chatOpenHistoryRef\.current, agent\.id\)/);
  assert.match(app, /recordChatOpen\(chatOpenHistoryRef\.current, channel\.id\)/);
  assert.match(app, /recordChatOpen\(chatOpenHistoryRef\.current, next\)/);
  assert.match(app, /noteChatOpenClosed\(chatOpenHistoryRef\.current\)/);
  assert.match(shortcuts, /Cmd\/Ctrl \[ \/ \]/);
  const row = CHAT_SHORTCUTS.find((item) => item.id === "chat-history");
  assert.equal(row?.keys, CHAT_HISTORY_KEYS);
  assert.equal(row?.action, CHAT_HISTORY_ACTION);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /static let keysLabel = "⌘\[ \/ ⌘\]"/);
  assert.match(swift, /static let action = "Back or forward chat"/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(sheet, /ChatOpenHistory\.keysLabel/);
  assert.match(sheet, /ChatOpenHistory\.action/);
  assert.match(sheet, /Gestures & shortcuts/);
  const key = chat.slice(chat.indexOf("func chatHistoryKey"), chat.indexOf("func chatHistoryFromComposer"));
  assert.match(key, /ChatOpenHistory\.direction/);
  assert.match(key, /composerFocused/);
  assert.match(key, /chatHistoryBlocked\(\)/);
  assert.match(key, /overlayTextFieldOwnsChord/);
  assert.match(key, /shouldIgnoreRepeat/);
  assert.match(key, /model\.openChatFromHistory/);
  assert.ok(key.indexOf("shouldIgnoreRepeat") < key.indexOf("model.openChatFromHistory"));
  assert.doesNotMatch(key, /model\.send\(/);
  const fromComposer = chat.slice(
    chat.indexOf("func chatHistoryFromComposer"),
    chat.indexOf("func chatHistoryBlocked"),
  );
  assert.match(fromComposer, /model\.openChatFromHistory/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  const blocked = chat.slice(
    chat.indexOf("func chatHistoryBlocked"),
    chat.indexOf("func unarchiveOpenChatBlocked"),
  );
  assert.match(blocked, /findOpen/);
  assert.match(blocked, /shortcutsOpen/);
  assert.match(blocked, /lightbox != nil/);
  assert.match(blocked, /renameChatID != nil/);
  assert.match(model, /func openChatFromHistory/);
  assert.match(model, /recordHistory: false/);
  assert.match(model, /ChatOpenHistory\.record/);
  assert.match(model, /ChatOpenHistory\.noteClosed/);
  assert.match(model, /visibleAgents\.map/);
  const opener = model.slice(
    model.indexOf("func openChatFromHistory"),
    model.indexOf("func unarchiveChat"),
  );
  assert.match(opener, /recordHistory: false/);
  assert.match(opener, /wantsComposerFocus = true/);
  assert.doesNotMatch(opener, /ChatOpenHistory\.record/);
  assert.match(list, /model\.openChatFromHistory/);
  assert.match(list, /ChatOpenHistory\.direction/);
  const commands = composer.slice(
    composer.indexOf("func chatHistoryCommands"),
    composer.indexOf("func chatHistoryFromShortcut"),
  );
  assert.match(commands, /input: "\["/);
  assert.match(commands, /input: "\]"/);
  assert.match(commands, /modifierFlags: \.command/);
  assert.match(commands, /modifierFlags: \.control/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  const selector = composer.slice(
    composer.indexOf("func chatHistoryFromShortcut"),
    composer.indexOf("func unarchiveOpenChatCommands"),
  );
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /chatHistoryBackConsumed/);
  assert.match(selector, /chatHistoryForwardConsumed/);
  assert.match(selector, /onChatHistory\?\("back"\)/);
  assert.match(selector, /onChatHistory\?\("forward"\)/);
  assert.ok(selector.indexOf("if chatHistoryBackConsumed") < selector.indexOf('onChatHistory?("back")'));
  assert.match(composer, /keyboardOpenBracket/);
  assert.match(composer, /keyboardCloseBracket/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("OpenAPI stays 0.18.0 and the roadmap lists v1.23", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.23 /);
  assert.match(spec, /## 123\. v1\.23/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_chat_open_history\.py/);
  assert.match(pkg, /src\/chatOpenHistory\.test\.ts/);
});
