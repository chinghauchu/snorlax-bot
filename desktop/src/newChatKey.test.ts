// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  NEW_CHAT_ACTION,
  NEW_CHAT_KEYS,
  isNewChatChord,
  newChatBlocked,
  overlayTextFieldOwnsNewChat,
} from "./newChatKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "newChatKey.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "NewChat.swift"),
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
  "v1.04 new chat from the keyboard (Cmd/Ctrl-N starts a new chat through the same New agent path as the sidebar Create control; focus lands in the composer; the chord still works from the composer because the platform does nothing useful with it there; IME composition keeps the key; a modal or overlay text field, find, the quick switcher, the shortcuts list, rename, the lightbox, and a focused widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-Shift-C, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl N; iOS hardware command-N uses the same create path and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  ready: true,
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

test("Cmd/Ctrl-N starts a new chat; other chords do not", () => {
  assert.equal(isNewChatChord({ key: "n", metaKey: true }), true);
  assert.equal(isNewChatChord({ key: "N", ctrlKey: true }), true);
  assert.equal(isNewChatChord({ key: "n", ctrlKey: true }), true);
  assert.equal(isNewChatChord({ key: "N", metaKey: true }), true);
  assert.equal(isNewChatChord({ key: "n", metaKey: true, shiftKey: true }), false);
  assert.equal(isNewChatChord({ key: "n", ctrlKey: true, altKey: true }), false);
  assert.equal(isNewChatChord({ key: "n", metaKey: true, ctrlKey: true }), false);
  assert.equal(isNewChatChord({ key: "n", metaKey: true, repeat: true }), false);
  assert.equal(isNewChatChord({ key: "n" }), false);
  assert.equal(isNewChatChord({ key: "n", shiftKey: true }), false);
  assert.equal(isNewChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isNewChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isNewChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isNewChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isNewChatChord({ key: "c", ctrlKey: true }), false);
  assert.equal(isNewChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isNewChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isNewChatChord({ key: "ArrowDown", altKey: true }), false);
  assert.equal(isNewChatChord({ key: "PageUp" }), false);
  assert.equal(isNewChatChord({ key: "PageDown" }), false);
  assert.equal(isNewChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isNewChatChord({ key: "End", ctrlKey: true }), false);
  assert.equal(isNewChatChord({ key: "Escape" }), false);
  assert.equal(isNewChatChord({ key: "ArrowUp" }), false);
  assert.equal(NEW_CHAT_KEYS, "Cmd/Ctrl N");
  assert.equal(NEW_CHAT_ACTION, "New chat");
});

test("the composer does not own Cmd/Ctrl-N; a modal text field and IME do", () => {
  assert.equal(overlayTextFieldOwnsNewChat(true, true), false);
  assert.equal(overlayTextFieldOwnsNewChat(true, false), true);
  assert.equal(overlayTextFieldOwnsNewChat(false, false), false);
  assert.equal(overlayTextFieldOwnsNewChat(false, true), false);
  assert.equal(newChatBlocked(openGate), false);
  assert.equal(
    newChatBlocked({ ...openGate, overlayTextField: false }),
    false,
  );
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
    assert.equal(newChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(newChatBlocked({ ...openGate, ready: false }), true);
});

test("desktop wires Cmd/Ctrl-N to the existing New agent path", () => {
  const block = sliceFn(
    app,
    "const onNewChatKey",
    'addEventListener("keydown", onNewChatKey, true)',
  );
  assert.match(block, /isNewChatChord\(/);
  assert.match(block, /newChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsNewChat\(/);
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
  assert.match(block, /session !== null/);
  assert.match(block, /preventDefault/);
  assert.match(block, /stopPropagation/);
  assert.match(block, /createFromShortcutRef\.current\(\)/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /onStopGenerating/);
  assert.doesNotMatch(block, /closeFind\(\)/);
  assert.doesNotMatch(block, /closeSwitcher\(\)/);

  const call = sliceFn(app, "createFromShortcutRef.current = () => {", "useEffect(() => {");
  assert.match(call, /setCreateMenuOpen\(false\)/);
  assert.match(call, /void onCreate\(\)/);
  const create = sliceFn(app, "async function onCreate()", "async function onCreateChannel");
  assert.match(create, /createAgent\(session, "New agent"\)/);
  assert.match(create, /focusComposer\(\)/);
  assert.match(create, /placeCaretAtEnd\(\)/);
  assert.match(app, /New agent/);
  assert.match(app, /aria-label="Create"/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "new-chat");
  assert.ok(row);
  assert.equal(row.keys, NEW_CHAT_KEYS);
  assert.equal(row.action, NEW_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl N/);
  assert.match(shortcuts, /New chat/);
  assert.match(shortcuts, /v1\.04/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-N uses createAgent; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘N"/);
  assert.match(swift, /static let action = "New chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func newChatKey/);
  assert.match(chat, /NewChat\.isChord/);
  assert.match(chat, /createAgentFromChord\(\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(list, /func newChatKey/);
  assert.match(list, /NewChat\.isChord/);
  assert.match(list, /createAgentFromChord\(\)/);
  assert.match(list, /Button\("New agent"\)/);
  assert.match(model, /func createAgentFromChord/);
  assert.match(model, /await createAgent\(\)/);
  assert.match(model, /wantsComposerFocus = true/);
  assert.doesNotMatch(
    sliceFn(model, "func createAgentFromChord", "func createChannel"),
    /send\(/,
  );

  const commands = sliceFn(composer, "func newChatCommands", "func chatNavCommands");
  assert.match(commands, /input: "n"/);
  assert.match(commands, /modifierFlags: \.command/);
  assert.match(commands, /modifierFlags: \.control/);
  assert.match(composer, /func newChatFromShortcut/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /onNewChat\?\(\)/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /NewChat\.keysLabel/);
  assert.match(sheet, /NewChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /newChatKey\.test\.ts/);
  assert.match(ci, /test_ios_new_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.04 /);
  assert.match(roadmap, /new chat from the keyboard/);
  assert.match(spec, /## 104\. v1\.04/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
