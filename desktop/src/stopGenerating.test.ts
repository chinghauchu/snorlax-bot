// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  STOP_LABEL,
  composerUsableAfterStop,
  escapeStopsGenerating,
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
const css = readFileSync(join(here, "styles.css"), "utf8");
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

  assert.equal(STOP_LABEL, "Stop");
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
  assert.match(app, /STOP_LABEL/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /isAbortError/);
  assert.match(app, /shouldRefetchAfterStop/);
  assert.match(app, /keepPartialOnStop/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /abortRef\.current\?\.abort\(\)/);
  assert.match(app, /onStopGenerating/);
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
  assert.match(stopFn, /focusComposer\(\)/);
  assert.doesNotMatch(stopFn, /onSend\(/);
  assert.doesNotMatch(stopFn, /submitTurn/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(stopSrc, /computerPane\.ts/);
  assert.doesNotMatch(stopSrc, /\/v1\/chats\//);
  assert.doesNotMatch(stopSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
});

test("12px muted Stop sits at the bottom of the chat column, above Jump to latest", () => {
  function block(selector: string): string {
    const needle = `\n${selector} {`;
    const idx = css.indexOf(needle);
    assert.ok(idx >= 0, `missing ${selector}`);
    const start = css.indexOf("{", idx);
    const end = css.indexOf("}", start);
    return css.slice(start, end + 1);
  }

  const chips = block(".transcript-chips");
  assert.match(chips, /position:\s*absolute/);
  assert.match(chips, /bottom:\s*12px/);
  assert.match(chips, /flex-direction:\s*column/);
  const stopChip = block(".stop-generating");
  assert.match(stopChip, /font-size:\s*12px/);
  assert.match(stopChip, /color:\s*var\(--text-muted\)/);

  const overlayStart = app.indexOf('className="transcript-chips"');
  const overlayEnd = app.indexOf('ref={composerRootRef}', overlayStart);
  const overlay = app.slice(overlayStart, overlayEnd);
  const stopAt = overlay.indexOf("className=\"stop-generating\"");
  const jumpAt = overlay.indexOf("className=\"jump-latest\"");
  assert.ok(stopAt >= 0 && jumpAt > stopAt);
  assert.match(overlay, /shouldOfferStop\(busy\)/);
  assert.match(overlay, /\{STOP_LABEL\}/);
  assert.equal(shouldOfferStop(false), false);
  assert.doesNotMatch(app, /StopGeneratingIcon/);
  assert.doesNotMatch(app, /className="send stop-generating"/);
  assert.match(app, /aria-label="Send"/);
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

test("Esc aborts mid-stream like Stop", () => {
  assert.equal(escapeStopsGenerating({ busy: true }), true);
  assert.equal(escapeStopsGenerating({ busy: false }), false);
  assert.equal(shouldOfferStop(true), true);
  assert.equal(
    escapeStopsGenerating({ busy: true }),
    shouldOfferStop(true),
  );

  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /window\.addEventListener\("keydown", onKey\)/);
  const escStart = app.indexOf("escapeStopsGenerating({");
  assert.ok(escStart >= 0, "missing escapeStopsGenerating wiring");
  const escBlock = app.slice(escStart - 400, escStart + 700);
  assert.match(escBlock, /event\.key !== "Escape"/);
  assert.match(escBlock, /onStopGenerating\(\)/);
  assert.match(escBlock, /preventDefault/);
  assert.doesNotMatch(escBlock, /submitTurn/);
  assert.doesNotMatch(escBlock, /failOptimistic/);
  const onStop = app.slice(
    app.indexOf("function onStopGenerating()"),
    app.indexOf("useEffect(() => {", app.indexOf("function onStopGenerating()")),
  );
  assert.match(onStop, /abortRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(app, /EscStopIcon/);
  assert.doesNotMatch(app, /aria-label="Stop generating"/);
});

test("Esc is ignored during IME composing", () => {
  assert.equal(
    escapeStopsGenerating({ busy: true, composing: true }),
    false,
  );
  assert.equal(
    escapeStopsGenerating({ busy: true, composing: false }),
    true,
  );
  assert.match(app, /isComposerComposing\(event\)/);
  const escCall = app.slice(
    app.indexOf("escapeStopsGenerating({"),
    app.indexOf("})", app.indexOf("escapeStopsGenerating({")) + 2,
  );
  assert.match(escCall, /composing:\s*isComposerComposing\(event\)/);
});

test("Esc is ignored when a widget / approve / connect card is pending", () => {
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
      pendingWidget: false,
      pendingApprove: false,
      pendingConnect: false,
    }),
    true,
  );
  const escCall = app.slice(
    app.indexOf("escapeStopsGenerating({"),
    app.indexOf("})", app.indexOf("escapeStopsGenerating({")) + 2,
  );
  assert.match(escCall, /pendingWidget:\s*messages\.some\(isPendingWidget\)/);
  assert.match(escCall, /pendingApprove:\s*messages\.some\(isPendingApprove\)/);
  assert.match(escCall, /pendingConnect:\s*messages\.some\(isPendingConnect\)/);
  assert.match(app, /from "\.\/widget"/);
  assert.match(app, /isPendingWidget/);
  assert.match(app, /isPendingApprove/);
  assert.match(app, /isPendingConnect/);
});

test("OpenAPI stays 0.18.0; v0.53 Esc=Stop is documented; no cancel route", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.53/);
  assert.match(protocol, /v0\.53/);
  assert.match(runtimeOpenapi, /v0\.53/);
  assert.doesNotMatch(openapi, /\/v1\/.*cancel/);
  assert.doesNotMatch(protocol, /\/v1\/.*cancel/);
  assert.doesNotMatch(runtimeOpenapi, /\/v1\/.*cancel/);
  assert.doesNotMatch(stopSrc, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.52 fluency stack stays wired with Esc=Stop", () => {
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
});
