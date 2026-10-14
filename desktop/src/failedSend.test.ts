// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FAILED_SEND_COULDNT,
  FAILED_SEND_LINE,
  FAILED_SEND_REMOVE,
  FAILED_SEND_RETRY,
  INFERENCE_UNAVAILABLE,
  dismissFailedSend,
  failedSendLine,
  failedSendsForChat,
  isInferenceUnavailableError,
  isPreReplyStreamFailure,
  markFailedSend,
  orphanUserId,
  paintFailedSends,
  replyStarted,
  retryBlocked,
  type FailedSend,
} from "./failedSend.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "failedSend.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
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
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "FailedSend.swift"),
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
  "v0.78 retry a failed send (when a Send fails because the network or runtime is down, or an inference_unavailable error arrives before any reply, the user bubble stays in the transcript, muted, with Couldn't send · Retry; Retry sends the same text and attachments again; Remove dismisses it; no auto-retry; iOS also offers Retry on long-press; no new HTTP)";

type Row = { id: string; content: string; createdAt: string; role: string };

function row(id: string, content: string, createdAt: string, role = "user"): Row {
  return { id, content, createdAt, role };
}

function failed(message: Row, orphan: string | null = null): FailedSend<Row> {
  return {
    id: message.id,
    agentId: "snorlax-bot",
    threadId: null,
    content: message.content,
    attachmentIds: ["att-1"],
    mentionIds: ["peer"],
    message,
    orphanServerId: orphan,
  };
}

test("a failed send keeps the bubble and offers Retry, not an automatic resend", () => {
  assert.equal(FAILED_SEND_COULDNT, "Couldn't send");
  assert.equal(FAILED_SEND_RETRY, "Retry");
  assert.equal(FAILED_SEND_REMOVE, "Remove");
  assert.equal(failedSendLine(), FAILED_SEND_LINE);
  assert.equal(FAILED_SEND_LINE, "Couldn't send · Retry");
  assert.equal(INFERENCE_UNAVAILABLE, "inference_unavailable");
  assert.equal(retryBlocked(false), false);
  assert.equal(retryBlocked(true), true);
  assert.equal(
    isPreReplyStreamFailure({ sawReply: false, error: "oMLX is not reachable" }),
    true,
  );
  assert.equal(
    isPreReplyStreamFailure({
      sawReply: false,
      error: "inference_unavailable: model down",
    }),
    true,
  );
  assert.equal(isInferenceUnavailableError("inference_unavailable: model down"), true);
  assert.equal(
    isPreReplyStreamFailure({ sawReply: true, error: "inference_unavailable" }),
    false,
  );
  assert.equal(isPreReplyStreamFailure({ sawReply: false, error: "  " }), false);
  assert.equal(isPreReplyStreamFailure({ sawReply: false, error: null }), false);
  assert.equal(replyStarted({ delta: "Hi" }), true);
  assert.equal(replyStarted({ delta: "" }), false);
  assert.equal(replyStarted({ isTool: true }), true);
  assert.equal(replyStarted({ isCard: true }), true);
  assert.equal(replyStarted({ isUser: true, content: "ping" }), false);
  assert.equal(replyStarted({ isUser: false, content: "pong" }), true);
  assert.doesNotMatch(src, /setInterval|setTimeout/);
  assert.doesNotMatch(swift, /Timer|asyncAfter/);
});

test("Retry keeps the same text, and a persisted pre-reply row stays hidden", () => {
  const before = new Set(["u0"]);
  const listed = [
    row("u0", "earlier", "2026-10-12T00:00:00.000Z"),
    row("srv-1", "ping", "2026-10-12T00:01:00.000Z"),
    row("a1", "nope", "2026-10-12T00:01:01.000Z", "assistant"),
  ];
  assert.equal(
    orphanUserId(before, listed, "ping", (item) => item.role === "user"),
    "srv-1",
  );
  assert.equal(
    orphanUserId(before, listed, "missing", (item) => item.role === "user"),
    null,
  );
  assert.equal(
    orphanUserId(new Set(["u0", "srv-1"]), listed, "ping", (item) => item.role === "user"),
    null,
  );

  const local = row("local-1", "ping", "2026-10-12T00:01:00.000Z");
  const marked = markFailedSend([], failed(local, "srv-1"));
  assert.equal(marked.length, 1);
  assert.equal(marked[0]?.attachmentIds[0], "att-1");
  assert.equal(marked[0]?.mentionIds[0], "peer");
  const again = markFailedSend(marked, failed(local, "srv-2"));
  assert.equal(again.length, 1);
  assert.equal(again[0]?.orphanServerId, "srv-2");

  const painted = paintFailedSends(listed, marked, new Set());
  assert.deepEqual(
    painted.map((item) => item.id),
    ["u0", "local-1", "a1"],
  );
  assert.equal(painted.some((item) => item.id === "srv-1"), false);

  const other = failedSendsForChat(
    [
      { ...failed(local), agentId: "other", threadId: "t1" },
      failed(row("local-2", "stay", "2026-10-12T00:02:00.000Z")),
    ],
    "snorlax-bot",
    null,
  );
  assert.equal(other.length, 1);
  assert.equal(other[0]?.id, "local-2");

  const gone = dismissFailedSend(again, "local-1");
  assert.equal(gone.length, 0);
  const hidden = paintFailedSends(listed, gone, new Set(["srv-1"]));
  assert.deepEqual(
    hidden.map((item) => item.id),
    ["u0", "a1"],
  );
});

