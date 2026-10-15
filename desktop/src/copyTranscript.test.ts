// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  COPY_TRANSCRIPT_ACTION,
  COPY_TRANSCRIPT_KEYS,
  copyTranscriptBlocked,
  copyTranscriptShouldRun,
  isCopyTranscriptChord,
  overlayTextFieldOwnsCopyTranscript,
  transcriptPlainText,
} from "./copyTranscript.ts";
import { MESSAGE_COPY_FEEDBACK_MS } from "./messageActions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "copyTranscript.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "CopyTranscript.swift"),
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
  "v1.13 copy the open chat transcript from the keyboard (Cmd/Ctrl-Shift-E copies the open chat's loaded transcript to the clipboard as plain text; user and assistant kind=message bodies in order, separated by a blank line; tool, widget, approve, connect, and handoff rows are skipped; a streaming kind=message is included when it already has text; whitespace-only bodies are skipped; muted Copied sits beside the chat name for 1.2s; no toast; the chord still works from the composer and does not insert text; a key repeat does not copy again and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing is copied when no chat is open or the loaded transcript has nothing useful to copy; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift E; iOS hardware command-shift-E copies that transcript and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-E copies; other chords do not", () => {
  assert.equal(isCopyTranscriptChord({ key: "e", metaKey: true, shiftKey: true }), true);
  assert.equal(isCopyTranscriptChord({ key: "E", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isCopyTranscriptChord({ key: "E", metaKey: true, shiftKey: true }), true);
  assert.equal(isCopyTranscriptChord({ key: "e", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isCopyTranscriptChord({ key: "e", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isCopyTranscriptChord({ key: "e", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "e", ctrlKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "e", shiftKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "e", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isCopyTranscriptChord({ key: "e", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isCopyTranscriptChord({ key: "e" }), false);
  assert.equal(isCopyTranscriptChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "d", metaKey: true, shiftKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "k", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "l", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "n", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "/", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "1", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "PageUp" }), false);
  assert.equal(isCopyTranscriptChord({ key: "Home", metaKey: true }), false);
  assert.equal(isCopyTranscriptChord({ key: "Escape" }), false);
  assert.equal(isCopyTranscriptChord({ key: "ArrowUp" }), false);
  assert.equal(copyTranscriptShouldRun({ repeat: false }), true);
  assert.equal(copyTranscriptShouldRun({}), true);
  assert.equal(copyTranscriptShouldRun({ repeat: true }), false);
  assert.equal(COPY_TRANSCRIPT_KEYS, "Cmd/Ctrl Shift E");
  assert.equal(COPY_TRANSCRIPT_ACTION, "Copy the transcript");
  assert.equal(MESSAGE_COPY_FEEDBACK_MS, 1200);
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsCopyTranscript(true, true), false);
  assert.equal(overlayTextFieldOwnsCopyTranscript(true, false), true);
  assert.equal(overlayTextFieldOwnsCopyTranscript(false, false), false);
  assert.equal(overlayTextFieldOwnsCopyTranscript(false, true), false);
  assert.equal(copyTranscriptBlocked(openGate), false);
  assert.equal(copyTranscriptBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(copyTranscriptBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("kind=message bodies copy in order; chrome and empty bodies do not", () => {
  const messages = [
    { kind: "message", content: "  hello  " },
    { kind: "tool", content: "Ran ls" },
    { kind: "message", content: "world\nstill here" },
    { kind: "widget", content: "Pick one" },
    { kind: "approve", content: "rm -rf" },
    { kind: "connect", content: "Connect Slack" },
    { kind: "handoff", content: "Can you check?" },
    { kind: "message", content: "   " },
    { kind: "message", content: "" },
    { content: "default kind" },
    { kind: "message", content: "tail" },
  ];
  assert.equal(
    transcriptPlainText(messages),
    "hello\n\nworld\nstill here\n\ndefault kind\n\ntail",
  );
  assert.equal(transcriptPlainText([]), null);
  assert.equal(
    transcriptPlainText([
      { kind: "tool", content: "Ran ls" },
      { kind: "widget", content: "Ask" },
      { kind: "message", content: " \n " },
    ]),
    null,
  );
  assert.equal(transcriptPlainText([{ kind: "message", content: null }]), null);
  assert.match(src, /kind !== "message"/);
  assert.match(src, /join\("\\n\\n"\)/);
  assert.doesNotMatch(src, /Ran /);
  assert.doesNotMatch(transcriptPlainText(messages) ?? "", /Ran ls/);
  assert.doesNotMatch(transcriptPlainText(messages) ?? "", /Pick one/);
});

test("desktop wires Cmd/Ctrl-Shift-E to the loaded transcript and Copied", () => {
  const block = sliceFn(
    app,
    "const onCopyTranscript",
    'addEventListener("keydown", onCopyTranscript, true)',
  );
  assert.match(block, /isCopyTranscriptChord\(/);
  assert.match(block, /copyTranscriptBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsCopyTranscript\(/);
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
  assert.match(block, /copyTranscriptShouldRun/);
  assert.match(block, /copyTranscriptRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("copyTranscriptShouldRun");
  const callAt = block.indexOf("copyTranscriptRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const call = sliceFn(app, "copyTranscriptRef.current = () => {", "useEffect(() => {");
  assert.match(call, /transcriptPlainText\(visibleMessages\)/);
  assert.match(call, /if \(!text\) return/);
  assert.match(call, /copyText\(text\)/);
  assert.match(call, /MESSAGE_COPY_FEEDBACK_MS/);
  assert.match(call, /setTranscriptCopiedId/);
  const emptyAt = call.indexOf("if (!text) return");
  const copyAt = call.indexOf("copyText(text)");
  assert.ok(emptyAt >= 0 && copyAt > emptyAt);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /toast/);

  const head = sliceFn(app, '<header className="chat-head">', "</header>");
  assert.match(head, /copiedFeedbackLabel\(transcriptCopiedId === active\.id\)/);
  assert.match(head, /className="message-copied"/);
  assert.match(head, /aria-live="polite"/);
  assert.doesNotMatch(head, /toast/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "copy-transcript");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, COPY_TRANSCRIPT_KEYS);
  assert.equal(shortcut.action, COPY_TRANSCRIPT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift E/);
  assert.match(shortcuts, /Copy the transcript/);
  assert.match(shortcuts, /v1\.13/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-E copies that transcript; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧E"/);
  assert.match(swift, /static let action = "Copy the transcript"/);
  assert.match(swift, /static let copiedLabel = "Copied"/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_200_000_000/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func plainText/);
  assert.match(swift, /isKindMessage/);
  assert.match(swift, /joined\(separator: "\\n\\n"\)/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func copyTranscriptKey/);
  assert.match(chat, /CopyTranscript\.isChord/);
  assert.match(chat, /copyOpenTranscript\(\)/);
  assert.match(chat, /CopyTranscript\.plainText/);
  assert.match(chat, /visibleMessages\(for: agent\)/);
  assert.match(chat, /UIPasteboard\.general\.string = text/);
  assert.match(chat, /CopyTranscript\.copiedLabel/);
  assert.match(chat, /CopyTranscript\.feedbackNanoseconds/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func copyTranscriptFromComposer/);
  const keyFn = sliceFn(chat, "func copyTranscriptKey", "func copyTranscriptFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /copyOpenTranscript\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const copyAt = keyFn.indexOf("copyOpenTranscript()");
  assert.ok(repeatAt >= 0 && copyAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func copyTranscriptFromComposer", "func copyTranscriptBlocked");
  assert.match(fromComposer, /copyOpenTranscript\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  const paint = sliceFn(chat, "func copyOpenTranscript()", "func chatNavKey");
  assert.match(paint, /plainText\(messages: visible\)/);
  assert.match(paint, /UIPasteboard\.general\.string = text/);
  const guardAt = paint.indexOf("guard let text");
  const boardAt = paint.indexOf("UIPasteboard.general.string = text");
  assert.ok(guardAt >= 0 && boardAt > guardAt);
  assert.doesNotMatch(paint, /model\.send\(/);

  const commands = sliceFn(composer, "func copyTranscriptCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "e"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func copyTranscriptFromShortcut/);
  const selector = sliceFn(composer, "func copyTranscriptFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /copyTranscriptConsumed/);
  assert.match(selector, /onCopyTranscript\?\(\)/);
  const consumedAt = selector.indexOf("if copyTranscriptConsumed");
  const setAt = selector.indexOf("copyTranscriptConsumed = true");
  const fireAt = selector.indexOf("onCopyTranscript?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardE/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /CopyTranscript\.keysLabel/);
  assert.match(sheet, /CopyTranscript\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /copyTranscript\.test\.ts/);
  assert.match(ci, /test_ios_copy_transcript\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.13 /);
  assert.match(roadmap, /copy the open chat transcript from the keyboard/);
  assert.match(spec, /## 113\. v1\.13/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
