// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  CANCEL_LABEL,
  DONE_BUTTON_PX,
  DONE_LABEL,
  DRIVING_LABEL,
  OPEN_LABEL,
  RECORD_DOT_PX,
  RECORD_LABEL,
  RECORD_LABEL_PX,
  SANDBOX_HEIGHT,
  SANDBOX_WIDTH,
  SAVE_AS_SKILL_TITLE,
  SAVE_BUTTON_PX,
  SAVE_LABEL,
  SAVE_SHEET_PX,
  SAVED_FEEDBACK_MS,
  SAVED_LABEL,
  SKILL_NAME_PX,
  STOP_LABEL,
  TAKEOVER_AVATAR_PX,
  TAKEOVER_BAR_PX,
  canOpenComputer,
  composerInert,
  doneDisabled,
  escapeAction,
  keyEventPayload,
  letterboxRect,
  mapPointerToSandbox,
  recordControlLabel,
  saveDisabled,
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

test("Record is muted 12px left of Done; Stop is danger + 6px dot; Done disabled while recording", () => {
  assert.equal(RECORD_LABEL, "Record");
  assert.equal(STOP_LABEL, "Stop");
  assert.equal(SAVE_AS_SKILL_TITLE, "Save as skill");
  assert.equal(SAVE_LABEL, "Save");
  assert.equal(SAVED_LABEL, "Saved");
  assert.equal(CANCEL_LABEL, "Cancel");
  assert.equal(RECORD_LABEL_PX, 12);
  assert.equal(RECORD_DOT_PX, 6);
  assert.equal(SAVE_SHEET_PX, 320);
  assert.equal(SAVE_BUTTON_PX, 36);
  assert.equal(SKILL_NAME_PX, 14);
  assert.equal(SAVED_FEEDBACK_MS, 1500);
  assert.equal(recordControlLabel(false), "Record");
  assert.equal(recordControlLabel(true), "Stop");
  assert.equal(doneDisabled(true), true);
  assert.equal(doneDisabled(false), false);
  assert.equal(saveDisabled(""), true);
  assert.equal(saveDisabled("   "), true);
  assert.equal(saveDisabled("Demo"), false);
  assert.equal(escapeAction(true), "stop");
  assert.equal(escapeAction(false), "done");
  assert.equal(escapeAction(false, true), "discard");
  assert.equal(escapeAction(true, true), "discard");
});
