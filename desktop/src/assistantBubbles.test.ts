// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DIFFERENT_TURN_GAP_PX,
  SAME_TURN_LEFT_GAP_PX,
  USER_NEW_SENDER_GAP_PX,
  USER_SAME_SENDER_GAP_PX,
  assistantBubbleWide,
  splitAssistantBubbles,
  transcriptGapPx,
} from "./assistantBubbles.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
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

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("completed LEFT kind=message splits on blank lines", () => {
  assert.deepEqual(splitAssistantBubbles("Hello\n\nThere", true), [
    "Hello",
    "There",
  ]);
  assert.deepEqual(splitAssistantBubbles("a\n\n\n\nb", true), ["a", "b"]);
  assert.deepEqual(splitAssistantBubbles("one paragraph", true), [
    "one paragraph",
  ]);
  assert.deepEqual(splitAssistantBubbles("hi\n\n  yo", true), [
    "hi",
    "  yo",
  ]);
  assert.deepEqual(splitAssistantBubbles("", true), []);
});

test("mid-stream stays one growing bubble until complete", () => {
  const live = "Hello\n\nThere\n\nFriend";
  assert.deepEqual(splitAssistantBubbles(live, false), [live]);
  assert.deepEqual(splitAssistantBubbles("partial\n\n", false), [
    "partial\n\n",
  ]);
  assert.equal(splitAssistantBubbles(live, true).length, 3);
});

test("blank lines inside fences and $$ math stay one bubble", () => {
  const fence = "intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\noutro";
  assert.deepEqual(splitAssistantBubbles(fence, true), [
    "intro",
    "```js\nconst a = 1;\n\nconst b = 2;\n```",
    "outro",
  ]);
  const math = "before\n\n$$\nx = 1\n\ny = 2\n$$\n\nafter";
  assert.deepEqual(splitAssistantBubbles(math, true), [
    "before",
    "$$\nx = 1\n\ny = 2\n$$",
    "after",
  ]);
  const mermaid =
    "```mermaid\ngraph TD\n\nA-->B\n```";
  assert.deepEqual(splitAssistantBubbles(mermaid, true), [mermaid]);
});

