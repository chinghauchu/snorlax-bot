// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { QuoteJumps } from "./quoteJump.ts";
import {
  QUEUED_EDIT_LABEL,
  QUEUED_LABEL,
  QUEUED_LIST_LABEL,
  QUEUED_REMOVE_LABEL,
  canQueueFollowUp,
  dequeueFollowUp,
  dropQueuedFollowUps,
  editQueuedFollowUp,
  enqueueFollowUp,
  enterQueuesFollowUp,
  queuedItems,
  queuedSendKey,
  removeQueuedFollowUp,
  requeueFollowUp,
  restoreAfterQueuedFailure,
  shouldFlushQueue,
  type QueuedSendMap,
} from "./queuedSend.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "queuedSend.ts"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "QueuedSend.swift"),
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
const composer = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ComposerTextView.swift"),
  "utf8",
);

const PHRASE = "v1.28 queue a follow-up while a reply is generating";

function empty(): QueuedSendMap {
  return new Map();
}

test("Enter while generating queues text and does not send yet", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(
    canQueueFollowUp({ busy: true, text: "  next  ", hasChat: true }),
    true,
  );
  assert.equal(enterQueuesFollowUp(enter, { busy: true, text: "next" }), true);
  assert.equal(enterQueuesFollowUp(enter, { busy: false, text: "next" }), false);
  assert.equal(
    enterQueuesFollowUp(
      { key: "Enter", shiftKey: true, isComposing: false },
      { busy: true, text: "next" },
    ),
    false,
  );
  assert.equal(
    enterQueuesFollowUp(
      { key: "Enter", shiftKey: false, isComposing: true },
      { busy: true, text: "next" },
    ),
    false,
  );
  assert.equal(
    canQueueFollowUp({ busy: true, text: "   ", hasChat: true }),
    false,
  );
  assert.equal(
    canQueueFollowUp({ busy: true, text: "next", chipCount: 1, hasChat: true }),
    false,
  );
  assert.equal(
    canQueueFollowUp({
      busy: true,
      text: "next",
      attachError: true,
      hasChat: true,
    }),
    false,
  );
  assert.equal(
    canQueueFollowUp({
      busy: true,
      text: "next",
      takeoverOpen: true,
      hasChat: true,
    }),
    false,
  );
  assert.equal(
    canQueueFollowUp({ busy: true, text: "next", hasChat: false }),
    false,
  );
});

test("queued rows stay separate and go out one per completed reply", () => {
  const key = queuedSendKey("agent-a", null);
  let map = enqueueFollowUp(empty(), key, " first ", "q1", ["m1"]);
  map = enqueueFollowUp(map, key, "second", "q2");
  assert.deepEqual(
    queuedItems(map, key).map((row) => row.text),
    ["first", "second"],
  );
  assert.deepEqual(queuedItems(map, key)[0]?.mentionIds, ["m1"]);
  const first = dequeueFollowUp(map, key);
  assert.equal(first.item?.id, "q1");
  assert.equal(first.item?.text, "first");
  assert.deepEqual(
    queuedItems(first.map, key).map((row) => row.text),
    ["second"],
  );
  const second = dequeueFollowUp(first.map, key);
  assert.equal(second.item?.text, "second");
  assert.equal(queuedItems(second.map, key).length, 0);
  assert.equal(shouldFlushQueue({ fromQueue: false, failed: false }), true);
  assert.equal(shouldFlushQueue({ fromQueue: true, failed: false }), true);
  assert.equal(shouldFlushQueue({ fromQueue: true, failed: true }), false);
});

test("queue is per chat and survives another chat's rows", () => {
  const a = queuedSendKey("agent-a", null);
  const thread = queuedSendKey("agent-a", "thread-1");
  const b = queuedSendKey("agent-b", null);
  let map = enqueueFollowUp(empty(), a, "for A", "a1");
  map = enqueueFollowUp(map, thread, "for thread", "t1");
  map = enqueueFollowUp(map, b, "for B", "b1");
  assert.deepEqual(
    queuedItems(map, a).map((row) => row.text),
    ["for A"],
  );
  assert.equal(queuedItems(map, thread)[0]?.text, "for thread");
  assert.equal(queuedItems(map, b)[0]?.text, "for B");
  map = editQueuedFollowUp(map, a, "a1", "edited");
  assert.equal(queuedItems(map, a)[0]?.text, "edited");
  map = removeQueuedFollowUp(map, b, "b1");
  assert.equal(queuedItems(map, b).length, 0);
  assert.equal(queuedItems(map, a)[0]?.text, "edited");
});

