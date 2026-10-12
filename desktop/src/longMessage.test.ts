// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LONG_MESSAGE_EXPAND_MS,
  LONG_MESSAGE_FONT_PX,
  LONG_MESSAGE_LINE_HEIGHT,
  LONG_MESSAGE_LINES,
  LONG_MESSAGE_MAX_PX,
  SHOW_LESS_LABEL,
  SHOW_MORE_LABEL,
  longMessageExpandMs,
  longMessageOverflows,
  longMessageToggleLabel,
  shouldClampLongMessage,
  showLongMessageToggle,
} from "./longMessage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const view = readFileSync(join(here, "LongMessageBody.tsx"), "utf8");
const src = readFileSync(join(here, "longMessage.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "LongMessage.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.81 collapse long LEFT (a completed assistant LEFT kind=message bubble taller than about 14 lines shows the first chunk and a muted 12px/12pt Show more; click or tap expands the body and the control becomes Show less; mid-stream stays open; a Stop partial collapses once it is completed; each bubble in a turn collapses on its own; Reduce Motion is instant; the control does not move composer focus; an active find match in that bubble stays fully visible; no new HTTP)";

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

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("collapse only a finished overflowing LEFT bubble", () => {
  assert.equal(LONG_MESSAGE_LINES, 14);
  assert.equal(LONG_MESSAGE_FONT_PX, 14);
  assert.equal(LONG_MESSAGE_LINE_HEIGHT, 1.4);
  assert.equal(LONG_MESSAGE_MAX_PX, 14 * 14 * 1.4);
  assert.equal(SHOW_MORE_LABEL, "Show more");
  assert.equal(SHOW_LESS_LABEL, "Show less");
  assert.equal(longMessageToggleLabel(false), "Show more");
  assert.equal(longMessageToggleLabel(true), "Show less");
  assert.equal(longMessageOverflows(LONG_MESSAGE_MAX_PX), false);
  assert.equal(longMessageOverflows(LONG_MESSAGE_MAX_PX + 1), false);
  assert.equal(longMessageOverflows(LONG_MESSAGE_MAX_PX + 2), true);
  assert.equal(
    shouldClampLongMessage({
      completed: false,
      overflows: true,
      expanded: false,
      activeFind: false,
    }),
    false,
  );
  assert.equal(
    shouldClampLongMessage({
      completed: true,
      overflows: false,
      expanded: false,
      activeFind: false,
    }),
    false,
  );
  assert.equal(
    shouldClampLongMessage({
      completed: true,
      overflows: true,
      expanded: true,
      activeFind: false,
    }),
    false,
  );
  assert.equal(
    shouldClampLongMessage({
      completed: true,
      overflows: true,
      expanded: false,
      activeFind: true,
    }),
    false,
  );
  assert.equal(
    shouldClampLongMessage({
      completed: true,
      overflows: true,
      expanded: false,
      activeFind: false,
    }),
    true,
  );
  assert.equal(
    showLongMessageToggle({
      completed: false,
      overflows: true,
      activeFind: false,
    }),
    false,
  );
  assert.equal(
    showLongMessageToggle({
      completed: true,
      overflows: true,
      activeFind: true,
    }),
    false,
  );
  assert.equal(
    showLongMessageToggle({
      completed: true,
      overflows: true,
      activeFind: false,
    }),
    true,
  );
});

test("expand is 160ms and instant under Reduce Motion", () => {
  assert.equal(LONG_MESSAGE_EXPAND_MS, 160);
  assert.equal(longMessageExpandMs(false), 160);
  assert.equal(longMessageExpandMs(true), 0);
  const clip = block(".long-message");
  assert.match(clip, /overflow:\s*hidden/);
  assert.match(clip, /transition:\s*max-height\s+160ms/);
  const toggle = block(".long-message-toggle");
  assert.match(toggle, /font-size:\s*12px/);
  assert.match(toggle, /color:\s*var\(--text-muted\)/);
  const reduce = reducedMotionBlocks().find((entry) =>
    entry.includes(".long-message"),
  );
  assert.ok(reduce, "missing Reduce Motion rule for long messages");
  assert.match(reduce, /\.long-message\s*\{[^}]*transition:\s*none/);
  assert.doesNotMatch(
    reduce.slice(reduce.indexOf(".long-message")),
    /max-height\s+160ms/,
  );
});

test("desktop Show more is per completed LEFT bubble and does not take focus", () => {
  assert.match(app, /from "\.\/LongMessageBody"/);
  assert.match(app, /<LongMessageBody/);
  assert.match(app, /completed=\{completed\}/);
  assert.match(app, /activeFind=\{/);
  assert.match(view, /className="long-message"/);
  assert.match(view, /className="long-message-toggle"/);
  assert.match(view, /aria-expanded=\{expanded\}/);
  assert.match(view, /onMouseDown=\{keepComposerFocus\}/);
  assert.match(view, /event\.preventDefault\(\)/);
  assert.match(view, /type="button"/);
  assert.doesNotMatch(view, /focusComposer/);
  assert.doesNotMatch(view, /\.focus\(/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(view, /\/v1\//);

  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /LongMessageBody/);
  const left = sliceFn(app, 'className="assistant-bubbles"', "showAssistantCopy");
  assert.match(left, /<LongMessageBody/);
  assert.match(left, /shouldRenderMarkdown\(\{ completed \}\)/);
  assert.match(left, /className="streaming-caret"/);
});

test("OpenAPI stays 0.18.0; v0.81 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /longMessage\.test\.ts/);
  assert.match(ci, /test_ios_long_message\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /v0\.81/);
  assert.match(swift, /static let showMore = "Show more"/);
  assert.match(swift, /static let showLess = "Show less"/);
  assert.match(chat, /LongMessageBody\(/);
});
