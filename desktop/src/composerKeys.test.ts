// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  composerEnterSends,
  isComposerComposing,
  rosterRefreshTool,
} from "./composerKeys.ts";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "App.tsx"), "utf8");

test("Enter does not send while IME is composing (isComposing)", () => {
  assert.equal(
    composerEnterSends({ key: "Enter", shiftKey: false, isComposing: true }),
    false,
  );
  assert.equal(
    composerEnterSends({
      key: "Enter",
      shiftKey: false,
      nativeEvent: { isComposing: true },
    }),
    false,
  );
  assert.equal(isComposerComposing({ key: "a", shiftKey: false, isComposing: true }), true);
});

test("Enter does not send while IME is composing (keyCode 229)", () => {
  assert.equal(
    composerEnterSends({ key: "Enter", shiftKey: false, keyCode: 229 }),
    false,
  );
  assert.equal(
    composerEnterSends({
      key: "Enter",
      shiftKey: false,
      nativeEvent: { keyCode: 229 },
    }),
    false,
  );
  assert.equal(
    composerEnterSends({ key: "Unidentified", shiftKey: false, keyCode: 229 }),
    false,
  );
});

test("Enter sends after composition commits", () => {
  assert.equal(
    composerEnterSends({ key: "Enter", shiftKey: false, isComposing: false }),
    true,
  );
  assert.equal(
    composerEnterSends({ key: "Enter", shiftKey: false, keyCode: 13 }),
    true,
  );
});

test("Shift+Enter stays newline", () => {
  assert.equal(
    composerEnterSends({ key: "Enter", shiftKey: true, isComposing: false }),
    false,
  );
  assert.equal(
    composerEnterSends({ key: "Enter", shiftKey: true, keyCode: 229 }),
    false,
  );
});

test("composer uses IME composing guards", () => {
  assert.match(app, /isComposerComposing/);
  assert.match(app, /composerEnterSends/);
  assert.match(app, /rosterRefreshTool/);
  assert.doesNotMatch(app, /computerPane\.ts/);
});

test("create_agent / create_channel refresh the roster", () => {
  assert.equal(rosterRefreshTool("create_agent"), true);
  assert.equal(rosterRefreshTool("create_channel"), true);
  assert.equal(rosterRefreshTool("watch_video"), false);
});
