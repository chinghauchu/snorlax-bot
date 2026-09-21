// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { composerEnterSends } from "./composerKeys.ts";
import {
  composerEditableWhileGenerating,
  enterSends,
  sendMutedWhileGenerating,
  sendReenabled,
} from "./sendMuted.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const mutedSrc = readFileSync(join(here, "sendMuted.ts"), "utf8");
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

test("Send is muted and disabled while generating", () => {
  assert.equal(sendMutedWhileGenerating(true), true);
  assert.equal(sendMutedWhileGenerating(false), false);

  const sendStart = app.indexOf('aria-label="Send"');
  assert.ok(sendStart > 0);
  const sendBlock = app.slice(sendStart - 80, sendStart + 280);
  assert.match(sendBlock, /className="send"/);
  assert.match(sendBlock, /sendMutedWhileGenerating\(busy\)/);
  assert.match(sendBlock, /disabled=\{/);

  const muted = block(".send:disabled");
  assert.match(muted, /opacity:\s*0\.35/);
});

test("Enter does not send while generating", () => {
  const enter = { key: "Enter", shiftKey: false, isComposing: false };
  assert.equal(enterSends(enter, true), false);
  assert.equal(enterSends(enter, false), true);
  assert.equal(composerEnterSends(enter), true);
  assert.equal(
    enterSends({ key: "Enter", shiftKey: true, isComposing: false }, false),
    false,
  );
  assert.equal(
    enterSends({ key: "Enter", shiftKey: false, isComposing: true }, false),
    false,
  );

  const keyStart = app.indexOf("function onComposerKey");
  const keyBody = app.slice(
    keyStart,
    app.indexOf("function insertDraftAtCaret", keyStart),
  );
  assert.match(keyBody, /sendMutedWhileGenerating\(busy\)/);
  assert.match(keyBody, /composerEnterSends\(event\)/);
  assert.match(keyBody, /onSend\(\)/);
  const muteAt = keyBody.indexOf("sendMutedWhileGenerating(busy)");
  const sendAt = keyBody.indexOf("void onSend()");
  assert.ok(muteAt >= 0 && sendAt > muteAt);
});

test("composer text stays editable while generating", () => {
  assert.equal(
    composerEditableWhileGenerating({ fieldDisabled: false }),
    true,
  );
  assert.equal(
    composerEditableWhileGenerating({ fieldDisabled: true }),
    false,
  );
  assert.equal(
    composerEditableWhileGenerating({
      fieldDisabled: false,
      takeoverOpen: true,
    }),
    false,
  );

  assert.match(app, /const fieldDisabled = !credsReady \|\| takeoverOpen/);
  assert.match(app, /<textarea[\s\S]*disabled=\{fieldDisabled\}/);
  const ta = app.slice(app.indexOf("<textarea"), app.indexOf("</textarea>"));
  assert.doesNotMatch(ta, /disabled=\{composerDisabled\}/);
  assert.doesNotMatch(ta, /disabled=\{busy\}/);
  assert.doesNotMatch(ta, /readOnly=\{busy\}/);
});

test("Send re-enables on complete / Stop / error / empty", () => {
  assert.equal(sendReenabled(false), true);
  assert.equal(sendReenabled(true), false);
  assert.equal(sendMutedWhileGenerating(false), false);

  const submitStart = app.indexOf("async function submitTurn");
  const submitBody = app.slice(
    submitStart,
    app.indexOf("function onStopGenerating", submitStart),
  );
  assert.match(submitBody, /finally \{[\s\S]*setBusy\(false\)/);
  assert.match(submitBody, /isAbortError/);
  assert.match(submitBody, /isHttpSendFailure/);
  assert.match(submitBody, /isEmptyAssistantReply|setBusy\(false\)/);

  const stopFn = app.slice(
    app.indexOf("function onStopGenerating"),
    app.indexOf("useEffect", app.indexOf("function onStopGenerating")),
  );
  assert.match(stopFn, /abortRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(stopFn, /setBusy\(true\)/);
});

test("OpenAPI stays 0.18.0; v0.55 is documented; no new HTTP", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.55/);
  assert.match(protocol, /v0\.55/);
  assert.match(runtimeOpenapi, /v0\.55/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(mutedSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(mutedSrc, /\/v1\/chats\//);
  assert.doesNotMatch(mutedSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.54 intact stack stays wired; Stop + Esc unchanged", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop\(busy\)/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /className="stop-generating"/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /className="assistant-bubbles"/);
  assert.match(app, /isComposerComposing\(event\)/);
  assert.match(app, /pendingWidget/);
  assert.match(app, /pendingApprove/);
  assert.match(app, /pendingConnect/);
});
