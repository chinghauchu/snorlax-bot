// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import { shouldRenderMarkdown } from "./midStreamPlaintext.ts";
import { shouldRenderMath } from "./math.ts";
import { shouldRenderMermaid } from "./mermaid.ts";
import { shouldOfferStop } from "./stopGenerating.ts";
import { showStreamingCaret } from "./streamingCaret.ts";
import { showWaitingLine } from "./waiting.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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

function assistantMdSlice(): string {
  const start = app.indexOf('className="assistant-md"');
  assert.ok(start >= 0);
  return app.slice(start, start + 4200);
}

test("mid-stream LEFT kind=message is plaintext — no markdown, mermaid, or math", () => {
  assert.equal(shouldRenderMarkdown({ completed: false }), false);
  assert.equal(
    shouldRenderMermaid({ language: "mermaid", completed: false }),
    false,
  );
  assert.equal(shouldRenderMath({ completed: false, closed: true }), false);

  assert.match(app, /from "\.\/midStreamPlaintext"/);
  assert.match(app, /shouldRenderMarkdown\(\{ completed \}\)/);
  const md = assistantMdSlice();
  assert.match(md, /shouldRenderMarkdown\(\{ completed \}\)/);
  assert.match(
    md,
    /shouldRenderMarkdown\(\{ completed \}\) \? \(\s*<MarkdownBody/,
  );
  assert.match(md, /<pre className="assistant-plain">/);
  const plainStart = md.indexOf("assistant-plain");
  const plainEnd = md.indexOf("showAssistantCopy");
  const plain = md.slice(plainStart, plainEnd > 0 ? plainEnd : undefined);
  assert.doesNotMatch(plain, /<MarkdownBody/);
  assert.doesNotMatch(plain, /MermaidFence/);
  assert.doesNotMatch(plain, /MathNode/);
  assert.doesNotMatch(plain, /extractMath/);
  assert.doesNotMatch(plain, /react-markdown/);
  const chrome = block(".assistant-plain");
  assert.match(chrome, /white-space:\s*pre-wrap/);
  assert.match(chrome, /overflow-wrap:\s*anywhere/);
  assert.match(src, /no live markdown, mermaid, or math/);
});

test("on complete or Stop, markdown renders once then the multi-bubble split", () => {
  assert.equal(shouldRenderMarkdown({ completed: true }), true);
  assert.equal(
    shouldRenderMermaid({ language: "mermaid", completed: true }),
    true,
  );
  assert.equal(shouldRenderMath({ completed: true, closed: true }), true);

  const live = "Hello **there**\n\n```mermaid\ngraph TD; A-->B;\n```\n\n\\( x \\)";
  assert.deepEqual(splitAssistantBubbles(live, false), [live]);
  assert.deepEqual(splitAssistantBubbles(live, true), [
    "Hello **there**",
    "```mermaid\ngraph TD; A-->B;\n```",
    "\\( x \\)",
  ]);

  assert.match(
    app,
    /const completed = !\(busy && index === liveAssistantIdx\);/,
  );
  const md = assistantMdSlice();
  assert.match(md, /<MarkdownBody/);
  assert.match(md, /completed=\{completed\}/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /leftBubbles/);
  assert.match(app, /shouldOfferStop\(busy\)/);
  assert.match(app, /onStopGenerating/);
  assert.equal(shouldOfferStop(true), true);
  assert.equal(shouldOfferStop(false), false);
  assert.equal(
    showStreamingCaret({
      busy: false,
      completed: true,
      hasFirstToken: true,
      kind: "message",
    }),
    false,
    "Stop / complete clears the caret so markdown can paint",
  );
  assert.match(body, /shouldRenderMermaid/);
  assert.match(body, /shouldRenderMath/);
  assert.match(body, /react-markdown/);
});

test("Copy / Speak / Regenerates stay on the last bubble after complete", () => {
  const md = assistantMdSlice();
  const bubbleBlock = md.slice(
    md.indexOf("assistant-bubbles"),
    md.indexOf("showAssistantCopy"),
  );
  assert.doesNotMatch(bubbleBlock, /MessageActions/);
  assert.match(md, /showAssistantCopy/);
  assert.match(md, /<MessageActions/);
  const actionsAfter = md.indexOf("MessageActions");
  const bubblesAt = md.indexOf("assistant-bubbles");
  assert.ok(bubblesAt >= 0 && actionsAfter > bubblesAt);
});

test("waiting ···, caret, stick-to-bottom, compact tools unchanged", () => {
  assert.equal(
    showWaitingLine({ busy: true, hasFirstToken: false, hasLiveTool: false }),
    true,
  );
  assert.equal(
    showStreamingCaret({
      busy: true,
      completed: false,
      hasFirstToken: true,
      kind: "message",
    }),
    true,
  );
  const md = assistantMdSlice();
  assert.match(md, /className="streaming-caret"/);
  assert.match(md, /className="assistant-plain"/);
  assert.match(app, /className="waiting"/);
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /shouldFollowStream/);
  assert.match(app, /className="jump-latest"/);
  assert.match(app, /ToolStackHeader/);
  assert.match(css, /\.assistant-bubbles \{[\s\S]*gap:\s*6px/);
  const caret = block(".streaming-caret");
  assert.match(caret, /height:\s*12px/);
  assert.match(caret, /background:\s*var\(--text-muted\)/);
});

test("OpenAPI stays 0.18.0; v0.57 is documented; no new HTTP", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.57/);
  assert.match(protocol, /v0\.57/);
  assert.match(runtimeOpenapi, /v0\.57/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(src, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/cancel/);
  assert.doesNotMatch(src, /\/v1\/chats\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.56 intact stack stays wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop\(busy\)/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /className="assistant-bubbles"/);
  assert.match(app, /sendMutedWhileGenerating\(busy\)/);
  assert.match(app, /from "\.\/compactToolTraces"/);
  assert.match(app, /JUMP_TO_LATEST_LABEL/);
});
