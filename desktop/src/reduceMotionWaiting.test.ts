// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { showStreamingCaret } from "./streamingCaret.ts";
import {
  WAITING_LABEL,
  showWaitingLine,
  waitingDotsShouldPulse,
} from "./waiting.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const waitingSrc = readFileSync(join(here, "waiting.ts"), "utf8");
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

function reducedMotionBlocks(): string[] {
  const needle = "@media (prefers-reduced-motion: reduce)";
  const out: string[] = [];
  let from = 0;
  while (true) {
    const idx = css.indexOf(needle, from);
    if (idx < 0) break;
    const start = css.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push(css.slice(idx, end + 1));
    from = end + 1;
  }
  return out;
}

function ruleIn(haystack: string, selector: string): string {
  const needle = `${selector} {`;
  const idx = haystack.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector} in reduced-motion CSS`);
  const start = haystack.indexOf("{", idx);
  const end = haystack.indexOf("}", start);
  return haystack.slice(start, end + 1);
}

test("Reduce Motion on → static muted ··· (no pulse)", () => {
  assert.equal(waitingDotsShouldPulse(true), false);
  assert.equal(WAITING_LABEL, "···");

  const reduce = reducedMotionBlocks().find((block) =>
    block.includes(".waiting-dots span"),
  );
  assert.ok(reduce, "missing Reduce Motion rule for waiting ···");
  const waiting = ruleIn(reduce, ".waiting-dots span");
  assert.match(waiting, /animation:\s*none/);
  assert.doesNotMatch(waiting, /waiting-dot/);
  assert.match(waitingSrc, /waitingDotsShouldPulse/);
  assert.match(waitingSrc, /static muted/);
});

test("Reduce Motion off → keep the existing pulse", () => {
  assert.equal(waitingDotsShouldPulse(false), true);
  const dots = block(".waiting-dots span");
  assert.match(dots, /animation:\s*waiting-dot/);
  assert.doesNotMatch(dots, /animation:\s*none/);
  assert.match(css, /@keyframes\s+waiting-dot/);
  assert.match(block(".waiting-dots span:nth-child(2)"), /animation-delay:\s*0\.2s/);
  assert.match(block(".waiting-dots span:nth-child(3)"), /animation-delay:\s*0\.4s/);
  assert.match(app, /className="waiting-dots"/);
  assert.match(app, /WAITING_DOT/);
});

test("streaming caret Reduce Motion is unchanged (v0.52 static, no blink)", () => {
  const caret = block(".streaming-caret");
  assert.match(caret, /height:\s*12px/);
  assert.match(caret, /background:\s*var\(--text-muted\)/);
  assert.match(caret, /animation:\s*streaming-caret-blink/);
  assert.match(css, /@keyframes\s+streaming-caret-blink/);

  const reduce = reducedMotionBlocks().find((block) =>
    block.includes(".streaming-caret"),
  );
  assert.ok(reduce, "missing Reduce Motion rule for streaming caret");
  const reducedCaret = ruleIn(reduce, ".streaming-caret");
  assert.match(reducedCaret, /animation:\s*none/);
  assert.doesNotMatch(caretSrc, /waitingDotsShouldPulse/);
  assert.equal(
    showStreamingCaret({
      busy: true,
      completed: false,
      hasFirstToken: true,
      kind: "message",
    }),
    true,
  );
});

test("appear/dismiss rules for ··· are unchanged", () => {
  assert.equal(
    showWaitingLine({
      busy: true,
      hasFirstToken: false,
      hasLiveTool: false,
    }),
    true,
    "Send → waiting ···",
  );
  assert.equal(
    showWaitingLine({
      busy: true,
      hasFirstToken: true,
      hasLiveTool: false,
    }),
    false,
    "first token hides ···",
  );
  assert.equal(
    showWaitingLine({
      busy: false,
      hasFirstToken: false,
      hasLiveTool: false,
    }),
    false,
    "Stop hides ···",
  );
  assert.equal(
    showWaitingLine({
      busy: true,
      hasFirstToken: false,
      hasLiveTool: false,
      hasError: true,
    }),
    false,
    "error hides ···",
  );
});

test("OpenAPI stays 0.18.0; v0.58 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.58/);
  assert.match(protocol, /v0\.58/);
  assert.match(runtimeOpenapi, /v0\.58/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(waitingSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(waitingSrc, /\/v1\/chats\//);
  assert.doesNotMatch(waitingSrc, /\/v1\/cancel/);
});

test("v0.47–v0.57 intact stack stays wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /className="assistant-bubbles"/);
  assert.match(app, /sendMutedWhileGenerating\(busy\)/);
  assert.match(app, /from "\.\/compactToolTraces"/);
  assert.match(app, /from "\.\/midStreamPlaintext"/);
  assert.match(app, /JUMP_TO_LATEST_LABEL/);
});
