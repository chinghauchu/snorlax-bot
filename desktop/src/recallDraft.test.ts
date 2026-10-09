// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EDIT_AS_NEW_MESSAGE,
  arrowUpRecalls,
  escapeClearsRecall,
  isRecallableUserMessage,
  latestUserMessageText,
  recallArmedAfterEdit,
} from "./recallDraft.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "recallDraft.ts"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "RecallDraft.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
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

const PHRASE =
  "v0.68 recall last message (empty composer Up-arrow or iOS Edit as new message puts the latest user text in the composer; Escape or clearing restores empty; no recall while typing or IME; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

const up = {
  key: "ArrowUp",
  composerText: "",
  composing: false,
};

test("Up-arrow recalls only from an empty composer with IME idle", () => {
  assert.equal(arrowUpRecalls(up), true);
  assert.equal(arrowUpRecalls({ ...up, composerText: "hello" }), false);
  assert.equal(arrowUpRecalls({ ...up, composerText: " " }), false);
  assert.equal(arrowUpRecalls({ ...up, composing: true }), false);
  assert.equal(arrowUpRecalls({ ...up, key: "ArrowDown" }), false);
  assert.equal(arrowUpRecalls({ ...up, key: "Enter" }), false);
  assert.equal(arrowUpRecalls({ ...up, shiftKey: true }), false);
  assert.equal(arrowUpRecalls({ ...up, metaKey: true }), false);
  assert.equal(arrowUpRecalls({ ...up, ctrlKey: true }), false);
  assert.equal(arrowUpRecalls({ ...up, altKey: true }), false);
});

test("latest user kind=message text; skip assistant, tools, and blanks", () => {
  const rows = [
    { senderId: "user", kind: "message", content: "first" },
    { senderId: "snorlax", role: "assistant", kind: "message", content: "reply" },
    { senderId: "user", kind: "tool", content: "Watched clip" },
    { senderId: "user", kind: "message", content: "" },
    { role: "user", kind: "message", content: "second" },
    { senderId: "user", kind: "message", content: "   " },
  ];
  assert.equal(isRecallableUserMessage(rows[0]!), true);
  assert.equal(isRecallableUserMessage(rows[1]!), false);
  assert.equal(isRecallableUserMessage(rows[2]!), false);
  assert.equal(isRecallableUserMessage(rows[3]!), false);
  assert.equal(latestUserMessageText(rows), "   ");
  assert.equal(
    latestUserMessageText(rows.slice(0, 5)),
    "second",
  );
  assert.equal(latestUserMessageText([]), null);
  assert.equal(
    latestUserMessageText([
      { senderId: "snorlax", kind: "message", content: "only assistant" },
    ]),
    null,
  );
  assert.equal(EDIT_AS_NEW_MESSAGE, "Edit as new message");
  assert.match(swift, /editAsNewMessage = "Edit as new message"/);
});

test("Escape restores an armed recall; Stop, IME, and pending cards win", () => {
  assert.equal(
    escapeClearsRecall({ armed: true, composing: false, busy: false }),
    true,
  );
  assert.equal(
    escapeClearsRecall({ armed: false, composing: false, busy: false }),
    false,
  );
  assert.equal(
    escapeClearsRecall({ armed: true, composing: true, busy: false }),
    false,
  );
  assert.equal(
    escapeClearsRecall({ armed: true, composing: false, busy: true }),
    false,
  );
  assert.equal(
    escapeClearsRecall({
      armed: true,
      composing: false,
      busy: false,
      pendingWidget: true,
    }),
    false,
  );
  assert.equal(
    escapeClearsRecall({
      armed: true,
      composing: false,
      busy: false,
      pendingApprove: true,
    }),
    false,
  );
  assert.equal(
    escapeClearsRecall({
      armed: true,
      composing: false,
      busy: false,
      pendingConnect: true,
    }),
    false,
  );
  assert.equal(recallArmedAfterEdit("", true), false);
  assert.equal(recallArmedAfterEdit("edited", true), true);
  assert.equal(recallArmedAfterEdit("typed", false), false);
});

test("desktop wires Up-arrow and Escape without stealing Stop or menus", () => {
  const keys = sliceFn(app, "function onComposerKey", "function insertDraftAtCaret");
  const composingAt = keys.indexOf("isComposerComposing(event)");
  const mentionAt = keys.indexOf('event.key === "ArrowUp"');
  const recallAt = keys.indexOf("arrowUpRecalls");
  const escapeAt = keys.indexOf("escapeClearsRecall");
  const mutedAt = keys.indexOf("sendMutedWhileGenerating");
  assert.ok(composingAt >= 0 && composingAt < recallAt);
  assert.ok(mentionAt >= 0 && mentionAt < recallAt);
  assert.ok(recallAt < mutedAt);
  assert.ok(escapeAt > recallAt && escapeAt < mutedAt);
  assert.match(keys, /fillRecalledDraft\(text\)/);
  assert.match(app, /function fillRecalledDraft/);
  assert.match(app, /pendingCaret\.current = text\.length/);
  assert.match(app, /setRecallArmed\(true\)/);
  assert.match(app, /recallArmedAfterEdit/);
  assert.match(app, /function clearRecalledDraft/);

  const stopAt = app.indexOf("escapeStopsGenerating({");
  const clearAt = app.indexOf("escapeClearsRecall({");
  const jumpAt = app.indexOf("escapeJumpsToLatest({");
  assert.ok(stopAt >= 0 && stopAt < clearAt && clearAt < jumpAt);
  const stopBranch = app.slice(stopAt, jumpAt);
  assert.match(stopBranch, /onStopGenerating\(\)/);
  assert.doesNotMatch(stopBranch, /onJumpLatest\(\)/);
  assert.match(app, /from "\.\/recallDraft"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("iOS adds Edit as new message beside the timestamp long-press", () => {
  const menu = sliceFn(chat, "struct BubbleTimestampMenu", "struct AttachmentShareSheet");
  assert.match(menu, /Button\(stamp\)/);
  assert.match(menu, /\.disabled\(true\)/);
  assert.match(menu, /Button\(RecallDraft\.editAsNewMessage\)/);
  const headerStart = menu.indexOf("} header: {");
  assert.ok(headerStart >= 0);
  const headerEnd = menu.indexOf("}", headerStart + "} header: {".length);
  const header = menu.slice(headerStart, headerEnd);
  assert.match(header, /Text\(stamp\)/);
  assert.doesNotMatch(header, /Button/);
  assert.match(chat, /showEditAsNew: index == recallIdx/);
  assert.match(chat, /RecallDraft\.latestIndex/);
  assert.match(chat, /model\.editAsNewMessage\(message\.content\)/);
  assert.match(chat, /clearRecallFromEscape/);
  assert.match(chat, /onArrowUpRecall/);
  assert.match(model, /func recallLastSentFromArrowUp/);
  assert.match(model, /func editAsNewMessage/);
  assert.match(model, /func clearRecallFromEscape/);
  assert.match(model, /recallArmed = false/);
  assert.match(composer, /inputUpArrow/);
  assert.match(composer, /keyboardUpArrow/);
  assert.match(composer, /markedTextRange/);
  assert.match(composer, /text\.isEmpty/);
  assert.match(swift, /static func arrowUpRecalls/);
  assert.match(swift, /static func escapeClears/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(chat, /computerPane\.ts/);
});

test("OpenAPI stays 0.18.0; roadmap + CI; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ci, /python3 ios\/scripts\/test_ios_recall_draft\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
