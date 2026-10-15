// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import {
  compactToolStacks,
  toggleAllToolTraceGroups,
} from "./compactToolTraces.ts";
import {
  TOOL_TRACE_GROUPS_ACTION,
  TOOL_TRACE_GROUPS_KEYS,
  isToolTraceGroupsChord,
  overlayTextFieldOwnsToolTraceGroups,
  toolTraceGroupsBlocked,
  toolTraceGroupsShouldToggle,
} from "./toolTraceGroups.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "toolTraceGroups.ts"), "utf8");
const compact = readFileSync(join(here, "compactToolTraces.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ToolTraceGroups.swift"),
  "utf8",
);
const compactSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "CompactToolTraces.swift"),
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
  "v1.14 collapse or expand tool traces from the keyboard (Cmd/Ctrl-Shift-G toggles every consecutive tool-trace group in the open chat's loaded transcript: if any group is expanded, collapse all; if every group is collapsed, expand all; a single tool line is not a group and stays as it is; the existing N tools chevron stays; the chord still works from the composer and does not insert text; a key repeat does not flap and does not insert; IME composition keeps the key; find, the quick switcher, the shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep the key; nothing changes when no chat is open or there are no tool-trace groups; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift G; iOS hardware command-shift-G toggles those groups and is listed in Gestures & shortcuts; no new HTTP)";

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

const groups = [
  { id: "u", kind: "message", content: "hi" },
  { id: "a", kind: "tool", content: "ls" },
  { id: "b", kind: "tool", content: "cat" },
  { id: "m", kind: "message", content: "ok" },
  { id: "c", kind: "tool", content: "one" },
  { id: "w", kind: "widget", content: "ask" },
  { id: "d", kind: "tool", content: "two" },
  { id: "e", kind: "tool", content: "three" },
];

test("Cmd/Ctrl-Shift-G toggles groups; other chords do not", () => {
  assert.equal(isToolTraceGroupsChord({ key: "g", metaKey: true, shiftKey: true }), true);
  assert.equal(isToolTraceGroupsChord({ key: "G", ctrlKey: true, shiftKey: true }), true);
  assert.equal(isToolTraceGroupsChord({ key: "G", metaKey: true, shiftKey: true }), true);
  assert.equal(isToolTraceGroupsChord({ key: "g", ctrlKey: true, shiftKey: true }), true);
  assert.equal(
    isToolTraceGroupsChord({ key: "g", metaKey: true, shiftKey: true, repeat: true }),
    true,
  );
  assert.equal(isToolTraceGroupsChord({ key: "g", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "g", ctrlKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "g", shiftKey: true }), false);
  assert.equal(
    isToolTraceGroupsChord({ key: "g", metaKey: true, shiftKey: true, altKey: true }),
    false,
  );
  assert.equal(
    isToolTraceGroupsChord({ key: "g", metaKey: true, ctrlKey: true, shiftKey: true }),
    false,
  );
  assert.equal(isToolTraceGroupsChord({ key: "g" }), false);
  assert.equal(isToolTraceGroupsChord({ key: ".", metaKey: true, shiftKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: ">", metaKey: true, shiftKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "e", metaKey: true, shiftKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "c", metaKey: true, shiftKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "d", metaKey: true, shiftKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "k", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "f", ctrlKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "l", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "n", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "a", metaKey: true, shiftKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "/", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "1", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "ArrowUp", altKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "PageUp" }), false);
  assert.equal(isToolTraceGroupsChord({ key: "Home", metaKey: true }), false);
  assert.equal(isToolTraceGroupsChord({ key: "Escape" }), false);
  assert.equal(isToolTraceGroupsChord({ key: "ArrowUp" }), false);
  assert.equal(toolTraceGroupsShouldToggle({ repeat: false }), true);
  assert.equal(toolTraceGroupsShouldToggle({}), true);
  assert.equal(toolTraceGroupsShouldToggle({ repeat: true }), false);
  assert.equal(TOOL_TRACE_GROUPS_KEYS, "Cmd/Ctrl Shift G");
  assert.equal(TOOL_TRACE_GROUPS_ACTION, "Collapse or expand tool traces");
});

