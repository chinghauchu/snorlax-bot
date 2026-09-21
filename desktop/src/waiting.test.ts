// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isTranscriptVisible } from "./mentions.ts";
import { shouldOfferStop } from "./stopGenerating.ts";
import {
  WAITING_DOT,
  WAITING_LABEL,
  WAITING_WORD,
  showWaitingLine,
} from "./waiting.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const waitingSrc = readFileSync(join(here, "waiting.ts"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

test("waiting ··· shows after Send until the first token", () => {
  assert.equal(
    showWaitingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: false,
    }),
    true,
    "busy after Send with no assistant yet",
  );
  assert.equal(
    showWaitingLine({
      busy: false,
      hasLiveAssistant: false,
      hasLiveTool: false,
    }),
    false,
    "idle hides waiting",
  );
});

test("waiting ··· hides on the first assistant token", () => {
  assert.equal(
    showWaitingLine({
      busy: true,
      hasLiveAssistant: true,
      hasLiveTool: false,
    }),
    false,
    "message.delta / first content takes over",
  );
  assert.equal(
    showWaitingLine({
      busy: true,
      hasLiveAssistant: true,
      hasLiveTool: true,
    }),
    false,
  );
});

test("a tool line also hides waiting even if busy stays true", () => {
  assert.equal(
    showWaitingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: true,
    }),
    false,
    "tool.start / kind=tool takes over",
  );
});

test("Stop stays available while waiting (v0.50)", () => {
  const waiting = showWaitingLine({
    busy: true,
    hasLiveAssistant: false,
    hasLiveTool: false,
  });
  assert.equal(waiting, true);
  assert.equal(shouldOfferStop(true), true);
  assert.equal(shouldOfferStop(false), false);
});

test("1:1 isolation still hides a peer agent from A's transcript", () => {
  const alice = { id: "alice", kind: "agent" };
  assert.equal(isTranscriptVisible({ senderId: "bob" }, alice), false);
  assert.equal(isTranscriptVisible({ senderId: "alice" }, alice), true);
  assert.equal(
    showWaitingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: false,
    }),
    true,
  );
});

test("desktop chrome is waiting ··· with sequential dots, not Thinking", () => {
  assert.equal(WAITING_WORD, "waiting");
  assert.equal(WAITING_DOT, "·");
  assert.equal(WAITING_LABEL, "waiting ···");
  assert.match(app, /from "\.\/waiting"/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /WAITING_LABEL/);
  assert.match(app, /WAITING_WORD/);
  assert.match(app, /className="waiting"/);
  assert.match(app, /className="waiting-word"/);
  assert.match(app, /className="waiting-dots"/);
  assert.doesNotMatch(app, /from "\.\/thinking"/);
  assert.doesNotMatch(app, /THINKING_LABEL/);
  assert.doesNotMatch(app, /showThinkingLine/);
  assert.doesNotMatch(app, /className="thinking"/);
  assert.doesNotMatch(css, /\.thinking\s*\{/);
  assert.match(css, /\.waiting\s*\{/);
  assert.match(css, /\.waiting-word\s*\{/);
  assert.match(css, /\.waiting-dots/);
  assert.match(css, /@keyframes\s+waiting-dot/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("waiting line is 12px muted; dots pulse; reduced-motion is static", () => {
  function block(selector: string): string {
    const needle = `\n${selector} {`;
    const idx = css.indexOf(needle);
    assert.ok(idx >= 0, `missing ${selector}`);
    const start = css.indexOf("{", idx);
    const end = css.indexOf("}", start);
    return css.slice(start, end + 1);
  }

  const waiting = block(".waiting");
  assert.match(waiting, /font-size:\s*12px/);
  assert.match(waiting, /color:\s*var\(--text-muted\)/);
  const word = block(".waiting-word");
  assert.match(word, /color:\s*var\(--text-muted\)/);
  assert.match(css, /@keyframes\s+waiting-dot/);
  assert.match(
    css,
    /prefers-reduced-motion:\s*reduce[\s\S]*\.waiting-dots span \{[\s\S]*animation:\s*none/,
  );
});

test("waiting sits after the optimistic user-RIGHT and before the streaming LEFT", () => {
  const overlayStart = app.indexOf("{showWaiting ? (");
  assert.ok(overlayStart >= 0, "missing showWaiting render");
  const render = app.slice(overlayStart, overlayStart + 1200);
  assert.match(render, /aria-label=\{WAITING_LABEL\}/);
  assert.match(render, /className="waiting"/);
  assert.match(render, /\{WAITING_WORD\}/);
  assert.match(render, /WAITING_DOT/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /shouldOfferStop\(busy\)/);
});

test("OpenAPI stays 0.18.0; v0.51 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.51/);
  assert.match(protocol, /v0\.51/);
  assert.match(runtimeOpenapi, /v0\.51/);
  assert.doesNotMatch(waitingSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(waitingSrc, /\/v1\/chats\//);
  assert.doesNotMatch(app, /\/v1\/chats\//);
});

test("v0.47 stick, v0.48 multi-bubbles, v0.49 optimistic Send, v0.50 Stop stay wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /onStopGenerating/);
});
