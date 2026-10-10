// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  anchorScrollTop,
  captureReadingPlace,
  readingNearBottom,
  readingPlaceKey,
  readingRestore,
  readingTailGrew,
  stickForReadingRestore,
  topVisibleAnchor,
} from "./readingPlace.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "readingPlace.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ReadingPlace.swift"),
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

const PHRASE =
  "v0.74 per-chat reading place (switching away remembers if you were at the latest messages or parked on an earlier one; coming back restores that place; within ~64px of the bottom still opens at the latest; a new reply while you were away shows Jump to latest; Send, Regenerate, and Jump still snap to the bottom; session memory only; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("reading place key separates a timeline from its thread", () => {
  assert.equal(readingPlaceKey("snorlax", null), "snorlax\n");
  assert.equal(readingPlaceKey("snorlax", undefined), "snorlax\n");
  assert.notEqual(
    readingPlaceKey("group", null),
    readingPlaceKey("group", "thread-1"),
  );
});

test("unlaid-out and near-bottom scrolls are the latest messages", () => {
  assert.equal(readingNearBottom(null), true);
  assert.equal(
    readingNearBottom({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }),
    true,
  );
  assert.equal(
    readingNearBottom({ scrollTop: 536, scrollHeight: 1000, clientHeight: 400 }),
    true,
  );
  assert.equal(
    readingNearBottom({ scrollTop: 535, scrollHeight: 1000, clientHeight: 400 }),
    false,
  );
});

test("capture drops the anchor when the reader is at the bottom", () => {
  assert.deepEqual(
    captureReadingPlace({
      nearBottom: true,
      anchorId: "m1",
      tailId: "m9",
    }),
    { nearBottom: true, anchorId: null, tailId: "m9" },
  );
  assert.deepEqual(
    captureReadingPlace({
      nearBottom: false,
      anchorId: "m2",
      tailId: "m9",
    }),
    { nearBottom: false, anchorId: "m2", tailId: "m9" },
  );
});

test("top visible anchor is the first row still inside the viewport", () => {
  const rows = [
    { id: "late", top: 400, bottom: 480 },
    { id: "early", top: 0, bottom: 40 },
    { id: "", top: 40, bottom: 80 },
    { id: "mid", top: 80, bottom: 200 },
  ];
  assert.equal(topVisibleAnchor(rows, 100), "mid");
  assert.equal(topVisibleAnchor(rows, 0), "early");
  assert.equal(topVisibleAnchor(rows, 500), "late");
  assert.equal(topVisibleAnchor([], 0), null);
});

test("restore parks only when the saved anchor is still in the transcript", () => {
  const parked = captureReadingPlace({
    nearBottom: false,
    anchorId: "m2",
    tailId: "m9",
  });
  assert.equal(readingRestore(null, ["m2"]), "bottom");
  assert.equal(readingRestore(undefined, ["m2"]), "bottom");
  assert.equal(
    readingRestore(
      captureReadingPlace({ nearBottom: true, anchorId: "m2", tailId: "m9" }),
      ["m2"],
    ),
    "bottom",
  );
  assert.equal(readingRestore(parked, ["m1", "m3"]), "bottom");
  assert.equal(readingRestore(parked, ["m1", "m2", "m9"]), "anchor");
  assert.equal(readingTailGrew(parked, "m9"), false);
  assert.equal(readingTailGrew(parked, "m10"), true);
  assert.equal(readingTailGrew(parked, null), false);
  assert.equal(
    readingTailGrew(
      captureReadingPlace({ nearBottom: false, anchorId: "m2", tailId: null }),
      "m1",
    ),
    true,
  );
});

test("parked place disarms stick and shows Jump only when the tail grew", () => {
  assert.deepEqual(stickForReadingRestore("bottom", true), {
    armed: true,
    showJump: false,
  });
  assert.deepEqual(stickForReadingRestore("anchor", false), {
    armed: false,
    showJump: false,
  });
  assert.deepEqual(stickForReadingRestore("anchor", true), {
    armed: false,
    showJump: true,
  });
  assert.equal(anchorScrollTop(240, 80, 100), 260);
  assert.equal(anchorScrollTop(10, 80, 20), 0);
});

test("desktop restores on switch and still snaps Send, Regenerate, and Jump", () => {
  const move = sliceFn(app, "const moveComposer", "function publishReplyUnread");
  assert.ok(
    move.indexOf("captureOpenReadingPlace()") <
      move.indexOf("convoRef.current ="),
  );
  const load = sliceFn(
    app,
    "async function loadConversation",
    "async function selectAgent",
  );
  assert.ok(load.indexOf("pendingRestore.current") < load.indexOf("setActiveId"));
  assert.match(load, /setTranscriptGen\(gen\)/);
  assert.match(load, /setFindOpen\(false\)/);
  assert.match(app, /if \(pending && pending\.key === key\) return/);
  assert.match(app, /stickForReadingRestore\(mode, grew\)/);
  assert.match(app, /anchorScrollTop\(/);
  assert.match(app, /data-reading-id=\{message\.id\}/);
  assert.match(app, /data-reading-id=\{`day:\$\{message\.id\}`\}/);
  assert.match(app, /snapStick\(\)/);
  assert.match(app, /regeneratePostBody\(\)/);
  assert.match(app, /onJumpToLatest\(\)/);
  assert.match(src, /No HTTP/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /\/v1\//);
});

test("OpenAPI stays 0.18.0; iOS restores the same way; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /readingPlace\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.match(swift, /No HTTP/);
  assert.match(swift, /func key\(agentId:/);
  assert.match(swift, /func topVisibleAnchor/);
  assert.match(swift, /func restore\(saved:/);
  assert.match(swift, /func tailGrew/);
  assert.match(swift, /showJump: tailGrew/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UserDefaults/);
  assert.match(chat, /readingAnchor\(message\.id\)/);
  assert.match(chat, /applyPendingRestore\(proxy\)/);
  assert.match(chat, /proxy\.scrollTo\(anchor, anchor: \.top\)/);
  assert.match(chat, /if model\.pendingReadingKey != nil \{ return \}/);
  const restore = sliceFn(chat, "private func applyPendingRestore", "private func snapToBottom");
  assert.match(restore, /ReadingPlace\.restore/);
  assert.match(restore, /ReadingPlace\.stick/);
  assert.match(restore, /consumeReadingRestore\(\)/);
  const load = sliceFn(model, "func loadConversation", "func createAgent");
  assert.ok(
    load.indexOf("readingPublishLocked = true") <
      load.indexOf("selectedAgentID = id"),
  );
  assert.ok(
    load.indexOf("messages = rows") < load.indexOf("readingTranscriptToken += 1"),
  );
  assert.match(model, /readingPlaces\[key\] = ReadingPlace\.capture/);
  assert.doesNotMatch(model, /UserDefaults\.standard\.set\(reading/);
});