test("blank edited rows are skipped and a failed send restores the queue text", () => {
  const key = queuedSendKey("agent-a", null);
  let map = enqueueFollowUp(empty(), key, "keep", "q1");
  map = enqueueFollowUp(map, key, "later", "q2");
  map = editQueuedFollowUp(map, key, "q1", "   ");
  const next = dequeueFollowUp(map, key);
  assert.equal(next.item?.id, "q2");
  assert.equal(queuedItems(next.map, key).length, 0);
  const parked = enqueueFollowUp(empty(), key, "waiting", "q3", [], [
    { text: "quoted", sourceId: "src" },
  ]);
  const dropped = dropQueuedFollowUps(parked, key);
  assert.equal(queuedItems(dropped.map, key).length, 0);
  assert.equal(dropped.remaining[0]?.quotes[0]?.sourceId, "src");
  assert.equal(
    restoreAfterQueuedFailure({
      failedText: "  failed  ",
      remaining: dropped.remaining,
      composerText: "draft",
    }),
    "failed\n\nwaiting\n\ndraft",
  );
  assert.equal(
    restoreAfterQueuedFailure({
      failedText: "failed",
      remaining: [],
      composerText: "",
    }),
    "failed",
  );
  const again = requeueFollowUp(empty(), key, {
    id: "q9",
    text: " back ",
    mentionIds: [],
    quotes: [],
  });
  assert.equal(queuedItems(again, key)[0]?.text, "back");
});

test("a queued send keeps its quote link without clearing a newer draft quote", () => {
  const jumps = new QuoteJumps(null);
  jumps.note("agent-a", null, "hello", "m1");
  const taken = jumps.takePending("agent-a", null);
  assert.equal(taken.length, 1);
  assert.equal(jumps.takePending("agent-a", null).length, 0);
  jumps.note("agent-a", null, "newer", "m2");
  jumps.commitOwned("agent-a", null, "> hello\n\n", taken);
  const sent = jumps.targets("agent-a", null, "> hello\n\n", new Set(["m1"]));
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.sourceId, "m1");
  jumps.commit("agent-a", null, "> newer");
  const newer = jumps.targets("agent-a", null, "> newer", new Set(["m2"]));
  assert.equal(newer[0]?.sourceId, "m2");
  const still = jumps.targets("agent-a", null, "> hello\n\n", new Set(["m1"]));
  assert.equal(still[0]?.sourceId, "m1");
});

test("desktop and iOS wire the queue above the composer", () => {
  assert.match(app, /enterQueuesFollowUp\(event/);
  assert.match(app, /queueFollowUp\(\)/);
  assert.match(app, /fromQueue: true/);
  assert.match(app, /sendQueuedFollowUp\(/);
  assert.match(app, /className="queued-follow-ups"/);
  assert.match(app, new RegExp(QUEUED_LABEL));
  assert.match(app, new RegExp(QUEUED_REMOVE_LABEL));
  assert.match(app, new RegExp(QUEUED_LIST_LABEL));
  assert.match(app, new RegExp(QUEUED_EDIT_LABEL));
  assert.match(app, /queueNow/);
  assert.match(css, /\.queued-follow-up \{/);
  assert.doesNotMatch(
    css.slice(css.indexOf(".queued-follow-ups"), css.indexOf(".queued-remove") + 40),
    /transition|animation/,
  );
  const keyStart = app.indexOf("function onComposerKey");
  const keyBody = app.slice(keyStart, app.indexOf("function insertDraftAtCaret", keyStart));
  const muteAt = keyBody.indexOf("sendMutedWhileGenerating(busy)");
  const queueAt = keyBody.indexOf("enterQueuesFollowUp(event");
  const sendAt = keyBody.indexOf("void onSend()");
  assert.ok(muteAt >= 0 && queueAt > muteAt && sendAt > queueAt);

  assert.match(swift, /static let label = "Queued"/);
  assert.match(swift, /static let removeLabel = "Remove queued message"/);
  assert.match(swift, /static func shouldFlush/);
  assert.match(model, /func queueFollowUp\(\)/);
  assert.match(model, /func settleQueuedSend/);
  assert.match(model, /quoteJumps.commitOwned/);
  assert.match(model, /quoteJumps.takePending/);
  assert.match(chat, /QueuedSend.label/);
  assert.match(chat, /QueuedSend.removeLabel/);
  assert.match(chat, /model.queueFollowUp\(\)/);
  assert.match(chat, /onReturnWhileMuted/);
  assert.match(composer, /onReturnWhileMuted\?\(\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("OpenAPI stays 0.18.0 and v1.28 is documented", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.28 /);
  assert.match(spec, /## 128\. v1\.28/);
  assert.match(spec, /v1\.28/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_queued_send\.py/);
});
