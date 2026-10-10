// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CHAT_SHORTCUTS,
  SHORTCUTS_TITLE,
  escapeClosesShortcuts,
  focusIsTextField,
  isShortcutsChord,
  isShortcutsQuestion,
} from "./chatShortcuts.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.73 keyboard shortcuts (Cmd/Ctrl-/ or ? outside a text field opens a small overlay of the chat shortcuts that already exist; Esc or a click outside closes it; iOS Gestures & shortcuts sheet on the chat screen lists long-press actions and hardware-keyboard shortcuts; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("Cmd/Ctrl-/ opens shortcuts; Shift, Alt, and a bare slash do not", () => {
  assert.equal(isShortcutsChord({ key: "/", metaKey: true }), true);
  assert.equal(isShortcutsChord({ key: "/", ctrlKey: true }), true);
  assert.equal(isShortcutsChord({ key: "?", metaKey: true }), true);
  assert.equal(isShortcutsChord({ key: "/", metaKey: true, shiftKey: true }), false);
  assert.equal(isShortcutsChord({ key: "/", ctrlKey: true, altKey: true }), false);
  assert.equal(isShortcutsChord({ key: "/", metaKey: true, ctrlKey: true }), false);
  assert.equal(isShortcutsChord({ key: "/", repeat: true, metaKey: true }), false);
  assert.equal(isShortcutsChord({ key: "k", metaKey: true }), false);
  assert.equal(isShortcutsChord({ key: "/" }), false);
});

test("? opens shortcuts only when focus is outside a text field", () => {
  const plain = { key: "?" };
  assert.equal(isShortcutsQuestion(plain, { tagName: "DIV" }), true);
  assert.equal(isShortcutsQuestion(plain, null), true);
  assert.equal(isShortcutsQuestion({ key: "/", shiftKey: true }, null), true);
  assert.equal(isShortcutsQuestion(plain, { tagName: "TEXTAREA" }), false);
  assert.equal(isShortcutsQuestion(plain, { tagName: "INPUT", type: "text" }), false);
  assert.equal(isShortcutsQuestion(plain, { tagName: "INPUT", type: "search" }), false);
  assert.equal(
    isShortcutsQuestion(plain, { tagName: "DIV", isContentEditable: true }),
    false,
  );
  assert.equal(isShortcutsQuestion(plain, { tagName: "INPUT", type: "button" }), true);
  assert.equal(isShortcutsQuestion({ key: "?", metaKey: true }, null), false);
  assert.equal(isShortcutsQuestion({ key: "?", ctrlKey: true }, null), false);
  assert.equal(isShortcutsQuestion({ key: "?", altKey: true }, null), false);
  assert.equal(isShortcutsQuestion({ key: "?", repeat: true }, null), false);
  assert.equal(isShortcutsQuestion({ key: "/" }, null), false);
  assert.equal(focusIsTextField({ tagName: "SELECT" }), true);
  assert.equal(focusIsTextField({ tagName: "BUTTON" }), false);
});

test("Esc closes the overlay and does not claim Stop, find, or the switcher", () => {
  assert.equal(escapeClosesShortcuts({ open: true }), true);
  assert.equal(escapeClosesShortcuts({ open: true, composing: true }), false);
  assert.equal(escapeClosesShortcuts({ open: false }), false);

  const esc = sliceFn(app, "const onShortcutsEsc", "window.addEventListener");
  assert.match(esc, /event\.key !== "Escape"/);
  assert.match(esc, /escapeClosesShortcuts/);
  assert.match(esc, /closeShortcuts\(\)/);
  assert.match(esc, /preventDefault/);
  assert.match(esc, /stopImmediatePropagation/);
  assert.doesNotMatch(esc, /onStopGenerating/);
  assert.doesNotMatch(esc, /closeFind\(\)/);
  assert.doesNotMatch(esc, /closeSwitcher\(\)/);
  assert.doesNotMatch(esc, /clearRecalledDraft/);
  assert.match(
    app.slice(app.indexOf("const onShortcutsEsc"), app.indexOf("async function onSend()")),
    /addEventListener\("keydown", onShortcutsEsc, true\)/,
  );

  const mainStart = app.indexOf("escapeClosesSwitcher(");
  const mainEnd = app.indexOf("async function onSend()", mainStart);
  const main = app.slice(mainStart, mainEnd);
  const switchAt = main.indexOf("escapeClosesSwitcher(");
  const findAt = main.indexOf("escapeClosesFind(");
  const stopAt = main.indexOf("escapeStopsGenerating(");
  const recallAt = main.indexOf("escapeClearsRecall(");
  const jumpAt = main.indexOf("escapeJumpsToLatest(");
  assert.ok(switchAt === 0 && findAt > switchAt && stopAt > findAt);
  assert.ok(recallAt > stopAt && jumpAt > recallAt);
  assert.ok(main.indexOf("onShortcutsEsc") > jumpAt);
});

