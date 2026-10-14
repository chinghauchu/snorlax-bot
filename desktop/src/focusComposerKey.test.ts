// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { arrowUpRecalls } from "./recallDraft.ts";
import {
  FOCUS_COMPOSER_ACTION,
  FOCUS_COMPOSER_KEYS,
  appendDraftAtEnd,
  focusComposerChordBlocked,
  focusInsideCard,
  isFocusComposerChord,
  typeToFocusBlocked,
  typeToFocusCharacter,
} from "./focusComposerKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "focusComposerKey.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "FocusComposer.swift"),
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

const PHRASE =
  "v0.99 focus the composer (when the open chat is showing and focus is outside a text field, a printable character focuses the composer and lands at the end of the draft; Cmd/Ctrl-L focuses it and inserts nothing; Cmd/Ctrl, Alt, Esc, arrows, Tab, Enter, and IME are not captured; question mark still opens shortcuts; find, the quick switcher, the shortcuts list, rename, the lightbox, and a focused widget, approve, or connect card stay; nothing auto-sends; Up-arrow recall, Esc = Stop, Esc = Jump, Alt+Up/Down, and in-chat find stay; the shortcuts list includes Cmd/Ctrl L; iOS hardware command-L focuses the composer and is listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  chatOpen: true,
  editable: true,
  composing: false,
  inTextField: false,
  inCard: false,
  findOpen: false,
  switchOpen: false,
  shortcutsOpen: false,
  renaming: false,
  lightboxOpen: false,
  menuOpen: false,
  blocked: false,
};

test("Cmd/Ctrl-L focuses without inserting; printable keys append at the end", () => {
  assert.equal(isFocusComposerChord({ key: "l", metaKey: true }), true);
  assert.equal(isFocusComposerChord({ key: "L", ctrlKey: true }), true);
  assert.equal(isFocusComposerChord({ key: "l", metaKey: true, shiftKey: true }), false);
  assert.equal(isFocusComposerChord({ key: "l", ctrlKey: true, altKey: true }), false);
  assert.equal(isFocusComposerChord({ key: "l", metaKey: true, ctrlKey: true }), false);
  assert.equal(isFocusComposerChord({ key: "l", metaKey: true, repeat: true }), false);
  assert.equal(isFocusComposerChord({ key: "l" }), false);
  assert.equal(isFocusComposerChord({ key: "/", metaKey: true }), false);
  assert.equal(isFocusComposerChord({ key: "k", metaKey: true }), false);
  assert.equal(typeToFocusCharacter({ key: "l", metaKey: true }), null);

  assert.equal(typeToFocusCharacter({ key: "a" }), "a");
  assert.equal(typeToFocusCharacter({ key: "A", shiftKey: true }), "A");
  assert.equal(typeToFocusCharacter({ key: " " }), " ");
  assert.equal(typeToFocusCharacter({ key: "/" }), "/");
  assert.equal(typeToFocusCharacter({ key: "?" }), "?");
  assert.equal(typeToFocusCharacter({ key: "?", reserved: true }), null);
  assert.equal(typeToFocusCharacter({ key: "👍" }), "👍");
  assert.equal(typeToFocusCharacter({ key: "a", composing: true }), null);
  assert.equal(typeToFocusCharacter({ key: "a", altKey: true }), null);
  assert.equal(typeToFocusCharacter({ key: "a", ctrlKey: true }), null);
  assert.equal(typeToFocusCharacter({ key: "a", metaKey: true }), null);
  assert.equal(typeToFocusCharacter({ key: "Enter" }), null);
  assert.equal(typeToFocusCharacter({ key: "Escape" }), null);
  assert.equal(typeToFocusCharacter({ key: "Tab" }), null);
  assert.equal(typeToFocusCharacter({ key: "ArrowUp" }), null);
  assert.equal(typeToFocusCharacter({ key: "ArrowDown" }), null);
  assert.equal(typeToFocusCharacter({ key: "Backspace" }), null);
  assert.equal(typeToFocusCharacter({ key: "Dead" }), null);
  assert.equal(typeToFocusCharacter({ key: "Process" }), null);

  assert.deepEqual(appendDraftAtEnd("hello", "a"), { text: "helloa", caret: 6 });
  assert.deepEqual(appendDraftAtEnd("", "/"), { text: "/", caret: 1 });
  assert.deepEqual(appendDraftAtEnd("a", " "), { text: "a ", caret: 2 });
  assert.equal(FOCUS_COMPOSER_KEYS, "Cmd/Ctrl L");
  assert.equal(FOCUS_COMPOSER_ACTION, "Focus the composer");
});

