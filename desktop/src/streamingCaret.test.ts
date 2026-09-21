// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { showStreamingCaret } from "./streamingCaret.ts";
import { showWaitingLine } from "./waiting.ts";
import { shouldOfferStop } from "./stopGenerating.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const caretSrc = readFileSync(join(here, "streamingCaret.ts"), "utf8");
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

test("caret shows after the first token while the LEFT bubble is in flight", () => {
  assert.equal(
    showStreamingCaret({
      busy: true,
      completed: false,
      hasFirstToken: true,
      kind: "message",
    }),
    true,
    "first token + still streaming",
  );
  assert.equal(
    showStreamingCaret({
      busy: true,
      completed: false,
      hasFirstToken: false,
      kind: "message",
    }),
    false,
    "pre-first-token is waiting ···, not the caret",
  );
});

test("caret hides immediately on complete or Stop", () => {
  assert.equal(
    showStreamingCaret({
      busy: false,
      completed: true,
      hasFirstToken: true,
      kind: "message",
    }),
    false,
    "complete / idle",
  );
  assert.equal(
    showStreamingCaret({
      busy: false,
      completed: false,
      hasFirstToken: true,
      kind: "message",
    }),
    false,
    "Stop clears busy",
  );
  assert.equal(
    showStreamingCaret({
      busy: true,
      completed: true,
      hasFirstToken: true,
      kind: "message",
    }),
    false,
    "completed turn",
  );
  assert.equal(shouldOfferStop(true), true);
  assert.equal(shouldOfferStop(false), false);
});

test("never show waiting ··· and the caret at once", () => {
  const waiting = showWaitingLine({
    busy: true,
    hasFirstToken: false,
    hasLiveTool: false,
  });
  const caretWhileWaiting = showStreamingCaret({
    busy: true,
    completed: false,
    hasFirstToken: false,
    kind: "message",
  });
  assert.equal(waiting, true);
  assert.equal(caretWhileWaiting, false);

  const waitingAfterToken = showWaitingLine({
    busy: true,
    hasFirstToken: true,
    hasLiveTool: false,
  });
  const caretAfterToken = showStreamingCaret({
    busy: true,
    completed: false,
    hasFirstToken: true,
    kind: "message",
  });
  assert.equal(waitingAfterToken, false);
  assert.equal(caretAfterToken, true);
  assert.equal(waiting && caretWhileWaiting, false);
  assert.equal(waitingAfterToken && caretAfterToken, false);
});

test("not on tool / widget / approve / connect / user-right", () => {
  const live = {
    busy: true,
    completed: false,
    hasFirstToken: true,
  };
  assert.equal(showStreamingCaret({ ...live, kind: "tool" }), false);
  assert.equal(showStreamingCaret({ ...live, kind: "widget" }), false);
  assert.equal(showStreamingCaret({ ...live, kind: "approve" }), false);
  assert.equal(showStreamingCaret({ ...live, kind: "connect" }), false);
  assert.equal(showStreamingCaret({ ...live, kind: "handoff" }), false);
  assert.equal(
    showStreamingCaret({ ...live, kind: "message", isUser: true }),
    false,
  );
  assert.equal(
    showStreamingCaret({ ...live, kind: "message", isUser: false }),
    true,
  );
});

test("desktop wires a 12px muted blinking caret on the growing LEFT bubble", () => {
  assert.match(app, /from "\.\/streamingCaret"/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /className="streaming-caret"/);
  const mdStart = app.indexOf('className="assistant-md"');
  const md = app.slice(mdStart, mdStart + 3600);
  assert.match(md, /showStreamingCaret/);
  assert.match(md, /className="streaming-caret"/);
  assert.match(app, /splitAssistantBubbles/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(
    userStart,
    userEnd > 0 ? userEnd : userStart + 2500,
  );
  assert.doesNotMatch(userBranch, /streaming-caret/);
  assert.doesNotMatch(userBranch, /showStreamingCaret/);
  const widgetSlice = app.slice(app.indexOf("isWidget(message)"));
  assert.doesNotMatch(widgetSlice.slice(0, 400), /streaming-caret/);
});

test("Reduce Motion is a static muted caret, no blink", () => {
  const caret = block(".streaming-caret");
  assert.match(caret, /height:\s*12px/);
  assert.match(caret, /background:\s*var\(--text-muted\)/);
  assert.match(css, /@keyframes\s+streaming-caret-blink/);
  assert.match(
    css,
    /prefers-reduced-motion:\s*reduce[\s\S]*\.streaming-caret \{[\s\S]*animation:\s*none/,
  );
});

test("OpenAPI stays 0.18.0; v0.52 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.52/);
  assert.match(protocol, /v0\.52/);
  assert.match(runtimeOpenapi, /v0\.52/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(caretSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(caretSrc, /\/v1\/chats\//);
  assert.doesNotMatch(app, /\/v1\/chats\//);
  assert.doesNotMatch(caretSrc, /\/v1\/cancel/);
});

test("v0.47 stick, v0.48 multi-bubbles, v0.49 optimistic Send, v0.50 Stop, v0.51 waiting stay wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /className="waiting"/);
});
