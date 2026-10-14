// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CHAT_SHORTCUTS } from "./chatShortcuts.ts";
import { NEAR_BOTTOM_PX, onJumpToLatest, onUserScroll, STICK_ARMED } from "./stickToBottom.ts";
import {
  TRANSCRIPT_EDGE_ACTION,
  TRANSCRIPT_EDGE_KEYS,
  TRANSCRIPT_PAGE_ACTION,
  TRANSCRIPT_PAGE_KEYS,
  nextTranscriptScrollTop,
  pageLandsNearBottom,
  prefersJumpToLatest,
  reconcileCommandedScroll,
  transcriptScrollAction,
  transcriptScrollAnimates,
  transcriptScrollBlocked,
} from "./transcriptScroll.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "transcriptScroll.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "TranscriptScroll.swift"),
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

const PHRASE =
  "v1.03 transcript keyboard scroll (PageUp/PageDown scrolls the loaded transcript about one viewport; Cmd/Ctrl-Home jumps to the oldest loaded messages; Cmd/Ctrl-End jumps to the latest and re-arms stick-to-bottom the same way Jump to latest does; keys are not stolen from the composer, find bar, rename field, quick switcher, shortcuts overlay, lightbox, or a focused widget, approve, or connect card; IME stays; Up-arrow recall, Esc=Stop, Esc=Jump, Alt+Up/Down, Cmd/Ctrl-L, Cmd/Ctrl-Shift-C, and in-chat find stay; Reduce Motion adds no animation beyond native scroll; the shortcuts list includes Page Up / Page Down and Cmd/Ctrl Home / End; iOS hardware Page Up / Page Down and command-up / command-down match and are listed in Gestures & shortcuts; no new HTTP)";