test("the overlay lists only shortcuts that already have handlers", () => {
  assert.deepEqual(
    CHAT_SHORTCUTS.map((row) => row.id),
    [
      "send",
      "newline",
      "escape",
      "recall",
      "find",
      "switch",
      "info",
      "paste",
      "find-step",
      "switch-move",
      "mention",
    ],
  );
  const action = Object.fromEntries(CHAT_SHORTCUTS.map((row) => [row.id, row.action]));
  assert.equal(action.send, "Send");
  assert.equal(action.newline, "New line");
  assert.equal(action.escape, "Stop, close, or jump");
  assert.equal(action.recall, "Recall last message");
  assert.equal(action.find, "Find in chat");
  assert.equal(action.switch, "Switch chat");
  assert.equal(action.info, "Open info");
  assert.equal(action.paste, "Paste an image or file");
  assert.equal(action["find-step"], "Next or previous match");
  assert.equal(action["switch-move"], "Move and open in the switcher");
  assert.equal(action.mention, "Move and insert a mention or skill");
  assert.equal(SHORTCUTS_TITLE, "Keyboard shortcuts");

  assert.match(app, /composerEnterSends/);
  assert.match(readFileSync(join(here, "composerKeys.ts"), "utf8"), /shiftKey/);
  assert.match(app, /arrowUpRecalls/);
  assert.match(app, /isFindChord/);
  assert.match(app, /isSwitchChord/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "i"/);
  assert.match(app, /isComposerPasteChord/);
  assert.match(app, /stepFindIndex/);
  assert.match(app, /event\.shiftKey \? -1 : 1/);
  assert.match(app, /stepSwitchIndex/);
  assert.match(app, /event\.key === "Tab"/);
  assert.match(app, /pickMention/);
  assert.match(app, /pickSkill/);
  assert.doesNotMatch(CHAT_SHORTCUTS.map((row) => row.keys).join(" "), /Cmd N|Ctrl N|Cmd B/);

  const chord = sliceFn(app, "const onShortcutsChord", "window.addEventListener");
  assert.match(chord, /isShortcutsChord/);
  assert.match(chord, /isShortcutsQuestion/);
  assert.match(chord, /preventDefault/);
  assert.match(chord, /setShortcutsOpen\(true\)/);
  assert.match(chord, /shortcutsBlocked/);
  assert.match(app, /className="shortcuts-backdrop"/);
  assert.match(app, /className="shortcuts-overlay"/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /CHAT_SHORTCUTS\.map/);
  assert.match(app, /SHORTCUTS_TITLE/);
  assert.match(app, /onMouseDown=\{\(\) => closeShortcuts\(\)\}/);
  assert.match(css, /\.shortcuts-overlay/);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("OpenAPI stays 0.18.0; iOS sheet lists real gestures; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /chatShortcuts\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.match(swift, /Gestures & shortcuts/);
  assert.match(swift, /Long-press a message/);
  assert.match(swift, /Copy, Speak, Regenerate, or the time/);
  assert.match(swift, /RecallDraft\.editAsNewMessage/);
  assert.match(swift, /Copy the command/);
  assert.match(swift, /Find in chat/);
  assert.match(swift, /Stop, close, or jump/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /Cmd\/Ctrl K/);
  assert.match(chat, /ChatShortcuts\.title/);
  assert.match(chat, /ChatShortcutsSheet\(\)/);
  assert.match(chat, /questionmark\.circle/);
  assert.match(chat, /keyboardShortcut\("f"/);
});
