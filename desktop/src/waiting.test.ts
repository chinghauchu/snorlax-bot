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
  hasAssistantToken,
  isEmptyAssistantReply,
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
      hasFirstToken: false,
      hasLiveTool: false,
    }),
    true,
    "busy after Send with no assistant yet",
  );
  assert.equal(
    showWaitingLine({
      busy: false,
      hasFirstToken: false,
      hasLiveTool: false,
    }),
    false,
    "idle / Stop hides waiting",
  );
});

test("first token swaps to the growing LEFT bubble", () => {
  assert.equal(
    showWaitingLine({
      busy: true,
      hasFirstToken: true,
      hasLiveTool: false,
    }),
    false,
    "message.delta / first content takes over",
  );
  assert.equal(hasAssistantToken({ content: "Hi" }), true);
  assert.equal(hasAssistantToken({ content: "" }), false);
  assert.equal(hasAssistantToken({ content: "", attachments: [{}] }), true);
});

test("a tool line also hides waiting even if busy stays true", () => {
  assert.equal(
    showWaitingLine({
      busy: true,
      hasFirstToken: false,
      hasLiveTool: true,
    }),
    false,
    "tool.start / kind=tool takes over",
  );
});

test("Stop / error / empty reply dismiss the dots", () => {
  assert.equal(
    showWaitingLine({
      busy: false,
      hasFirstToken: false,
      hasLiveTool: false,
    }),
    false,
    "Stop clears busy",
  );
  assert.equal(
    showWaitingLine({
      busy: true,
      hasFirstToken: false,
      hasLiveTool: false,
      hasError: true,
    }),
    false,
    "error dismisses dots",
  );
  assert.equal(
    isEmptyAssistantReply({
      role: "assistant",
      kind: "message",
      content: "",
      attachments: [],
    }),
    true,
  );
  assert.equal(
    isEmptyAssistantReply({
      role: "assistant",
      kind: "message",
      content: "ok",
    }),
    false,
  );
  assert.equal(
    isEmptyAssistantReply({
      role: "user",
      kind: "message",
      content: "",
    }),
    false,
  );
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
      hasFirstToken: false,
      hasLiveTool: false,
    }),
    true,
  );
});

test("desktop chrome is LEFT 12px muted pulsing ··· — not a tool line, not a bubble", () => {
  assert.equal(WAITING_DOT, "·");
  assert.equal(WAITING_LABEL, "···");
  assert.match(app, /from "\.\/waiting"/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /WAITING_LABEL/);
  assert.match(app, /className="waiting"/);
  assert.match(app, /className="waiting-dots"/);
  assert.doesNotMatch(app, /WAITING_WORD/);
  assert.doesNotMatch(app, /className="waiting-word"/);
  assert.doesNotMatch(css, /\.waiting-word\s*\{/);
  assert.doesNotMatch(app, /from "\.\/thinking"/);
  assert.doesNotMatch(app, /className="thinking"/);
  assert.doesNotMatch(css, /\.thinking\s*\{/);
  assert.match(css, /\.waiting\s*\{/);
  assert.match(css, /@keyframes\s+waiting-dot/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);

  const overlayStart = app.indexOf("{showWaiting ? (");
  assert.ok(overlayStart >= 0, "missing showWaiting render");
  const render = app.slice(overlayStart, overlayStart + 1400);
  assert.match(render, /aria-label=\{WAITING_LABEL\}/);
  assert.match(render, /className="waiting"/);
  assert.doesNotMatch(render, /className="bubble/);
  assert.doesNotMatch(render, /tool-trace/);
  assert.doesNotMatch(render, /waiting-word/);
  assert.match(app, /isEmptyAssistantReply/);
  assert.match(app, /if \(!delta\) return prev;/);
  assert.match(app, /hasError: Boolean\(composerError\)/);
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
  assert.match(css, /@keyframes\s+waiting-dot/);
  assert.match(
    css,
    /prefers-reduced-motion:\s*reduce[\s\S]*\.waiting-dots span \{[\s\S]*animation:\s*none/,
  );
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
