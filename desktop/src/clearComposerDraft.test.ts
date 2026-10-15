// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  CLEAR_COMPOSER_DRAFT_ACTION,
  CLEAR_COMPOSER_DRAFT_KEYS,
  clearComposerDraftBlocked,
  composerDraftAlreadyEmpty,
  isClearComposerDraftChord,
  overlayTextFieldOwnsClearComposerDraft,
} from "./clearComposerDraft.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "clearComposerDraft.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ClearComposerDraft.swift"),
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

const PHRASE =
  "v1.07 clear the composer draft from the keyboard (Cmd/Ctrl-Shift-Backspace clears the open chat's composer draft, text and pending chips, without sending; an already empty composer is a no-op; the chord still works from the composer; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing is cleared when no chat is open; plain Backspace still removes the last chip when the field is empty; Esc, Up-arrow recall, Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, and Cmd/Ctrl-Home/End stay; the shortcuts list includes Cmd/Ctrl Shift Backspace; iOS hardware command-shift-delete clears that draft the same way and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-Backspace clears; other chords do not", () => {
  assert.equal(
    isClearComposerDraftChord({ key: "Backspace", metaKey: true, shiftKey: true }),
    true,
  );
  assert.equal(
    isClearComposerDraftChord({ key: "Backspace", ctrlKey: true, shiftKey: true }),
    true,
  );
  assert.equal(
    isClearComposerDraftChord({
      key: "Backspace",
      metaKey: true,
      shiftKey: true,
      repeat: true,
    }),
    true,
  );
  assert.equal(isClearComposerDraftChord({ key: "Backspace", metaKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "Backspace", ctrlKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "Backspace", shiftKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "Backspace" }), false);
  assert.equal(
    isClearComposerDraftChord({
      key: "Backspace",
      metaKey: true,
      shiftKey: true,
      altKey: true,
    }),
    false,
  );
  assert.equal(
    isClearComposerDraftChord({
      key: "Backspace",
      metaKey: true,
      ctrlKey: true,
      shiftKey: true,
    }),
    false,
  );
  assert.equal(isClearComposerDraftChord({ key: "Delete", metaKey: true, shiftKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "n", metaKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "k", metaKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "l", metaKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "/", metaKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "1", metaKey: true }), false);
  assert.equal(isClearComposerDraftChord({ key: "Escape" }), false);
  assert.equal(isClearComposerDraftChord({ key: "ArrowUp" }), false);
  assert.equal(CLEAR_COMPOSER_DRAFT_KEYS, "Cmd/Ctrl Shift Backspace");
  assert.equal(CLEAR_COMPOSER_DRAFT_ACTION, "Clear the draft");
});

test("an empty draft is a no-op; text or chips are not", () => {
  assert.equal(composerDraftAlreadyEmpty("", 0), true);
  assert.equal(composerDraftAlreadyEmpty("hello", 0), false);
  assert.equal(composerDraftAlreadyEmpty(" ", 0), false);
  assert.equal(composerDraftAlreadyEmpty("", 1), false);
  assert.equal(composerDraftAlreadyEmpty("hello", 2), false);
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsClearComposerDraft(true, true), false);
  assert.equal(overlayTextFieldOwnsClearComposerDraft(true, false), true);
  assert.equal(overlayTextFieldOwnsClearComposerDraft(false, false), false);
  assert.equal(overlayTextFieldOwnsClearComposerDraft(false, true), false);
  assert.equal(clearComposerDraftBlocked(openGate), false);
  assert.equal(clearComposerDraftBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(clearComposerDraftBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("desktop wires Cmd/Ctrl-Shift-Backspace to clear text and chips", () => {
  const block = sliceFn(
    app,
    "const onClearComposerDraft",
    'addEventListener("keydown", onClearComposerDraft, true)',
  );
  assert.match(block, /isClearComposerDraftChord\(/);
  assert.match(block, /clearComposerDraftBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsClearComposerDraft\(/);
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
  assert.match(block, /clearComposerDraftRef\.current\(\)/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /onStopGenerating/);

  const call = sliceFn(
    app,
    "clearComposerDraftRef.current = () => {",
    "const onClearComposerDraft",
  );
  assert.match(call, /composerDraftAlreadyEmpty\(/);
  assert.match(call, /draftRef\.current = ""/);
  assert.match(call, /pendingAttachmentsRef\.current = \[\]/);
  assert.match(call, /chatDrafts\.current\.clear\(/);
  assert.match(call, /setDraft\(""\)/);
  assert.match(call, /setRecallArmed\(false\)/);
  assert.match(call, /setPendingAttachments/);
  assert.match(call, /URL\.revokeObjectURL/);
  assert.match(call, /setAttachError\(null\)/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /fetch\(/);

  const row = CHAT_SHORTCUTS.find((item) => item.id === "clear-draft");
  assert.ok(row);
  assert.equal(row.keys, CLEAR_COMPOSER_DRAFT_KEYS);
  assert.equal(row.action, CLEAR_COMPOSER_DRAFT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift Backspace/);
  assert.match(shortcuts, /Clear the draft/);
  assert.match(shortcuts, /v1\.07/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-delete clears the draft; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧⌫"/);
  assert.match(swift, /static let action = "Clear the draft"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func overlayTextFieldOwnsChord/);
  assert.match(swift, /static func alreadyEmpty/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func clearComposerDraftKey/);
  assert.match(chat, /ClearComposerDraft\.isChord/);
  assert.match(chat, /model\.clearComposerDraftFromChord\(\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func clearComposerDraftFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func clearComposerDraftKey", "func clearComposerDraftFromComposer");
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(
    chat,
    "func clearComposerDraftFromComposer",
    "func chatNavKey",
  );
  assert.match(fromComposer, /model\.clearComposerDraftFromChord\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(
    composer,
    "func clearComposerDraftCommands",
    "func chatNavCommands",
  );
  assert.match(commands, /UIKeyCommand\.inputDelete/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(composer, /func clearComposerDraftFromShortcut/);
  assert.match(composer, /markedTextRange != nil/);
  assert.match(composer, /onClearComposerDraft\?\(\)/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const clearFn = sliceFn(
    model,
    "func clearComposerDraftFromChord()",
    "func removeLastPendingChipFromBackspace",
  );
  assert.match(clearFn, /ClearComposerDraft\.alreadyEmpty/);
  assert.match(clearFn, /pendingAttachments = \[\]/);
  assert.match(clearFn, /draft = ""/);
  assert.doesNotMatch(clearFn, /send\(\)/);
  assert.doesNotMatch(clearFn, /\/v1\//);

  assert.match(sheet, /ClearComposerDraft\.keysLabel/);
  assert.match(sheet, /ClearComposerDraft\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /clearComposerDraft\.test\.ts/);
  assert.match(ci, /test_ios_clear_composer_draft\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.07 /);
  assert.match(roadmap, /clear the composer draft from the keyboard/);
  assert.match(spec, /## 107\. v1\.07/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