test("the composer does not own the chord; an empty chat and overlays do", () => {
  assert.equal(overlayTextFieldOwnsToolTraceGroups(true, true), false);
  assert.equal(overlayTextFieldOwnsToolTraceGroups(true, false), true);
  assert.equal(overlayTextFieldOwnsToolTraceGroups(false, false), false);
  assert.equal(overlayTextFieldOwnsToolTraceGroups(false, true), false);
  assert.equal(toolTraceGroupsBlocked(openGate), false);
  assert.equal(toolTraceGroupsBlocked({ ...openGate, chatOpen: false }), true);
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
    assert.equal(toolTraceGroupsBlocked({ ...openGate, [flag]: true }), true, flag);
  }
});

test("any expanded group collapses all; all collapsed expands all; a single tool is not a group", () => {
  const stacks = compactToolStacks({ messages: groups });
  const ids = stacks.map((stack) => stack.id);
  assert.deepEqual(ids, ["a", "c", "d"]);
  assert.equal(toggleAllToolTraceGroups(new Set(), []), null);
  assert.equal(
    toggleAllToolTraceGroups(new Set(), compactToolStacks({
      messages: [{ id: "only", kind: "tool", content: "ls" }],
    })),
    null,
  );
  const expanded = toggleAllToolTraceGroups(new Set(), stacks);
  assert.ok(expanded);
  assert.deepEqual([...expanded].sort(), ["a", "d"]);
  assert.equal(expanded.has("c"), false);
  const mixed = toggleAllToolTraceGroups(new Set(["a"]), stacks);
  assert.ok(mixed);
  assert.equal(mixed.has("a"), false);
  assert.equal(mixed.has("d"), false);
  assert.equal(mixed.has("c"), false);
  const again = toggleAllToolTraceGroups(mixed, stacks);
  assert.ok(again);
  assert.deepEqual([...again].sort(), ["a", "d"]);
  const live = compactToolStacks({
    messages: [{ id: "m", kind: "message", content: "hi" }],
    liveTraces: [
      { id: "l1", summary: "x" },
      { id: "l2", summary: "y" },
    ],
    liveAt: 1,
  });
  const liveNext = toggleAllToolTraceGroups(new Set(), live);
  assert.ok(liveNext);
  assert.equal(liveNext.has("l1"), true);
  assert.match(compact, /toggleAllToolTraceGroups/);
  assert.match(compact, /shouldCollapseToolRun/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("desktop wires Cmd/Ctrl-Shift-G to the existing tool-trace groups", () => {
  const block = sliceFn(
    app,
    "const onToggleToolTraces",
    'addEventListener("keydown", onToggleToolTraces, true)',
  );
  assert.match(block, /isToolTraceGroupsChord\(/);
  assert.match(block, /toolTraceGroupsBlocked\(gate\)/);
  assert.match(block, /isComposerComposing\(event\)/);
  assert.match(block, /overlayTextFieldOwnsToolTraceGroups\(/);
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
  assert.match(block, /toolTraceGroupsShouldToggle/);
  assert.match(block, /toggleToolTracesRef\.current\(\)/);
  const preventAt = block.indexOf("preventDefault");
  const startAt = block.indexOf("toolTraceGroupsShouldToggle");
  const callAt = block.indexOf("toggleToolTracesRef.current()");
  assert.ok(preventAt >= 0 && startAt > preventAt && callAt > startAt);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);

  const call = sliceFn(app, "toggleToolTracesRef.current = () => {", "useEffect(() => {");
  assert.match(call, /toggleAllToolTraceGroups\(prev, toolStacks\)/);
  assert.match(call, /if \(!active\) return/);
  assert.doesNotMatch(call, /onSend\(/);
  assert.doesNotMatch(call, /fetch\(/);

  const shortcut = CHAT_SHORTCUTS.find((item) => item.id === "tool-traces");
  assert.ok(shortcut);
  assert.equal(shortcut.keys, TOOL_TRACE_GROUPS_KEYS);
  assert.equal(shortcut.action, TOOL_TRACE_GROUPS_ACTION);
  assert.match(shortcuts, /Cmd\/Ctrl Shift G/);
  assert.match(shortcuts, /Collapse or expand tool traces/);
  assert.match(shortcuts, /v1\.14/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS command-shift-G toggles those groups; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let keysLabel = "⌘⇧G"/);
  assert.match(swift, /static let action = "Collapse or expand tool traces"/);
  assert.match(swift, /static func isChord/);
  assert.match(swift, /static func shouldIgnoreRepeat/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(compactSwift, /static func toggleAll/);
  assert.match(compactSwift, /shouldCollapse\(count: \$0\.items\.count\)/);

  assert.match(chat, /func toolTraceGroupsKey/);
  assert.match(chat, /ToolTraceGroups\.isChord/);
  assert.match(chat, /toggleAllToolTraceGroups\(\)/);
  assert.match(chat, /CompactToolTraces\.toggleAll/);
  assert.match(chat, /openChatToolStacks\(\)/);
  assert.match(chat, /visibleMessages\(for: agent\)/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /renameChatID != nil/);
  assert.match(chat, /func toggleToolTracesFromComposer/);
  const keyFn = sliceFn(chat, "func toolTraceGroupsKey", "func toggleToolTracesFromComposer");
  assert.match(keyFn, /shouldIgnoreRepeat/);
  assert.match(keyFn, /toggleAllToolTraceGroups\(\)/);
  const repeatAt = keyFn.indexOf("shouldIgnoreRepeat");
  const toggleAt = keyFn.indexOf("toggleAllToolTraceGroups()");
  assert.ok(repeatAt >= 0 && toggleAt > repeatAt);
  assert.doesNotMatch(keyFn, /model\.send\(/);
  const fromComposer = sliceFn(chat, "func toggleToolTracesFromComposer", "func toolTraceGroupsBlocked");
  assert.match(fromComposer, /toggleAllToolTraceGroups\(\)/);
  assert.doesNotMatch(fromComposer, /model\.send\(/);

  const commands = sliceFn(composer, "func toolTraceGroupCommands", "func clearComposerDraftCommands");
  assert.match(commands, /input: "g"/);
  assert.match(commands, /modifierFlags: \[\.command, \.shift\]/);
  assert.match(commands, /modifierFlags: \[\.control, \.shift\]/);
  assert.match(commands, /wantsPriorityOverSystemBehavior = true/);
  assert.match(composer, /func toggleToolTracesFromShortcut/);
  const selector = sliceFn(composer, "func toggleToolTracesFromShortcut", "func chatNavUp");
  assert.match(selector, /markedTextRange != nil/);
  assert.match(selector, /toolTraceGroupsConsumed/);
  assert.match(selector, /onToggleToolTraces\?\(\)/);
  const consumedAt = selector.indexOf("if toolTraceGroupsConsumed");
  const setAt = selector.indexOf("toolTraceGroupsConsumed = true");
  const fireAt = selector.indexOf("onToggleToolTraces?()");
  assert.ok(consumedAt >= 0 && setAt > consumedAt && fireAt > setAt);
  assert.match(composer, /keyboardG/);
  assert.doesNotMatch(commands, /model\.send\(/);
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /ToolTraceGroups\.keysLabel/);
  assert.match(sheet, /ToolTraceGroups\.action/);
  assert.match(sheet, /Gestures & shortcuts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /toolTraceGroups\.test\.ts/);
  assert.match(ci, /test_ios_tool_trace_groups\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.14 /);
  assert.match(roadmap, /collapse or expand tool traces from the keyboard/);
  assert.match(spec, /## 114\. v1\.14/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
