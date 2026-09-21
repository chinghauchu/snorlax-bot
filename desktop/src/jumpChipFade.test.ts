// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { escapeJumpsToLatest } from "./stickToBottom.ts";
import {
  JUMP_CHIP_FADE_MS,
  JUMP_CHIP_HIDDEN,
  jumpChipAppear,
  jumpChipDismiss,
  jumpChipFadeMs,
  jumpChipShown,
} from "./stickToBottom.ts";
import { shouldFocusComposerAfterAbort } from "./stopGenerating.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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

function sliceFn(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end > start ? src.slice(start, end) : src.slice(start);
}

test("Jump chip appear/dismiss fade is 120ms opacity", () => {
  assert.equal(JUMP_CHIP_FADE_MS, 120);
  assert.equal(jumpChipFadeMs(false), 120);
  assert.deepEqual(jumpChipAppear(false), { mounted: true, shown: false });
  assert.deepEqual(jumpChipShown(), { mounted: true, shown: true });
  assert.deepEqual(jumpChipDismiss(false), { mounted: true, shown: false });

  const chip = block(".jump-latest");
  assert.match(chip, /opacity:\s*0/);
  assert.match(chip, /transition:\s*opacity\s+120ms/);
  const shown = block('.jump-latest[data-shown="true"]');
  assert.match(shown, /opacity:\s*1/);

  assert.match(app, /jumpChipAppear/);
  assert.match(app, /jumpChipShown/);
  assert.match(app, /jumpChipDismiss/);
  assert.match(app, /jumpChipFadeMs/);
  assert.match(app, /JUMP_CHIP_HIDDEN/);
  assert.match(app, /data-shown=\{jumpPaint\.shown \? "true" : "false"\}/);
  assert.match(app, /requestAnimationFrame/);
  assert.match(app, /setTimeout/);
  assert.match(app, /prefers-reduced-motion:\s*reduce/);
});

test("Reduce Motion on → instant show/hide (no fade)", () => {
  assert.equal(jumpChipFadeMs(true), 0);
  assert.deepEqual(jumpChipAppear(true), { mounted: true, shown: true });
  assert.deepEqual(jumpChipDismiss(true), JUMP_CHIP_HIDDEN);

  const reduce = reducedMotionBlocks().find((block) =>
    block.includes(".jump-latest"),
  );
  assert.ok(reduce, "missing Reduce Motion rule for Jump chip");
  const jump = ruleIn(reduce, ".jump-latest");
  assert.match(jump, /transition:\s*none/);
  assert.doesNotMatch(jump, /opacity\s+120ms/);
  assert.match(app, /jumpChipFadeMs\(reduce\)/);
  assert.match(stickSrc, /Instant when Reduce Motion/);
});

test("Jump click / Esc behavior is unchanged", () => {
  assert.equal(
    escapeJumpsToLatest({ showJump: true, busy: false }),
    true,
  );
  assert.equal(shouldFocusComposerAfterAbort(), true);

  const onJump = sliceFn(
    app,
    "const onJumpLatest = useCallback",
    "useEffect(() => {",
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
  assert.doesNotMatch(onJump, /jumpChipFadeMs/);

  assert.match(app, /className="jump-latest"/);
  assert.match(app, /onClick=\{onJumpLatest\}/);

  const jumpStart = app.indexOf("escapeJumpsToLatest({");
  assert.ok(jumpStart >= 0, "missing escapeJumpsToLatest wiring");
  const jumpBlock = app.slice(jumpStart, jumpStart + 500);
  assert.match(jumpBlock, /onJumpLatest\(\)/);
  assert.match(jumpBlock, /preventDefault/);
  assert.doesNotMatch(jumpBlock, /onStopGenerating\(\)/);

  const stopStart = app.indexOf("escapeStopsGenerating({");
  assert.ok(stopStart >= 0 && jumpStart > stopStart);
  const stopBranch = app.slice(stopStart, jumpStart);
  assert.match(stopBranch, /onStopGenerating\(\)/);
  assert.match(stopBranch, /return;/);
  assert.doesNotMatch(stopBranch, /onJumpLatest\(\)/);
});

test("OpenAPI stays 0.18.0; v0.63 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.63/);
  assert.match(protocol, /v0\.63/);
  assert.match(runtimeOpenapi, /v0\.63/);
  assert.doesNotMatch(stickSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(stickSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.62 intact stack stays wired", () => {
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
