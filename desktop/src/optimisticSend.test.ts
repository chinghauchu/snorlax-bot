// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COULDNT_SEND,
  OPTIMISTIC_ID_PREFIX,
  absorbServerUser,
  composerSendHint,
  failOptimistic,
  insertOptimistic,
  isHttpSendFailure,
  isOptimisticId,
  optimisticUserMessage,
  reconcileOptimistic,
  shouldBlockSend,
} from "./optimisticSend.ts";
import { isUserSender } from "./mentions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const sendSrc = readFileSync(join(here, "optimisticSend.ts"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function user(id: string, content: string) {
  return {
    id,
    content,
    role: "user" as const,
    senderId: "user",
  };
}

function left(id: string, content: string) {
  return {
    id,
    content,
    role: "assistant" as const,
    senderId: "snorlax-bot",
  };
}

test("Send inserts an optimistic user-RIGHT bubble with text and pending chips", () => {
  const prior = [left("a1", "hello")];
  const chip = {
    id: "att-1",
    kind: "image" as const,
    name: "shot.png",
    url: "/v1/attachments/att-1",
    size: 12,
  };
  const row = optimisticUserMessage({
    id: "local-1",
    agentId: "snorlax-bot",
    content: "ping",
    attachments: [chip],
    createdAt: "2026-09-21T00:00:00.000Z",
  });
  assert.equal(row.role, "user");
  assert.equal(row.senderId, "user");
  assert.equal(row.content, "ping");
  assert.deepEqual(row.attachments, [chip]);
  assert.equal(isOptimisticId(row.id), true);
  assert.ok(row.id.startsWith(OPTIMISTIC_ID_PREFIX));
  assert.equal(isUserSender(row.senderId, row.role), true);

  const next = insertOptimistic(prior, row);
  assert.equal(next.length, 2);
  assert.equal(next[1], row);
  assert.equal(next[0], prior[0]);
});

test("success reconciles the optimistic bubble with the server turn (no duplicate)", () => {
  const optimistic = user("local-1", "ping");
  const local = [user("u0", "earlier"), optimistic, left("stream", "pong")];
  const listed = [user("u0", "earlier"), user("srv-u", "ping"), left("a1", "pong")];

  const next = reconcileOptimistic(local, optimistic.id, listed);
  assert.deepEqual(next, listed);
  assert.equal(
    next.filter((m) => isUserSender(m.senderId, m.role) && m.content === "ping")
      .length,
    1,
  );
  assert.equal(next.some((m) => isOptimisticId(m.id)), false);

  const absorbed = absorbServerUser(
    [user("u0", "earlier"), optimistic],
    user("srv-u", "ping"),
  );
  assert.equal(absorbed.length, 2);
  assert.equal(absorbed[1]?.id, "srv-u");
  assert.equal(absorbed[1]?.content, "ping");
  assert.equal(absorbed.some((m) => m.id === "local-1"), false);
  assert.equal(next[1]?.id, "srv-u");
});

test("failure removes the optimistic bubble, restores composer text, Couldn’t send.", () => {
  const optimistic = user("local-1", "ping");
  const local = [left("a1", "hello"), optimistic];
  const failed = failOptimistic(local, optimistic.id);
  assert.deepEqual(failed.messages, [left("a1", "hello")]);
  assert.equal(failed.hint, COULDNT_SEND);
  assert.equal(COULDNT_SEND, "Couldn't send.");
  assert.equal(composerSendHint(COULDNT_SEND), COULDNT_SEND);
  assert.equal(composerSendHint("Max 10MB."), null);
  assert.equal(isHttpSendFailure(400), true);
  assert.equal(isHttpSendFailure(422), true);
  assert.equal(isHttpSendFailure(500), true);
  assert.equal(isHttpSendFailure(200), false);
  assert.equal(isHttpSendFailure(0), false);
});

test("desktop wires insert, reconcile, failure restore, muted 12px Couldn’t send", () => {
  assert.match(app, /from "\.\/optimisticSend"/);
  assert.match(app, /optimisticUserMessage\(/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /reconcileOptimistic\(/);
  assert.match(app, /absorbServerUser\(/);
  assert.match(app, /failOptimistic\(/);
  assert.match(app, /COULDNT_SEND/);
  assert.match(app, /composerSendHint/);
  assert.match(app, /onSend\(\) \{[\s\S]*optimisticUser: true/);
  assert.match(app, /onSend\(\) \{[\s\S]*attachments: chips/);
  assert.match(app, /onSend\(\) \{[\s\S]*holdBusy: true/);
  assert.match(app, /onSend\(\) \{[\s\S]*inFlight\.current = true/);
  assert.match(app, /onSend\(\) \{[\s\S]*focusComposer\(\)/);
  assert.match(app, /const fieldDisabled = !credsReady \|\| takeoverOpen/);
  assert.match(app, /<textarea[\s\S]*disabled=\{fieldDisabled\}/);
  assert.match(app, /if \(content\) setDraft\(content\)/);
  assert.match(app, /restoreAttachments/);
  assert.match(app, /isHttpSendFailure/);
  assert.match(app, /shouldBlockSend/);
  assert.match(app, /sendBlocked/);
  assert.match(app, /attachInFlight/);
  assert.match(app, /statusHint/);
  assert.match(app, /className="composer-hint"/);
  assert.match(app, /role="status"/);
  assert.doesNotMatch(app, /onRegenerate\(\) \{[\s\S]*optimisticUser: true/);
  assert.match(app, /onRegenerate\(\) \{[\s\S]*regeneratePostBody\(\)/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(sendSrc, /computerPane\.ts/);
  assert.doesNotMatch(sendSrc, /\/v1\/chats\//);

  const hint = block(".composer-hint");
  assert.match(hint, /font-size:\s*12px/);
  assert.match(hint, /color:\s*var\(--text-muted\)/);
});

test("OpenAPI stays 0.18.0; v0.49 is documented; no new HTTP", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.49/);
  assert.match(protocol, /v0\.49/);
  assert.match(runtimeOpenapi, /v0\.49/);
  assert.doesNotMatch(sendSrc, /\/v1\/optimistic/);
  assert.doesNotMatch(app, /\/v1\/optimistic/);
});

test("attachments upload first; second Send is blocked while busy or attaching", () => {
  assert.equal(shouldBlockSend({ busy: true, attaching: false }), true);
  assert.equal(shouldBlockSend({ busy: false, attaching: true }), true);
  assert.equal(shouldBlockSend({ busy: false, attaching: false }), false);

  const addStart = app.indexOf("async function addPendingFile");
  const addBody = app.slice(addStart, app.indexOf("async function onPickFile", addStart));
  const uploadAt = addBody.indexOf("uploadAttachment");
  const pendingAt = addBody.indexOf("setPendingAttachments");
  assert.ok(uploadAt >= 0 && pendingAt > uploadAt);

  const sendStart = app.indexOf("async function onSend()");
  const sendBody = app.slice(sendStart, app.indexOf("async function answerWidget", sendStart));
  assert.doesNotMatch(sendBody, /uploadAttachment/);
  assert.match(sendBody, /attachmentIds: chips\.map/);
  assert.match(sendBody, /sendBlocked/);
});