test("overlays, cards, and a text field keep their keys", () => {
  assert.equal(focusComposerChordBlocked(openGate), false);
  assert.equal(typeToFocusBlocked(openGate), false);
  assert.equal(typeToFocusBlocked({ ...openGate, inTextField: true }), true);
  assert.equal(focusComposerChordBlocked({ ...openGate, inTextField: true }), false);
  for (const flag of [
    "composing",
    "inCard",
    "findOpen",
    "switchOpen",
    "shortcutsOpen",
    "renaming",
    "lightboxOpen",
    "menuOpen",
    "blocked",
  ] as const) {
    assert.equal(focusComposerChordBlocked({ ...openGate, [flag]: true }), true, flag);
    assert.equal(typeToFocusBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(focusComposerChordBlocked({ ...openGate, chatOpen: false }), true);
  assert.equal(focusComposerChordBlocked({ ...openGate, editable: false }), true);

  const card = { closest: (sel: string) => (sel.includes("widget-card") ? {} : null) };
  assert.equal(focusInsideCard(card), true);
  assert.equal(focusInsideCard({ closest: () => null }), false);
  assert.equal(focusInsideCard(null), false);
  assert.equal(focusInsideCard({} as EventTarget), false);
});

test("desktop wires the chord and type-to-focus without sending", () => {
  const start = app.indexOf("typeIntoComposerRef.current");
  assert.ok(start >= 0);
  const listen = app.indexOf('addEventListener("keydown", onFocusComposerKey, true)', start);
  assert.ok(listen > start);
  const block = app.slice(start, listen);
  assert.match(block, /appendDraftAtEnd\(draftRef\.current, character\)/);
  assert.match(block, /recallArmedAfterEdit/);
  assert.match(block, /syncComposerTriggers/);
  assert.match(block, /isFocusComposerChord\(/);
  assert.match(block, /focusComposerChordBlocked\(gate\)/);
  assert.match(block, /typeToFocusBlocked\(gate\)/);
  assert.match(block, /typeToFocusCharacter\(/);
  assert.match(block, /isShortcutsQuestion\(event, event\.target\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /focusIsTextField\(event\.target\)/);
  assert.match(block, /focusInsideCard\(event\.target\)/);
  assert.match(block, /findOpen/);
  assert.match(block, /switchOpen/);
  assert.match(block, /shortcutsOpen/);
  assert.match(block, /renamingId != null/);
  assert.match(block, /lightboxTarget != null/);
  assert.match(block, /contextMenu != null/);
  assert.match(block, /mentionOpen/);
  assert.match(block, /skillMenuOpen/);
  assert.match(block, /placeCaretAtEnd\(\)/);
  assert.match(block, /if \(!gate\.inTextField\)/);
  assert.match(block, /preventDefault/);
  assert.match(block, /stopPropagation/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /fillRecalledDraft/);
  assert.doesNotMatch(block, /closeFind\(/);
  assert.doesNotMatch(block, /stepFindIndex/);
  assert.doesNotMatch(block, /chatNavDirection/);
  assert.doesNotMatch(block, /arrowUpRecalls/);
  assert.equal(
    arrowUpRecalls({ key: "ArrowUp", composerText: "", composing: false }),
    true,
  );

  const row = CHAT_SHORTCUTS.find((item) => item.id === "focus");
  assert.ok(row);
  assert.equal(row.keys, FOCUS_COMPOSER_KEYS);
  assert.equal(row.action, FOCUS_COMPOSER_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl L/);
  assert.match(shortcuts, /Focus the composer/);
  assert.match(app, /CHAT_SHORTCUTS\.map/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS hardware command-L focuses; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘L"/);
  assert.match(swift, /static let action = "Focus the composer"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func focusComposerKey/);
  assert.match(chat, /FocusComposer\.isChord/);
  assert.match(chat, /composerFocused = true/);
  assert.match(chat, /pendingComposerCaret/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.doesNotMatch(
    chat.slice(chat.indexOf("func focusComposerKey"), chat.indexOf("private func openFind")),
    /model\.send\(/,
  );
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(composer, /input: "l"/);
  assert.match(composer, /modifierFlags: \.command/);
  assert.match(composer, /modifierFlags: \.control/);
  assert.match(composer, /func focusComposerFromShortcut/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /func recallFromArrowUp/);
  assert.doesNotMatch(composer, /computerPane\.ts/);

  assert.match(sheet, /FocusComposer\.keysLabel/);
  assert.match(sheet, /FocusComposer\.action/);
  assert.match(sheet, /Gestures & shortcuts/);
  assert.match(sheet, /Recall last message/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /focusComposerKey\.test\.ts/);
  assert.match(ci, /test_ios_focus_composer\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.99 /);
  assert.match(roadmap, /focus the composer\)/);
  assert.match(spec, /## 99\. v0\.99/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
