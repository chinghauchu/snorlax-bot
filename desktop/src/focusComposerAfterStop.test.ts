// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  escapeStopsGenerating,
  shouldFocusComposerAfterAbort,
  shouldFocusComposerOnSettle,
  shouldOfferStop,
} from "./stopGenerating.ts";
import { sendReenabled } from "./sendMuted.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
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

function sliceFn(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end > start ? src.slice(start, end) : src.slice(start);
}

test("Stop abort returns focus to the composer immediately", () => {
  assert.equal(shouldFocusComposerAfterAbort(), true);
  assert.equal(shouldFocusComposerAfterAbort(true), true);

  const stopFn = sliceFn(
    app,
    "function onStopGenerating()",
    "useEffect(() => {",
  );
  assert.match(stopFn, /abortRef\.current\?\.abort\(\)/);
  assert.match(stopFn, /shouldFocusComposerAfterAbort\(\)/);
  assert.match(stopFn, /focusComposer\(\)/);
  const abortAt = stopFn.indexOf("abortRef.current?.abort()");
  const focusGate = stopFn.indexOf("shouldFocusComposerAfterAbort()");
  const focusCall = stopFn.indexOf("focusComposer()");
  assert.ok(abortAt >= 0 && focusGate > abortAt && focusCall > focusGate);

  assert.match(app, /shouldOfferStop\(busy\)/);
  assert.match(app, /className="stop-generating"/);
  assert.match(app, /onClick=\{onStopGenerating\}/);
});

test("Esc abort returns focus to the composer immediately", () => {
  assert.equal(escapeStopsGenerating({ busy: true }), true);
  assert.equal(shouldFocusComposerAfterAbort(), true);

  const escStart = app.indexOf("escapeStopsGenerating({");
  assert.ok(escStart >= 0, "missing escapeStopsGenerating wiring");
  const escBlock = app.slice(escStart - 400, escStart + 700);
  assert.match(escBlock, /event\.key !== "Escape"/);
  assert.match(escBlock, /onStopGenerating\(\)/);
  assert.doesNotMatch(escBlock, /submitTurn/);
  assert.match(escBlock, /isComposerComposing\(event\)/);
  assert.match(escBlock, /pendingWidget/);
  assert.match(escBlock, /pendingApprove/);
  assert.match(escBlock, /pendingConnect/);

  const stopFn = sliceFn(
    app,
    "function onStopGenerating()",
    "useEffect(() => {",
  );
  assert.match(stopFn, /shouldFocusComposerAfterAbort\(\)/);
  assert.match(stopFn, /focusComposer\(\)/);
});

test("complete / error / empty leave composer focus alone", () => {
  assert.equal(shouldFocusComposerOnSettle(), false);

  const submitStart = app.indexOf("async function submitTurn");
  const submitBody = app.slice(
    submitStart,
    app.indexOf("function onStopGenerating()", submitStart),
  );
  const finallyAt = submitBody.lastIndexOf("finally {");
  assert.ok(finallyAt >= 0, "missing submitTurn finally");
  const finallyBlock = submitBody.slice(finallyAt);
  assert.match(finallyBlock, /setBusy\(false\)/);
  assert.match(finallyBlock, /shouldFocusComposerOnSettle\(\)/);
  const settleAt = finallyBlock.indexOf("shouldFocusComposerOnSettle()");
  const focusAt = finallyBlock.indexOf("focusComposer()");
  assert.ok(settleAt >= 0 && focusAt > settleAt);
  assert.doesNotMatch(
    finallyBlock.slice(0, settleAt),
    /focusComposer\(\)/,
  );

  const onSend = sliceFn(app, "async function onSend()", "await submitTurn");
  assert.match(onSend, /focusComposer\(\)/);

  assert.equal(sendReenabled(false), true);
  assert.equal(shouldOfferStop(false), false);
});

test("iOS hardware-keyboard contract: no soft-keyboard force", () => {
  assert.equal(shouldFocusComposerAfterAbort(true), true);
  assert.equal(shouldFocusComposerAfterAbort(false), false);
  assert.match(stopSrc, /hardwareKeyboardAttached = true/);
  assert.match(stopSrc, /do not force the software keyboard/);
  assert.doesNotMatch(app, /shouldFocusComposerAfterAbort\(false\)/);
});

test("Send re-enable timing unchanged; Esc=Stop skips IME and pending cards", () => {
  assert.equal(sendReenabled(true), false);
  assert.equal(sendReenabled(false), true);
  const submitStart = app.indexOf("async function submitTurn");
  const submitBody = app.slice(
    submitStart,
    app.indexOf("function onStopGenerating()", submitStart),
  );
  assert.match(submitBody, /finally \{[\s\S]*setBusy\(false\)/);

  assert.equal(
    escapeStopsGenerating({ busy: true, composing: true }),
    false,
  );
  assert.equal(
    escapeStopsGenerating({ busy: true, pendingWidget: true }),
    false,
  );
  assert.equal(
    escapeStopsGenerating({ busy: true, pendingApprove: true }),
    false,
  );
  assert.equal(
    escapeStopsGenerating({ busy: true, pendingConnect: true }),
    false,
  );
  assert.equal(
    escapeStopsGenerating({
      busy: true,
      composing: false,
      pendingWidget: false,
      pendingApprove: false,
      pendingConnect: false,
    }),
    true,
  );
});

test("OpenAPI stays 0.18.0; v0.59 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.59/);
  assert.match(protocol, /v0\.59/);
  assert.match(runtimeOpenapi, /v0\.59/);
  assert.doesNotMatch(stopSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(stopSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.58 intact stack stays wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /className="waiting"/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /className="streaming-caret"/);
  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /className="assistant-bubbles"/);
  assert.match(app, /sendMutedWhileGenerating/);
  assert.match(app, /from "\.\/compactToolTraces"/);
  assert.match(app, /from "\.\/midStreamPlaintext"/);
  assert.match(app, /from "\.\/waiting"/);
  assert.match(app, /WAITING_DOT/);
});
