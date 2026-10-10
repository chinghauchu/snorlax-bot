// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SWITCH_EMPTY_LABEL,
  SWITCH_INPUT_LABEL,
  SWITCH_PLACEHOLDER,
  clampSwitchIndex,
  escapeClosesSwitcher,
  filterChats,
  fuzzyScore,
  isSwitchChord,
  stepSwitchIndex,
  switchQueryActive,
} from "./chatSwitcher.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatSwitcher.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatSwitcher.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);

const PHRASE =
  "v0.72 quick chat switcher (Cmd/Ctrl-K opens a small overlay that fuzzy-filters existing agents and chats by name; arrow keys and Enter switch to that chat; Esc closes; iOS search field on the chat list narrows chats by name; no new HTTP)";

const roster = [
  { id: "snorlax", name: "Snorlax" },
  { id: "design", name: "Design notes" },
  { id: "notes", name: "Notes" },
  { id: "group", name: "Snorlax-Bot" },
];

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("Cmd/Ctrl-K is the switch chord; Shift and Alt are not", () => {
  assert.equal(isSwitchChord({ key: "k", metaKey: true }), true);
  assert.equal(isSwitchChord({ key: "K", ctrlKey: true }), true);
  assert.equal(isSwitchChord({ key: "k", metaKey: true, shiftKey: true }), false);
  assert.equal(isSwitchChord({ key: "k", ctrlKey: true, altKey: true }), false);
  assert.equal(isSwitchChord({ key: "k", metaKey: true, ctrlKey: true }), false);
  assert.equal(isSwitchChord({ key: "f", metaKey: true }), false);
  assert.equal(isSwitchChord({ key: "k" }), false);
});

test("fuzzy name filter ranks subsequence hits and keeps roster order", () => {
  assert.equal(switchQueryActive("  "), false);
  assert.equal(switchQueryActive("s"), true);
  assert.equal(fuzzyScore("Snorlax", "xz"), null);
  assert.equal(fuzzyScore("a.b", "a.b") != null, true);
  assert.equal(fuzzyScore("axb", "a.b"), null);

  assert.deepEqual(
    filterChats(roster, "  ").map((chat) => chat.id),
    ["snorlax", "design", "notes", "group"],
  );
  assert.deepEqual(
    filterChats(roster, "sn").map((chat) => chat.id),
    ["snorlax", "group", "design"],
  );
  assert.deepEqual(
    filterChats(roster, "NOTES").map((chat) => chat.id),
    ["notes", "design"],
  );
  assert.deepEqual(
    filterChats(roster, "slx").map((chat) => chat.id),
    ["snorlax", "group"],
  );
  assert.deepEqual(
    filterChats(roster, "bot").map((chat) => chat.id),
    ["group"],
  );
  assert.deepEqual(filterChats(roster, "zzz"), []);

  assert.equal(stepSwitchIndex(2, 3, 1), 0);
  assert.equal(stepSwitchIndex(0, 3, -1), 2);
  assert.equal(stepSwitchIndex(0, 0, 1), -1);
  assert.equal(clampSwitchIndex(4, 2), 1);
  assert.equal(clampSwitchIndex(-1, 2), 0);
  assert.equal(clampSwitchIndex(0, 0), -1);
});

test("Esc closes the switcher before find, Stop, Jump, or recall", () => {
  assert.equal(escapeClosesSwitcher({ open: true }), true);
  assert.equal(escapeClosesSwitcher({ open: true, composing: true }), false);
  assert.equal(escapeClosesSwitcher({ open: false }), false);

  const escStart = app.indexOf('if (event.key !== "Escape") return;');
  assert.ok(escStart >= 0);
  const escBlock = app.slice(escStart, app.indexOf("async function onSend()", escStart));
  const switchAt = escBlock.indexOf("escapeClosesSwitcher(");
  const closeAt = escBlock.indexOf("escapeClosesFind(");
  const stopAt = escBlock.indexOf("escapeStopsGenerating(");
  const recallAt = escBlock.indexOf("escapeClearsRecall(");
  const jumpAt = escBlock.indexOf("escapeJumpsToLatest(");
  assert.ok(switchAt >= 0 && closeAt > switchAt);
  assert.ok(stopAt > closeAt && recallAt > closeAt && jumpAt > closeAt);
  const switchSlice = escBlock.slice(switchAt, closeAt);
  assert.match(switchSlice, /closeSwitcher\(\)/);
  assert.match(switchSlice, /preventDefault/);
  assert.doesNotMatch(switchSlice, /onStopGenerating/);
  assert.doesNotMatch(switchSlice, /closeFind\(\)/);
});

test("desktop overlay filters the loaded roster and Enter switches", () => {
  assert.match(app, /from "\.\/chatSwitcher"/);
  assert.match(app, /isSwitchChord/);
  assert.match(app, /filterChats/);
  assert.match(app, /stepSwitchIndex/);
  assert.match(app, /clampSwitchIndex/);
  assert.match(app, /className="switch-overlay"/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /role="listbox"/);
  assert.match(app, /SWITCH_INPUT_LABEL/);
  assert.match(app, /SWITCH_PLACEHOLDER/);
  assert.match(app, /SWITCH_EMPTY_LABEL/);
  assert.equal(SWITCH_INPUT_LABEL, "Switch chat");
  assert.equal(SWITCH_PLACEHOLDER, "Search chats");
  assert.equal(SWITCH_EMPTY_LABEL, "No chats");
  assert.match(css, /\.switch-overlay/);
  assert.match(css, /\.switch-option\.active/);

  const chord = sliceFn(app, "if (!isSwitchChord(event)) return;", "window.addEventListener");
  assert.match(chord, /preventDefault/);
  assert.match(chord, /setSwitchOpen\(true\)/);

  const arrows = sliceFn(app, "const onSwitcherKey", "window.addEventListener");
  assert.match(arrows, /event\.key === "ArrowDown"/);
  assert.match(arrows, /event\.key === "ArrowUp"/);
  assert.match(arrows, /stepSwitchIndex/);
  assert.match(arrows, /selectAgent/);
  assert.match(arrows, /event\.key === "Enter"/);

  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("OpenAPI stays 0.18.0; iOS filters the chat list; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /chatSwitcher\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(swift.includes(SWITCH_INPUT_LABEL));
  assert.ok(swift.includes(SWITCH_PLACEHOLDER));
  assert.ok(swift.includes(SWITCH_EMPTY_LABEL));
  assert.match(swift, /func filter/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(list, /\.searchable/);
  assert.match(list, /ChatSwitcher\.filter/);
  assert.match(list, /ChatSwitcher\.placeholder/);
  assert.match(list, /ChatSwitcher\.emptyLabel/);
  assert.match(list, /ChatSwitcher\.inputLabel/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(list, /computerPane\.ts/);
});
