// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  JUMP_TO_LATEST_LABEL,
  NEAR_BOTTOM_PX,
  STICK_ARMED,
  assistantBubbleSignature,
  isNearBottom,
  onAssistantActivity,
  onJumpToLatest,
  onSendOrRegenerate,
  onUserScroll,
  shouldFollowStream,
} from "./stickToBottom.ts";

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

function left(id: string, content: string) {
  return {
    id,
    content,
    kind: "message",
    role: "assistant",
    senderId: "snorlax-bot",
  };
}

function user(id: string, content: string) {
  return {
    id,
    content,
    kind: "message",
    role: "user",
    senderId: "user",
  };
}

test("near-bottom slack is 64px; farther up is not near", () => {
  assert.equal(NEAR_BOTTOM_PX, 64);
  const box = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 };
  assert.equal(isNearBottom({ ...box, scrollTop: 1000 - 400 - 64 }), true);
  assert.equal(isNearBottom({ ...box, scrollTop: 1000 - 400 - 65 }), false);
  assert.equal(isNearBottom({ ...box, scrollTop: 1000 - 400 }), true);
});

test("stick follows while armed; scroll-up freezes and never yanks", () => {
  let state = { ...STICK_ARMED };
  assert.equal(shouldFollowStream(state), true);

  state = onUserScroll(state, false);
  assert.equal(state.armed, false);
  assert.equal(shouldFollowStream(state), false);
  assert.equal(state.showJump, false);

  state = onAssistantActivity(state, "a:1", "a:40");
  assert.equal(state.showJump, true);
  assert.equal(shouldFollowStream(state), false);

  state = onAssistantActivity(state, "a:40", "a:80");
  assert.equal(state.showJump, true);
  assert.equal(shouldFollowStream(state), false);
});

test("Send and Regenerates snap/re-arm; Jump chip matches; scroll-to-bottom dismisses", () => {
  let state = onUserScroll(STICK_ARMED, false);
  state = onAssistantActivity(state, "", "asst-1:12");
  assert.equal(state.showJump, true);

  state = onSendOrRegenerate();
  assert.deepEqual(state, STICK_ARMED);
  assert.equal(shouldFollowStream(state), true);

  state = onUserScroll(STICK_ARMED, false);
  state = onAssistantActivity(state, "asst-1:12", "asst-2:3");
  assert.equal(state.showJump, true);
  state = onJumpToLatest();
  assert.deepEqual(state, STICK_ARMED);

  state = onUserScroll(STICK_ARMED, false);
  state = onAssistantActivity(state, "asst-1:12", "asst-2:3");
  state = onUserScroll(state, true);
  assert.deepEqual(state, STICK_ARMED);
});

test("new assistant bubble while stuck shows the chip; idle scroll-up does not", () => {
  assert.equal(
    assistantBubbleSignature([user("u1", "hi"), left("a1", "hello")]),
    "a1:5",
  );
  assert.equal(assistantBubbleSignature([user("u1", "hi")]), "");
  assert.equal(
    assistantBubbleSignature([
      left("a1", "hello"),
      {
        id: "t1",
        content: "Ran pwd",
        kind: "tool",
        role: "assistant",
        senderId: "snorlax-bot",
      },
    ]),
    "a1:5",
  );

  const stuck = onUserScroll(STICK_ARMED, false);
  assert.deepEqual(onAssistantActivity(stuck, "a1:5", "a1:5"), stuck);
  assert.equal(
    onAssistantActivity(stuck, "a1:5", "a2:1").showJump,
    true,
  );
  assert.equal(onAssistantActivity(STICK_ARMED, "", "a1:5").showJump, false);
});

test("desktop wires stick/freeze, Send/Regenerate re-arm, Jump chip, composer focus", () => {
  assert.match(app, /from "\.\/stickToBottom"/);
  assert.match(app, /NEAR_BOTTOM_PX/);
  assert.match(app, /shouldFollowStream/);
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /onJumpToLatest/);
  assert.match(app, /JUMP_TO_LATEST_LABEL/);
  assert.match(app, /onScroll=\{onTranscriptScroll\}/);
  assert.match(app, /className="jump-latest"/);
  assert.match(app, /onSend\(\) \{[\s\S]*snapStick\(\)/);
  assert.match(app, /onRegenerate\(\) \{[\s\S]*snapStick\(\)/);
  assert.match(app, /onSend\(\) \{[\s\S]*focusComposer\(\)/);
  assert.match(app, /submitTurn[\s\S]*finally \{[\s\S]*focusComposer\(\)/);
  assert.doesNotMatch(
    app,
    /useEffect\(\(\) => \{\s*scroller\.current\?\.scrollTo\(\{ top: scroller\.current\.scrollHeight \}\);\s*\}, \[messages, busy, toolTraces\]\)/,
  );
  assert.doesNotMatch(stickSrc, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("Jump to latest chip is 12px muted at the bottom of the chat column", () => {
  const chip = block(".jump-latest");
  assert.match(chip, /position:\s*absolute/);
  assert.match(chip, /bottom:\s*12px/);
  assert.match(chip, /font-size:\s*12px/);
  assert.match(chip, /color:\s*var\(--text-muted\)/);
  const col = block(".transcript-col");
  assert.match(col, /position:\s*relative/);
  assert.match(css, /className="jump-latest"|jump-latest/);
  assert.equal(JUMP_TO_LATEST_LABEL, "Jump to latest");
});

test("OpenAPI stays 0.18.0; v0.47 is documented; no new HTTP", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.match(openapi, /v0\.47/);
  assert.match(protocol, /v0\.47/);
  assert.match(runtimeOpenapi, /v0\.47/);
  assert.doesNotMatch(stickSrc, /\/v1\/chats\//);
  assert.doesNotMatch(app, /\/v1\/scroll/);
});
