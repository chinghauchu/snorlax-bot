// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { EDIT_AS_NEW_MESSAGE } from "./recallDraft.ts";
import {
  EDIT_EARLIER_LABEL,
  editAsNewDraft,
  offersEditAsNew,
  restoredComposerCaret,
} from "./editEarlierMessage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "editEarlierMessage.ts"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "EditEarlierMessage.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE = "v2.15 edit an earlier message as a new draft";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("every settled user message with text can refill the composer", () => {
  const user = {
    fromUser: true,
    kindMessage: true,
    content: "earlier prompt",
    pending: false,
  };
  assert.equal(offersEditAsNew(user), true);
  assert.equal(offersEditAsNew({ ...user, pending: true }), false);
  assert.equal(offersEditAsNew({ ...user, content: "" }), false);
  assert.equal(offersEditAsNew({ ...user, fromUser: false }), false);
  assert.equal(offersEditAsNew({ ...user, kindMessage: false }), false);
  assert.equal(offersEditAsNew({ ...user, content: " " }), true);

  const next = editAsNewDraft("keep this draft", "earlier prompt");
  assert.deepEqual(next, {
    text: "earlier prompt",
    caret: "earlier prompt".length,
    restore: "keep this draft",
  });
  assert.equal(editAsNewDraft("draft", ""), null);
  assert.equal(restoredComposerCaret(""), 0);
  assert.equal(restoredComposerCaret("keep this draft"), "keep this draft".length);
  const same = editAsNewDraft("same", "same");
  assert.equal(same?.restore, "same");
  assert.equal(same?.text, "same");
});

test("desktop and iOS share the control and restore one snapshot", () => {
  assert.equal(EDIT_EARLIER_LABEL, "Edit as new message");
  assert.equal(EDIT_AS_NEW_MESSAGE, EDIT_EARLIER_LABEL);
  assert.match(swift, /static let label = "Edit as new message"/);
  assert.match(swift, /static func offers\(/);
  assert.match(swift, /static func draft\(current:/);
  assert.match(swift, /static func restoredCaret/);
  assert.match(swift, /!pending && fromUser && kindMessage && !content.isEmpty/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(src.includes("computerPane.ts"), false);

  const edit = sliceFn(app, "function editEarlierIntoComposer(", "function quoteIntoComposer(");
  assert.match(edit, /editAsNewDraft\(draftRef\.current, text\)/);
  assert.match(edit, /if \(takeoverOpen\) return/);
  assert.match(edit, /recallRestoreRef\.current = next\.restore/);
  assert.match(edit, /setRecallArmed\(true\)/);
  assert.match(edit, /clearPending/);
  assert.doesNotMatch(edit, /onSend\(/);
  assert.doesNotMatch(edit, /queueFollowUp/);

  const clear = sliceFn(app, "function clearRecalledDraft(", "useEffect(");
  assert.match(clear, /const restore = recallRestoreRef\.current/);
  assert.match(clear, /setDraft\(restore\)/);
  assert.match(clear, /setRecallArmed\(false\)/);
  assert.match(app, /function fillRecalledDraft/);
  assert.match(
    sliceFn(app, "function fillRecalledDraft(", "function editEarlierIntoComposer("),
    /recallRestoreRef\.current = ""/,
  );

  const control = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.match(control, /offersEditAsNew\(/);
  assert.match(control, /\{EDIT_AS_NEW_MESSAGE\}/);
  assert.match(control, /editEarlierMessageRef\.current\(content\)/);
  assert.match(control, /COPY_CONTROL_LABEL/);
  assert.match(app, /<UserMessageCopy content=\{message\.content\} \/>/);

  assert.match(model, /EditEarlierMessage\.draft\(current: draft, messageText: text\)/);
  assert.match(model, /recallRestore = next\.restore/);
  assert.match(model, /wantsComposerFocus = true/);
  assert.match(model, /EditEarlierMessage\.restoredCaret\(restore\)/);
  assert.match(model, /let restore = recallRestore/);
  const recall = sliceFn(model, "func recallLastSentFromArrowUp()", "func quoteIntoComposer(");
  assert.match(recall, /recallRestore = ""/);
  assert.match(recall, /RecallDraft\.arrowUpRecalls/);
  assert.match(chat, /EditEarlierMessage\.offers\(/);
  assert.match(chat, /OptimisticSend\.isOptimistic\(message\.id\)/);
  assert.match(chat, /model\.editAsNewMessage\(message\.content\)/);
  assert.match(chat, /Button\(RecallDraft\.editAsNewMessage\)/);
  assert.doesNotMatch(chat, /showEditAsNew: index == recallIdx/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const body of [openapi, protocol, runtimeOpenapi]) {
    assert.match(body, /version: 0\.18\.0/);
    assert.doesNotMatch(body, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
  assert.match(ci, /test_ios_edit_earlier_message\.py/);
  assert.match(pkg, /src\/editEarlierMessage\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