test("desktop and iOS reuse the send path and do not restore the composer", () => {
  assert.match(app, /from "\.\/failedSend"/);
  assert.match(app, /rememberFailedSend\(/);
  assert.match(app, /retryFailedSend\(/);
  assert.match(app, /className="failed-send"/);
  assert.match(app, /className="failed-send-retry"/);
  assert.match(app, /FAILED_SEND_RETRY/);
  assert.match(app, /FAILED_SEND_REMOVE/);
  assert.match(app, /className="bubble user"/);
  assert.match(app, /data-failed=\{/);
  assert.match(app, /failedSends\.some\(\(row\) => row\.id === message\.id\)/);
  assert.match(app, /reuseOptimisticId/);
  assert.match(app, /isPreReplyStreamFailure\(/);
  assert.match(app, /retryBlocked\(busy\)/);
  assert.doesNotMatch(app, /failOptimistic\(/);
  assert.doesNotMatch(app, /setDraft\(content\)/);
  assert.doesNotMatch(app, /chatDrafts\.current\.restore\(/);
  assert.doesNotMatch(src, /setInterval|setTimeout/);
  assert.doesNotMatch(app, /retryFailedSend\([^)]*\)[\s\S]{0,40}useEffect/);

  const send = app.slice(
    app.indexOf("async function onSend()"),
    app.indexOf("async function answerWidget"),
  );
  assert.match(send, /submitTurn\(/);
  const retry = app.slice(
    app.indexOf("async function retryFailedSend"),
    app.indexOf("function onStopGenerating()"),
  );
  assert.match(retry, /submitTurn\(\{/);
  assert.match(retry, /reuseOptimisticId: row\.id/);
  assert.match(retry, /attachmentIds: row\.attachmentIds/);
  assert.match(retry, /mentionIds: row\.mentionIds/);
  assert.doesNotMatch(retry, /setDraft\(/);

  assert.match(css, /\.bubble\.user\[data-failed\]/);
  assert.match(css, /opacity:\s*0\.55/);
  assert.match(css, /\.failed-send/);
  assert.match(css, /font-size:\s*12px/);
  assert.match(css, /color:\s*var\(--text-muted\)/);
  const motion = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(motion, /\.bubble\.user\[data-failed\]/);
  assert.match(motion, /transition:\s*none/);

  assert.match(swift, /static let line = "Couldn't send · Retry"/);
  assert.match(swift, /static let retry = "Retry"/);
  assert.match(swift, /static let remove = "Remove"/);
  assert.match(swift, /static func isPreReplyFailure/);
  assert.match(swift, /static func paint/);
  assert.match(model, /func retryFailedSend/);
  assert.match(model, /func send\(\) async/);
  assert.match(model, /noteFailedSend\(/);
  assert.match(model, /FailedSend\.isPreReplyFailure/);
  assert.match(model, /retryOverride = row/);
  assert.match(model, /await send\(\)/);
  assert.doesNotMatch(
    model.slice(model.indexOf("func send() async"), model.indexOf("func dismissFailedSend")),
    /draft = content/,
  );
  assert.match(chat, /FailedSend\.retry/);
  assert.match(chat, /FailedSend\.remove/);
  assert.match(chat, /model\.retryFailedSend\(id: message\.id\)/);
  assert.match(chat, /model\.dismissFailedSend\(id: message\.id\)/);
  assert.match(chat, /opacity\(model\.failedSend\(id: message\.id\) == nil \? 1 : 0\.55\)/);
  assert.match(chat, /transaction\.animation = nil/);
  assert.match(chat, /Button\(FailedSend\.retry\)/);
});

test("OpenAPI stays 0.18.0; retry is local; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /failedSend\.test\.ts/);
  assert.match(ci, /test_ios_failed_send\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
