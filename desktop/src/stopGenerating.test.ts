// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  STOP_GENERATING_LABEL,
  composerUsableAfterStop,
  isAbortError,
  keepPartialOnStop,
  shouldOfferStop,
  shouldRefetchAfterStop,
  shouldRestartAfterStop,
} from "./stopGenerating.ts";
import { shouldBlockSend } from "./optimisticSend.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const api = readFileSync(join(here, "api.ts"), "utf8");
const stopSrc = readFileSync(join(here, "stopGenerating.ts"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

function user(id: string, content: string) {
  return { id, content, role: "user" as const, senderId: "user" };
}

function left(id: string, content: string) {
  return {
    id,
    content,
    role: "assistant" as const,
    senderId: "snorlax-bot",
  };
}

test("Stop mid-stream keeps the partial LEFT bubble and the user-RIGHT", () => {
  const partial = [
    user("local-1", "ping"),
    left("a-stream", "Hello, this is only half"),
  ];
  const kept = keepPartialOnStop(partial);
  assert.equal(kept, partial);
  assert.equal(kept[1]?.content, "Hello, this is only half");
  assert.equal(kept[0]?.id, "local-1");
  assert.equal(kept.length, 2);

  assert.equal(STOP_GENERATING_LABEL, "Stop generating");
  assert.equal(shouldOfferStop(true), true);
  assert.equal(shouldOfferStop(false), false);
  assert.equal(shouldRefetchAfterStop(), false);
  assert.equal(shouldRestartAfterStop(), false);
});

test("after Stop, composer is usable again and Send is not blocked", () => {
  const busyAfterStop = false;
  assert.equal(composerUsableAfterStop(busyAfterStop), true);
  assert.equal(shouldBlockSend({ busy: busyAfterStop, attaching: false }), false);
  assert.equal(composerUsableAfterStop(true), false);
});

test("AbortError is the client abort; not a send failure", () => {
  const abort = new DOMException("The operation was aborted.", "AbortError");
  assert.equal(isAbortError(abort), true);
  const named = new Error("stopped");
  named.name = "AbortError";
  assert.equal(isAbortError(named), true);
  assert.equal(isAbortError(new Error("network down")), false);
  assert.equal(isAbortError(null), false);
  assert.equal(isAbortError({ name: "AbortError" }), true);
  assert.equal(isAbortError({ name: "TypeError" }), false);
});

test("desktop wires AbortController, keeps partial, re-enables composer", () => {
  assert.match(app, /from "\.\/stopGenerating"/);
  assert.match(app, /STOP_GENERATING_LABEL/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /isAbortError/);
  assert.match(app, /shouldRefetchAfterStop/);
  assert.match(app, /keepPartialOnStop/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /abortRef\.current\?\.abort\(\)/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /aria-label=\{STOP_GENERATING_LABEL\}/);
  assert.match(app, /StopGeneratingIcon/);
  assert.match(api, /signal\?: AbortSignal/);
  assert.match(api, /signal,/);

  const submitStart = app.indexOf("async function submitTurn");
  const submitBody = app.slice(
    submitStart,
    app.indexOf("async function onSend()", submitStart),
  );
  assert.match(submitBody, /new AbortController\(\)/);
  assert.match(submitBody, /abortRef\.current = ac/);
  assert.match(submitBody, /extra,\s*ac\.signal/);
  assert.match(submitBody, /if \(isAbortError\(err\)/);
  assert.match(submitBody, /keepPartialOnStop/);
  assert.match(submitBody, /shouldRefetchAfterStop/);
  const abortIf = submitBody.indexOf("if (isAbortError(err)");
  const abortBlock = submitBody.slice(
    abortIf,
    submitBody.indexOf("if (userMsg)", abortIf),
  );
  assert.doesNotMatch(abortBlock, /failOptimistic/);
  assert.doesNotMatch(abortBlock, /listMessages/);
  assert.doesNotMatch(abortBlock, /COULDNT_SEND/);

  assert.match(app, /function onStopGenerating/);
  const stopFn = app.slice(
    app.indexOf("function onStopGenerating()"),
    app.indexOf("async function onSend()"),
  );
  assert.match(stopFn, /abortRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(stopFn, /onSend\(/);
  assert.doesNotMatch(stopFn, /submitTurn/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(stopSrc, /computerPane\.ts/);
  assert.doesNotMatch(stopSrc, /\/v1\/chats\//);
  assert.doesNotMatch(stopSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
});

test("OpenAPI stays 0.18.0; v0.50 is documented; no cancel route", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.50/);
  assert.match(protocol, /v0\.50/);
  assert.match(runtimeOpenapi, /v0\.50/);
  assert.doesNotMatch(openapi, /\/v1\/.*cancel/);
  assert.doesNotMatch(protocol, /\/v1\/.*cancel/);
  assert.doesNotMatch(runtimeOpenapi, /\/v1\/.*cancel/);
});

test("v0.47 stick, v0.48 multi-bubbles, v0.49 optimistic Send stay wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldBlockSend/);
});
