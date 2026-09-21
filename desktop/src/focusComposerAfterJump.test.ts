// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  shouldFocusComposerAfterAbort,
  shouldFocusComposerOnSettle,
} from "./stopGenerating.ts";
import { escapeJumpsToLatest } from "./stickToBottom.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const stopSrc = readFileSync(join(here, "stopGenerating.ts"), "utf8");
const stickSrc = readFileSync(join(here, "stickToBottom.ts"), "utf8");
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

test("chip click Jump returns focus to the composer", () => {
  assert.equal(shouldFocusComposerAfterAbort(), true);

  const onJump = sliceFn(
    app,
    "const onJumpLatest = useCallback",
    "useLayoutEffect",
  );
  assert.match(onJump, /onJumpToLatest\(\)/);
  assert.match(onJump, /scrollTop = el\.scrollHeight/);
  assert.match(onJump, /shouldFocusComposerAfterAbort\(\)/);
  assert.match(onJump, /focusComposer\(\)/);
  const jumpAt = onJump.indexOf("onJumpToLatest()");
  const scrollAt = onJump.indexOf("scrollTop = el.scrollHeight");
  const focusGate = onJump.indexOf("shouldFocusComposerAfterAbort()");
  const focusCall = onJump.indexOf("focusComposer()");
  assert.ok(
    jumpAt >= 0 &&
      scrollAt > jumpAt &&
      focusGate > scrollAt &&
      focusCall > focusGate,
  );

  assert.match(app, /className="jump-latest"/);
  assert.match(app, /onClick=\{onJumpLatest\}/);
});

test("Esc=Jump returns focus to the composer after Jump completes", () => {
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false }),
    true,
  );
  assert.equal(shouldFocusComposerAfterAbort(), true);

  const jumpStart = app.indexOf("escapeJumpsToLatest({");
  assert.ok(jumpStart >= 0, "missing escapeJumpsToLatest wiring");
  const jumpBlock = app.slice(jumpStart, jumpStart + 500);
  assert.match(jumpBlock, /onJumpLatest\(\)/);
  assert.match(jumpBlock, /preventDefault/);
  assert.doesNotMatch(jumpBlock, /onStopGenerating\(\)/);

  const onJump = sliceFn(
    app,
    "const onJumpLatest = useCallback",
    "useLayoutEffect",
  );
  assert.match(onJump, /shouldFocusComposerAfterAbort\(\)/);
  assert.match(onJump, /focusComposer\(\)/);

  const stopStart = app.indexOf("escapeStopsGenerating({");
  assert.ok(stopStart >= 0 && jumpStart > stopStart);
  const stopBranch = app.slice(stopStart, jumpStart);
  assert.match(stopBranch, /onStopGenerating\(\)/);
  assert.match(stopBranch, /return;/);
  assert.doesNotMatch(stopBranch, /onJumpLatest\(\)/);
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
});

test("iOS hardware-keyboard contract: no soft-keyboard force", () => {
  assert.equal(shouldFocusComposerAfterAbort(true), true);
  assert.equal(shouldFocusComposerAfterAbort(false), false);
  assert.match(stopSrc, /hardwareKeyboardAttached = true/);
  assert.match(stopSrc, /do not force the software keyboard/);
  assert.match(stopSrc, /Jump to latest/);
  assert.doesNotMatch(app, /shouldFocusComposerAfterAbort\(false\)/);
  const onJump = sliceFn(
    app,
    "const onJumpLatest = useCallback",
    "useLayoutEffect",
  );
  assert.match(onJump, /shouldFocusComposerAfterAbort\(\)/);
  assert.doesNotMatch(onJump, /shouldFocusComposerAfterAbort\(false\)/);
});

test("OpenAPI stays 0.18.0; v0.62 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.62/);
  assert.match(protocol, /v0\.62/);
  assert.match(runtimeOpenapi, /v0\.62/);
  assert.doesNotMatch(stickSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(stickSrc, /computerPane\.ts/);
  assert.doesNotMatch(stopSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.61 intact stack stays wired", () => {
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
  assert.match(app, /shouldFocusComposerAfterAbort/);
  assert.match(app, /escapeJumpsToLatest/);
  assert.match(app, /className="jump-latest"/);
  assert.match(app, /copiedFeedbackLabel/);
});
