// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  DELETE_OPEN_CHAT_ACTION,
  DELETE_OPEN_CHAT_KEYS,
  deleteConfirmAction,
  deleteOpenChatBlocked,
  deleteOpenChatShouldRun,
  isDeleteOpenChatChord,
  nextOpenChatAfterDelete,
  overlayTextFieldOwnsDeleteOpenChat,
} from "./deleteOpenChat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "deleteOpenChat.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "DeleteOpenChat.swift"),
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
  "v1.12 delete the open chat from the keyboard (Cmd/Ctrl-Shift-D opens the same confirm as the sidebar Delete… menu and does not delete until that confirm; Enter or Delete confirms, Esc or Cancel aborts, and focus returns to the composer on cancel; a key repeat never confirms; only on confirm does the existing delete path run, then the next chat in the Alt+Up/Down visible order opens, or the empty state; the chord still works from the composer and does not insert text; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing is deleted when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift D; iOS hardware command-shift-D opens that same confirm and is listed in Gestures & shortcuts; no new HTTP)";

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

test("Cmd/Ctrl-Shift-D deletes; other chords do not", () => {
  assert.equal(isDeleteOpenChatChord({ key: "d", metaKey: true, shiftKey: true }), true);
  assert.equal(isDeleteOpenChatChord({ key: "D", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isDeleteOpenChatChord({ key: "D", metaKey: true, shiftKey: true }), true);
  assert.equal(isDeleteOpenChatChord({ key: "d", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isDeleteOpenChatChord({ key: "d", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isDeleteOpenChatChord({ key: "d", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "d", ctrlKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "d", shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "d", metaKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(
    isDeleteOpenChatChord({ key: "d", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isDeleteOpenChatChord({ key: "d" }), false);
  assert.equal(isDeleteOpenChatChord({ key: "k", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "l", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "n", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "p", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "m", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "u", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "r", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "Backspace", metaKey: true, shiftKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "/", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "1", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "9", ctrlKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "PageUp" }), false);
  assert.equal(isDeleteOpenChatChord({ key: "Home", metaKey: true }), false);
  assert.equal(isDeleteOpenChatChord({ key: "Escape" }), false);
  assert.equal(isDeleteOpenChatChord({ key: "ArrowUp" }), false);
  assert.equal(deleteOpenChatShouldRun({ repeat: false }), true);
  assert.equal(deleteOpenChatShouldRun({}), true);
  assert.equal(deleteOpenChatShouldRun({ repeat: true }), false);
  assert.equal(DELETE_OPEN_CHAT_KEYS, "Cmd/Ctrl Shift D");
  assert.equal(DELETE_OPEN_CHAT_ACTION, "Ask to delete this chat");
  assert.equal(deleteConfirmAction({ key: "Enter" }), "confirm");
  assert.equal(deleteConfirmAction({ key: "Delete" }), "confirm");
  assert.equal(deleteConfirmAction({ key: "Backspace" }), "confirm");
  assert.equal(deleteConfirmAction({ key: "Enter", repeat: true }), "swallow");
  assert.equal(deleteConfirmAction({ key: "Delete", repeat: true }), "swallow");
  assert.equal(deleteConfirmAction({ key: "Backspace", repeat: true }), "swallow");
  assert.equal(deleteConfirmAction({ key: "Escape" }), "cancel");
  assert.equal(deleteConfirmAction({ key: "Escape", repeat: true }), "cancel");
  assert.equal(deleteConfirmAction({ key: "Enter", shiftKey: true }), null);
  assert.equal(deleteConfirmAction({ key: "Enter", metaKey: true }), null);
  assert.equal(deleteConfirmAction({ key: "d", metaKey: true, shiftKey: true }), null);
  assert.equal(deleteConfirmAction({ key: "d", metaKey: true, shiftKey: true, repeat: true }), null);
  assert.equal(deleteConfirmAction({ key: "Enter", isComposing: true }), null);
  assert.equal(deleteConfirmAction({ key: "a" }), null);
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsDeleteOpenChat(true, true), false);
  assert.equal(overlayTextFieldOwnsDeleteOpenChat(true, false), true);
  assert.equal(overlayTextFieldOwnsDeleteOpenChat(false, false), false);
  assert.equal(overlayTextFieldOwnsDeleteOpenChat(false, true), false);
  assert.equal(deleteOpenChatBlocked(openGate), false);
  assert.equal(deleteOpenChatBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(deleteOpenChatBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("after delete, the next visible chat opens, or the empty state", () => {
  const visible = ["pin", "a", "b", "c"];
  assert.equal(nextOpenChatAfterDelete(visible, "pin"), "a");
  assert.equal(nextOpenChatAfterDelete(visible, "a"), "b");
  assert.equal(nextOpenChatAfterDelete(visible, "b"), "c");
  assert.equal(nextOpenChatAfterDelete(visible, "c"), null);
  assert.equal(nextOpenChatAfterDelete(visible, "missing"), null);
  assert.equal(nextOpenChatAfterDelete(visible, null), null);
  assert.equal(nextOpenChatAfterDelete(visible, ""), null);
  assert.equal(nextOpenChatAfterDelete([], "a"), null);
  assert.equal(deleteOpenChatShouldRun({ repeat: true }), false);
});

test("desktop wires Cmd/Ctrl-Shift-D to the sidebar Delete confirm", () => {
  const block = sliceFn(
    app,
    "const onDeleteOpenChat",
    'addEventListener("keydown", onDeleteOpenChat, true)',
  );
  assert.match(block, /isDeleteOpenChatChord\(/);
  assert.match(block, /deleteOpenChatBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsDeleteOpenChat\(/);
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
  assert.match(block, /deleteOpenChatShouldRun/);
  assert.match(block, /deleteOpenChatRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("deleteOpenChatShouldRun");
  const callAt = block.indexOf("deleteOpenChatRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /deleteRosterChat\(/);

  const call = sliceFn(app, "deleteOpenChatRef.current = () => {", "useEffect(() => {");
  assert.match(call, /deleteConfirmFromChord\.current = true/);
  assert.match(call, /setPendingDelete\(agent\)/);
  assert.doesNotMatch(call, /deleteRosterChat\(/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.match(app, /chordDeleteNextRef\.current = \(id: string\)/);
  assert.match(app, /\[\.\.\.pinnedAgents, \.\.\.restAgents\]/);
  assert.match(app, /nextOpenChatAfterDelete\(visibleIds, id\)/);

  const cancel = sliceFn(app, "function cancelDelete()", "async function confirmDelete()");
  assert.match(cancel, /deleteConfirmFromChord\.current = false/);
  assert.match(cancel, /setPendingDelete\(null\)/);
  assert.match(cancel, /focusComposer\(\)/);

  const confirm = sliceFn(app, "async function confirmDelete()", "async function deleteRosterChat(");
  assert.match(confirm, /deleteConfirmFromChord\.current/);
  assert.match(confirm, /chordDeleteNextRef\.current\(doomed\.id\)/);
  assert.match(confirm, /deleteRosterChat\(doomed, nextOpen\)/);
  assert.match(confirm, /deleteRosterChat\(doomed\)/);
  assert.doesNotMatch(confirm, /nextRosterSelection/);
  const keys = sliceFn(
    app,
    "const onDeleteConfirmKey = ",
    'window.addEventListener("keydown", onDeleteConfirmKey, true)',
  );
  assert.match(keys, /deleteConfirmAction\(/);
  assert.match(keys, /blockKeyUntilUp/);
  assert.match(keys, /action === "confirm"/);
  assert.match(keys, /action === "cancel"/);
  assert.match(keys, /action === "swallow"/);
  const swallowAt = keys.indexOf('action === "swallow"');
  const confirmAt = keys.indexOf('action === "confirm"');
  assert.ok(swallowAt >= 0 && confirmAt > swallowAt);
  assert.match(app, /const onDeleteConfirmKeyUp/);
  assert.match(app, /deleteConfirmFromChord\.current = false/);
  assert.match(app, /onClick=\{\(\) => cancelDelete\(\)\}/);
  const remove = sliceFn(app, "async function deleteRosterChat(", "function commitTranscript(");
  assert.match(remove, /deleteAgent\(session, doomed\.id\)/);
  assert.match(remove, /explicitNext !== undefined/);
  assert.match(remove, /nextRosterSelection\(roster, doomed\.id, activeId\)/);
  assert.match(remove, /deleteRosterBusy\.current/);
  assert.match(remove, /chatUnread\.current\.retain\(/);
  assert.match(remove, /chatUnread\.current\.clear\(next\)/);
  assert.match(remove, /retainPins\(rosterIds\)/);
  assert.match(remove, /retainMutes\(rosterIds\)/);
  assert.match(remove, /retainArchives\(rosterIds\)/);
  assert.match(remove, /retainNames\(rosterIds\)/);
  const explicitAt = remove.indexOf("explicitNext !== undefined");
  const rosterAt = remove.indexOf("nextRosterSelection(roster, doomed.id, activeId)");
  assert.ok(explicitAt >= 0 && rosterAt > explicitAt);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "delete-chat");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, DELETE_OPEN_CHAT_KEYS);
  assert.equal(shortcut.action, DELETE_OPEN_CHAT_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift D/);
  assert.match(shortcuts, /Ask to delete this chat/);
  assert.match(shortcuts, /v1\.12/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-D uses the existing delete path; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧D"/);
  assert.match(swift, /static let action = "Ask to delete this chat"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /static func nextId/);
  assert.match(swift, /ChatArchive\.selectionAfterArchive/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func deleteOpenChatKey/);
  assert.match(chat, /DeleteOpenChat\.isChord/);
  assert.match(chat, /requestDeleteOpenChat\(\)/);
  assert.match(chat, /model\.deleteOpenChat\(id\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /func deleteOpenChatFromComposer/);
  assert.match(chat, /hasRealAgent/);
  const keyFn = sliceFn(chat, "func deleteOpenChatKey", "func deleteOpenChatFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /requestDeleteOpenChat\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const askAt = keyFn.indexOf("requestDeleteOpenChat()");
  assert.ok(repeatAt >= 0 && askAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.deleteOpenChat/);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func deleteOpenChatFromComposer", "func chatNavKey");
  assert.match(fromComposer, /requestDeleteOpenChat\(\)/);
  assert.doesNotMatch(fromComposer, /model\.deleteOpenChat/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);
  const confirmKey = sliceFn(chat, "func deleteConfirmKey", "func deleteOpenChatKey");
  assert.match(confirmKey, /DeleteOpenChat\.confirmAction/);
  assert.match(confirmKey, /confirmDeleteOpenChat\(key: name\)/);
  assert.match(confirmKey, /cancelDeleteOpenChat\(\)/);
  assert.match(confirmKey, /confirmKeyBlocked/);
  const ask = sliceFn(chat, "func requestDeleteOpenChat()", "func confirmDeleteOpenChat");
  assert.match(ask, /pendingDeleteChatID = agent\.id/);
  assert.doesNotMatch(ask, /model\.deleteOpenChat/);
  const accept = sliceFn(chat, "func confirmDeleteOpenChat", "func cancelDeleteOpenChat");
  assert.match(accept, /model\.deleteOpenChat\(id\)/);
  assert.match(accept, /blockConfirmKey/);
  const abort = sliceFn(chat, "func cancelDeleteOpenChat()", "func deleteConfirmKeyName");
  assert.match(abort, /composerFocused = true/);
  assert.doesNotMatch(abort, /model\.deleteOpenChat/);
  assert.match(chat, /DeleteOpenChat\.confirmTitle/);
  assert.match(chat, /\.keyboardShortcut\(\.defaultAction\)/);
  assert.match(chat, /\.keyboardShortcut\(\.cancelAction\)/);

  const commands = sliceFn(composer, "func deleteOpenChatCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "d"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func deleteOpenChatFromShortcut/);
  const selector = sliceFn(composer, "func deleteOpenChatFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /deleteOpenChatConsumed/);
  assert.match(selector, /onDeleteOpenChat\?\(\)/);
  const consumedAt = selector.indexOf("if deleteOpenChatConsumed");
  const setAt = selector.indexOf("deleteOpenChatConsumed = true");
  const fireAt = selector.indexOf("onDeleteOpenChat?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  const startFn = sliceFn(model, "func deleteOpenChat(_ id: String)", "func saveProfile");
  assert.match(startFn, /deleteOpenChatBusy/);
  assert.match(startFn, /DeleteOpenChat\.nextId/);
  assert.match(startFn, /visibleChatOrder\(\)/);
  assert.match(startFn, /preferVisibleNext: true/);
  const busyAt = startFn.indexOf("!deleteOpenChatBusy");
  const deleteAt = startFn.indexOf("await delete(");
  assert.ok(busyAt >= 0 && deleteAt > busyAt);
  const removal = sliceFn(model, "func delete(", "func deleteOpenChat(_ id: String)");
  assert.match(removal, /client\.deleteAgent\(id: agent\.id\)/);
  assert.match(removal, /nextRosterSelection/);
  assert.match(removal, /preferVisibleNext/);
  assert.match(removal, /visibleNext/);
  assert.doesNotMatch(removal, /computerPane\.ts/);

  assert.match(sheet, /DeleteOpenChat\.keysLabel/);
  assert.match(sheet, /DeleteOpenChat\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /deleteOpenChat\.test\.ts/);
  assert.match(ci, /test_ios_delete_open_chat\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.12 /);
  assert.match(roadmap, /delete the open chat from the keyboard/);
  assert.match(spec, /## 112\. v1\.12/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