const openGate = {
  chatOpen: true,
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

const long = { scrollTop: 400, scrollHeight: 2000, clientHeight: 500 };

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("PageUp/PageDown and Cmd/Ctrl-Home/End scroll; other chords do not", () => {
  assert.equal(transcriptScrollAction({ key: "PageUp" }), "pageUp");
  assert.equal(transcriptScrollAction({ key: "PageDown" }), "pageDown");
  assert.equal(transcriptScrollAction({ key: "Home", metaKey: true }), "top");
  assert.equal(transcriptScrollAction({ key: "End", ctrlKey: true }), "bottom");
  assert.equal(transcriptScrollAction({ key: "Home", ctrlKey: true }), "top");
  assert.equal(transcriptScrollAction({ key: "End", metaKey: true }), "bottom");
  assert.equal(transcriptScrollAction({ key: "Home" }), null);
  assert.equal(transcriptScrollAction({ key: "End" }), null);
  assert.equal(transcriptScrollAction({ key: "PageUp", shiftKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "PageDown", altKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "PageDown", metaKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "PageUp", ctrlKey: true }), null);
  assert.equal(
    transcriptScrollAction({ key: "Home", metaKey: true, ctrlKey: true }),
    null,
  );
  assert.equal(
    transcriptScrollAction({ key: "End", metaKey: true, shiftKey: true }),
    null,
  );
  assert.equal(transcriptScrollAction({ key: "ArrowUp" }), null);
  assert.equal(transcriptScrollAction({ key: "ArrowDown", altKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "l", metaKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "c", metaKey: true, shiftKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "f", metaKey: true }), null);
  assert.equal(transcriptScrollAction({ key: "Escape" }), null);
  assert.equal(TRANSCRIPT_PAGE_KEYS, "Page Up / Page Down");
  assert.equal(TRANSCRIPT_PAGE_ACTION, "Scroll the transcript");
  assert.equal(TRANSCRIPT_EDGE_KEYS, "Cmd/Ctrl Home / End");
  assert.equal(TRANSCRIPT_EDGE_ACTION, "Oldest or latest messages");
});

test("one viewport, clamped; End prefers Jump; Reduce Motion does not animate", () => {
  assert.equal(nextTranscriptScrollTop(long, "pageDown"), 900);
  assert.equal(nextTranscriptScrollTop(long, "pageUp"), 0);
  assert.equal(nextTranscriptScrollTop({ ...long, scrollTop: 100 }, "pageUp"), 0);
  assert.equal(nextTranscriptScrollTop(long, "top"), 0);
  assert.equal(nextTranscriptScrollTop(long, "bottom"), 1500);
  assert.equal(
    nextTranscriptScrollTop({ scrollTop: 1400, scrollHeight: 2000, clientHeight: 500 }, "pageDown"),
    1500,
  );
  assert.equal(
    nextTranscriptScrollTop({ scrollTop: 0, scrollHeight: 200, clientHeight: 500 }, "pageDown"),
    0,
  );
  assert.equal(prefersJumpToLatest("bottom"), true);
  assert.equal(prefersJumpToLatest("pageDown"), false);
  assert.equal(prefersJumpToLatest("pageUp"), false);
  assert.equal(prefersJumpToLatest("top"), false);
  assert.equal(pageLandsNearBottom(long, "bottom"), true);
  assert.equal(
    pageLandsNearBottom(
      { scrollTop: 1100, scrollHeight: 2000, clientHeight: 500 },
      "pageDown",
    ),
    true,
  );
  assert.equal(pageLandsNearBottom(long, "pageDown"), false);
  assert.equal(pageLandsNearBottom(long, "top"), false);
  assert.equal(NEAR_BOTTOM_PX, 64);
  assert.deepEqual(onJumpToLatest(), { ...STICK_ARMED });
  assert.deepEqual(onUserScroll({ armed: false, showJump: true }, true), { ...STICK_ARMED });
  assert.equal(transcriptScrollAnimates(false), false);
  assert.equal(transcriptScrollAnimates(true), false);
});

test("a repeated page keeps the commanded offset until geometry arrives", () => {
  const geometry = { scrollTop: 400, scrollHeight: 2000, clientHeight: 500 };
  const held = reconcileCommandedScroll(900, 400, geometry);
  assert.equal(held.commandedTop, 900);
  assert.equal(held.box.scrollTop, 900);
  assert.equal(held.previousGeometryTop, 400);
  const arrived = reconcileCommandedScroll(900, 400, { ...geometry, scrollTop: 900 });
  assert.equal(arrived.commandedTop, null);
  assert.equal(arrived.box.scrollTop, 900);
  const user = reconcileCommandedScroll(900, 400, { ...geometry, scrollTop: 100 });
  assert.equal(user.commandedTop, null);
  assert.equal(user.box.scrollTop, 100);
  const idle = reconcileCommandedScroll(null, 400, geometry);
  assert.equal(idle.commandedTop, null);
  assert.equal(idle.box.scrollTop, 400);
});

test("text fields, overlays, and cards keep the keys", () => {
  assert.equal(transcriptScrollBlocked(openGate), false);
  for (const flag of [
    "composing",
    "inTextField",
    "inCard",
    "findOpen",
    "switchOpen",
    "shortcutsOpen",
    "renaming",
    "lightboxOpen",
    "menuOpen",
    "blocked",
  ] as const) {
    assert.equal(transcriptScrollBlocked({ ...openGate, [flag]: true }), true, flag);
  }
  assert.equal(transcriptScrollBlocked({ ...openGate, chatOpen: false }), true);
});

test("desktop wires page and edge keys without sending or a smooth scroll", () => {
  const block = sliceFn(
    app,
    "const onTranscriptScrollKey",
    'addEventListener("keydown", onTranscriptScrollKey, true)',
  );
  assert.match(block, /transcriptScrollAction\(/);
  assert.match(block, /transcriptScrollBlocked\(gate\)/);
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
  assert.match(block, /preventDefault/);
  assert.match(block, /stopPropagation/);
  assert.match(block, /prefersJumpToLatest\(action\)/);
  assert.match(block, /onJumpLatest\(\)/);
  assert.match(block, /nextTranscriptScrollTop\(box, action\)/);
  assert.match(block, /el\.scrollTop = nextTop/);
  assert.match(block, /onUserScroll\(/);
  assert.match(block, /isNearBottom\(/);
  assert.doesNotMatch(block, /onSend\(/);
  assert.doesNotMatch(block, /setDraft\(/);
  assert.doesNotMatch(block, /behavior:\s*"smooth"/);
  assert.doesNotMatch(block, /scrollIntoView/);

  const page = CHAT_SHORTCUTS.find((item) => item.id === "page");
  const edge = CHAT_SHORTCUTS.find((item) => item.id === "transcript-edge");
  assert.ok(page);
  assert.ok(edge);
  assert.equal(page.keys, TRANSCRIPT_PAGE_KEYS);
  assert.equal(page.action, TRANSCRIPT_PAGE_ACTION);
  assert.equal(edge.keys, TRANSCRIPT_EDGE_KEYS);
  assert.equal(edge.action, TRANSCRIPT_EDGE_ACTION);
  assert.match(shortcuts, /Page Up \/ Page Down/);
  assert.match(shortcuts, /Cmd\/Ctrl Home \/ End/);
  assert.match(shortcuts, /Scroll the transcript/);
  assert.match(shortcuts, /Oldest or latest messages/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("iOS hardware page and command-arrows match; OpenAPI stays 0.18.0", () => {
  assert.match(swift, /static let pageKeysLabel = "Page Up \/ Page Down"/);
  assert.match(swift, /static let pageAction = "Scroll the transcript"/);
  assert.match(swift, /static let edgeKeysLabel = "⌘↑ \/ ⌘↓"/);
  assert.match(swift, /static let edgeAction = "Oldest or latest messages"/);
  assert.match(swift, /static func action/);
  assert.match(swift, /static func offset/);
  assert.match(swift, /static func prefersJumpToLatest/);
  assert.match(swift, /static func reconcile/);
  assert.match(swift, /scrollAnimation\(reduceMotion:/);
  assert.match(swift, /return nil/);
  assert.match(swift, /No HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(chat, /func transcriptScrollKey/);
  assert.match(chat, /TranscriptScroll\.action/);
  assert.match(chat, /TranscriptScroll\.prefersJumpToLatest/);
  assert.match(chat, /StickToBottom\.onJumpToLatest/);
  assert.match(chat, /composerFocused/);
  assert.match(chat, /findOpen/);
  assert.match(chat, /findFieldFocused/);
  assert.match(chat, /shortcutsOpen/);
  assert.match(chat, /lightbox != nil/);
  assert.match(chat, /textInputIsFirstResponder/);
  assert.match(chat, /scrollPosition\(\$transcriptPosition\)/);
  assert.match(chat, /transcriptPosition\.scrollTo\(point:/);
  assert.match(chat, /transcriptPosition\.scrollTo\(edge: \.bottom\)/);
  assert.match(chat, /shouldFocusComposerAfterAbort/);
  assert.doesNotMatch(
    sliceFn(chat, "func applyTranscriptScroll", "private func chatNavKey"),
    /model\.send\(/,
  );
  assert.doesNotMatch(chat, /computerPane\.ts/);

  assert.match(sheet, /TranscriptScroll\.pageKeysLabel/);
  assert.match(sheet, /TranscriptScroll\.pageAction/);
  assert.match(sheet, /TranscriptScroll\.edgeKeysLabel/);
  assert.match(sheet, /TranscriptScroll\.edgeAction/);
  assert.match(sheet, /Gestures & shortcuts/);
  assert.match(sheet, /\.onKeyPress/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /transcriptScroll\.test\.ts/);
  assert.match(ci, /test_ios_transcript_scroll\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.03 /);
  assert.match(roadmap, /transcript keyboard scroll/);
  assert.match(spec, /## 103\. v1\.03/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
