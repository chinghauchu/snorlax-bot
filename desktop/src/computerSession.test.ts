// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  DONE_BUTTON_PX,
  DONE_LABEL,
  DRIVING_LABEL,
  OPEN_LABEL,
  SANDBOX_HEIGHT,
  SANDBOX_WIDTH,
  TAKEOVER_AVATAR_PX,
  TAKEOVER_BAR_PX,
  canOpenComputer,
  composerInert,
  keyEventPayload,
  letterboxRect,
  mapPointerToSandbox,
} from "./computerSession.ts";

test("Open is only offered when hasSandbox", () => {
  assert.equal(OPEN_LABEL, "Open");
  assert.equal(canOpenComputer(true), true);
  assert.equal(canOpenComputer(false), false);
  assert.equal(canOpenComputer(null), false);
  assert.equal(canOpenComputer(undefined), false);
});

test("composer is inert while takeover is open", () => {
  assert.equal(composerInert(true), true);
  assert.equal(composerInert(false), false);
});

test("takeover chrome sizes: 52px bar, 24px avatar, 36px Done", () => {
  assert.equal(DRIVING_LABEL, "You're driving · agent paused");
  assert.equal(DONE_LABEL, "Done");
  assert.equal(TAKEOVER_BAR_PX, 52);
  assert.equal(TAKEOVER_AVATAR_PX, 24);
  assert.equal(DONE_BUTTON_PX, 36);
  assert.equal(SANDBOX_WIDTH, 1280);
  assert.equal(SANDBOX_HEIGHT, 800);
});

test("pointer maps through a letterboxed 1280x800 into sandbox coords", () => {
  const box = letterboxRect(640, 500);
  assert.ok(Math.abs(box.scale - 0.5) < 1e-9);
  assert.equal(box.width, 640);
  assert.equal(box.height, 400);
  assert.equal(box.x, 0);
  assert.equal(box.y, 50);
  const mapped = mapPointerToSandbox(160, 150, {
    left: 0,
    top: 0,
    width: 640,
    height: 500,
  });
  assert.deepEqual(mapped, { x: 320, y: 200 });
  assert.equal(
    mapPointerToSandbox(10, 10, { left: 0, top: 0, width: 640, height: 500 }),
    null,
  );
});

test("Esc is Done and is not sent as a sandbox key", () => {
  assert.equal(keyEventPayload({ key: "Escape", type: "keydown" }), null);
  assert.deepEqual(keyEventPayload({ key: "a", type: "keydown" }), {
    key: "a",
    type: "down",
  });
  assert.deepEqual(keyEventPayload({ key: "Enter", type: "keyup" }), {
    key: "Enter",
    type: "up",
  });
});
