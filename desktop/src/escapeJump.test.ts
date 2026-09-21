// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  escapeStopsGenerating,
  shouldFocusComposerAfterAbort,
} from "./stopGenerating.ts";
import { escapeJumpsToLatest } from "./stickToBottom.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const stickSrc = readFileSync(join(here, "stickToBottom.ts"), "utf8");
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

test("Esc + Jump chip visible + idle activates Jump", () => {
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false }),
    true,
  );
  assert.equal(
    escapeJumpsToLatest({ showJump: false, busy: false }),
    false,
  );

  assert.match(app, /escapeJumpsToLatest/);
  assert.match(app, /escapeStopsGenerating/);
  const jumpStart = app.indexOf("escapeJumpsToLatest({");
  assert.ok(jumpStart >= 0, "missing escapeJumpsToLatest wiring");
  const jumpBlock = app.slice(
    jumpStart,
    app.indexOf("async function onSend()", jumpStart),
  );
  assert.match(jumpBlock, /onJumpLatest\(\)/);
  assert.match(jumpBlock, /preventDefault/);
  assert.doesNotMatch(jumpBlock, /onStopGenerating\(\)/);
  assert.doesNotMatch(jumpBlock, /submitTurn/);
  const escHandler = app.slice(
    app.lastIndexOf("useEffect(() => {", jumpStart),
    jumpStart,
  );
  assert.match(escHandler, /event\.key !== "Escape"/);

  const onJump = sliceFn(app, "const onJumpLatest = useCallback", "useLayoutEffect");
  assert.match(onJump, /onJumpToLatest\(\)/);
  assert.match(onJump, /scrollTop = el\.scrollHeight/);
});

test("Esc + generating is Stop, not Jump", () => {
  assert.equal(escapeStopsGenerating({ busy: true }), true);
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: true }),
    false,
  );
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false }),
    true,
  );

  const escStart = app.indexOf("escapeStopsGenerating({");
  assert.ok(escStart >= 0, "missing escapeStopsGenerating wiring");
  const jumpStart = app.indexOf("escapeJumpsToLatest({");
  assert.ok(jumpStart > escStart, "Stop must be checked before Jump");

  const stopBranch = app.slice(escStart, jumpStart);
  assert.match(stopBranch, /onStopGenerating\(\)/);
  assert.match(stopBranch, /return;/);
  assert.doesNotMatch(stopBranch, /onJumpLatest\(\)/);

  const stopFn = sliceFn(
    app,
    "function onStopGenerating()",
    "useEffect(() => {",
  );
  assert.match(stopFn, /abortRef\.current\?\.abort\(\)/);
  assert.match(stopFn, /shouldFocusComposerAfterAbort\(\)/);
  assert.match(stopFn, /focusComposer\(\)/);
  assert.equal(shouldFocusComposerAfterAbort(), true);
});

test("Esc Jump skips IME composing and pending widget/approve/connect", () => {
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false, composing: true }),
    false,
  );
  assert.equal(
    escapeJumpsToLatest({
      showJump: true,
      busy: false,
      composing: false,
    }),
    true,
  );
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false, pendingWidget: true }),
    false,
  );
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false, pendingApprove: true }),
    false,
  );
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false, pendingConnect: true }),
    false,
  );
  assert.equal(
    escapeJumpsToLatest({
      showJump: true,
      busy: false,
      composing: false,
      pendingWidget: false,
      pendingApprove: false,
      pendingConnect: false,
    }),
    true,
  );

  const jumpCall = app.slice(
    app.indexOf("escapeJumpsToLatest({"),
    app.indexOf("})", app.indexOf("escapeJumpsToLatest({")) + 2,
  );
  assert.match(jumpCall, /composing:\s*isComposerComposing\(event\)/);
  assert.match(jumpCall, /pendingWidget:\s*messages\.some\(isPendingWidget\)/);
  assert.match(jumpCall, /pendingApprove:\s*messages\.some\(isPendingApprove\)/);
  assert.match(jumpCall, /pendingConnect:\s*messages\.some\(isPendingConnect\)/);

  assert.equal(
    escapeStopsGenerating({ busy: true, composing: true }),
    false,
  );
  assert.equal(
    escapeStopsGenerating({ busy: true, pendingWidget: true }),
    false,
  );
});

test("OpenAPI stays 0.18.0; v0.60 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.60/);
  assert.match(protocol, /v0\.60/);
  assert.match(runtimeOpenapi, /v0\.60/);
  assert.doesNotMatch(stickSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(stickSrc, /computerPane\.ts/);
  assert.doesNotMatch(stopSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.59 intact stack stays wired", () => {
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
  assert.match(app, /className="jump-latest"/);
  assert.match(app, /onClick=\{onJumpLatest\}/);
});