test("Copy / Speak / Regenerates only on the last bubble of that turn", () => {
  assert.match(app, /splitAssistantBubbles/);
  const mdStart = app.indexOf('className="assistant-md"');
  const md = app.slice(mdStart, mdStart + 3600);
  assert.match(md, /assistant-bubbles/);
  assert.match(md, /bubble agent/);
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

test("desktop chrome: short agent bubbles; user-right / stick unchanged", () => {
  const stack = block(".assistant-bubbles");
  assert.match(stack, /flex-direction:\s*column/);
  assert.match(stack, /gap:\s*6px/);
  const agent = block(".bubble.agent");
  assert.match(agent, /width:\s*fit-content/);
  assert.match(agent, /max-width:\s*100%/);
  assert.match(css, /\n\.bubble\.agent\.wide \{/);
  const wide = block(".bubble.agent.wide");
  assert.match(wide, /width:\s*100%/);
  assert.equal(assistantBubbleWide("```js\nconst x = 1\n```"), true);
  assert.equal(assistantBubbleWide("$$\nx=1\n$$"), true);
  assert.equal(assistantBubbleWide("short hello"), false);
  assert.match(app, /className="bubble user"/);
  assert.match(app, /from "\.\/stickToBottom"/);
  assert.match(app, /shouldFollowStream/);
  assert.match(app, /onScroll=\{onTranscriptScroll\}/);
  assert.doesNotMatch(
    app,
    /useEffect\(\(\) => \{\s*scroller\.current\?\.scrollTo\(\{ top: scroller\.current\.scrollHeight \}\);\s*\}, \[messages, busy, toolTraces\]\)/,
  );
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("tool / widget / approve / connect stay non-bubbled; OpenAPI 0.18.0", () => {
  const widgetSlice = app.slice(app.indexOf("isWidget(message)"));
  assert.doesNotMatch(widgetSlice.slice(0, 400), /splitAssistantBubbles/);
  assert.match(app, /isToolLine\(message\)/);
  assert.match(app, /<WidgetCard/);
  assert.match(app, /<ConnectCard/);
  assert.match(app, /<ApproveCard/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(
    userStart,
    userEnd > 0 ? userEnd : userStart + 2500,
  );
  assert.doesNotMatch(userBranch, /splitAssistantBubbles/);
  assert.match(openapi, /version:\s*0\.18\.0/);
  assert.match(protocol, /version:\s*0\.18\.0/);
  assert.match(runtimeOpenapi, /version:\s*0\.18\.0/);
  assert.match(openapi, /v0\.48/);
  assert.match(protocol, /v0\.48/);
  assert.match(runtimeOpenapi, /v0\.48/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(app, /\/v1\/bubbles/);
});

test("v0.54 same-turn consecutive LEFT bubbles use a 6px gap", () => {
  assert.equal(transcriptGapPx("same-turn-left"), 6);
  assert.equal(SAME_TURN_LEFT_GAP_PX, 6);
  const stack = block(".assistant-bubbles");
  assert.match(stack, /gap:\s*6px/);
  assert.doesNotMatch(stack, /gap:\s*4px/);
  assert.doesNotMatch(stack, /gap:\s*12px/);
  const live = "Hello\n\nThere";
  assert.equal(splitAssistantBubbles(live, true).length, 2);
});

test("v0.54 different-turn / after tool-widget-approve-connect stay 12px", () => {
  assert.equal(transcriptGapPx("different-turn"), 12);
  assert.equal(transcriptGapPx("after-tool"), 12);
  assert.equal(transcriptGapPx("after-widget"), 12);
  assert.equal(transcriptGapPx("after-approve"), 12);
  assert.equal(transcriptGapPx("after-connect"), 12);
  assert.equal(DIFFERENT_TURN_GAP_PX, 12);
  const leftNew = block(".turn.left.new-sender");
  const leftSame = block(".turn.left.same-sender");
  assert.match(leftNew, /margin-top:\s*12px/);
  assert.match(leftSame, /margin-top:\s*12px/);
  assert.match(app, /isToolLine\(message\)/);
  assert.match(app, /<WidgetCard/);
  assert.match(app, /<ApproveCard/);
  assert.match(app, /<ConnectCard/);
});

test("v0.54 mid-stream stays one growing bubble; user-right unchanged", () => {
  const live = "Hello\n\nThere\n\nFriend";
  assert.deepEqual(splitAssistantBubbles(live, false), [live]);
  assert.equal(transcriptGapPx("mid-stream"), 0);
  assert.equal(transcriptGapPx("user-same-sender"), 4);
  assert.equal(transcriptGapPx("user-new-sender"), 16);
  assert.equal(USER_SAME_SENDER_GAP_PX, 4);
  assert.equal(USER_NEW_SENDER_GAP_PX, 16);
  const userSame = block(".turn.same-sender");
  const userNew = block(".turn.new-sender");
  assert.match(userSame, /margin-top:\s*4px/);
  assert.match(userNew, /margin-top:\s*16px/);
  assert.match(app, /className="bubble user"/);
  assert.doesNotMatch(
    app.slice(
      app.indexOf('className="bubble user"'),
      app.indexOf("assistant-md", app.indexOf('className="bubble user"')),
    ),
    /splitAssistantBubbles/,
  );
});

test("v0.54 OpenAPI stays 0.18.0; fluency stack stays wired", () => {
  assert.match(openapi, /version:\s*0\.18\.0/);
  assert.match(protocol, /version:\s*0\.18\.0/);
  assert.match(runtimeOpenapi, /version:\s*0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.54/);
  assert.match(protocol, /v0\.54/);
  assert.match(runtimeOpenapi, /v0\.54/);
  assert.match(app, /from "\.\/stickToBottom"/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /escapeStopsGenerating/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /\/v1\/bubbles/);
  assert.doesNotMatch(openapi, /\/v1\/bubbles/);
});
