// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshRosterOnToolDone } from "./rosterRefresh.ts";

test("refresh roster only on successful create_agent / create_channel tool.done", () => {
  assert.equal(shouldRefreshRosterOnToolDone("create_agent", true), true);
  assert.equal(shouldRefreshRosterOnToolDone("create_channel", true), true);
  assert.equal(shouldRefreshRosterOnToolDone("create_agent", false), false);
  assert.equal(shouldRefreshRosterOnToolDone("create_channel", null), false);
  assert.equal(shouldRefreshRosterOnToolDone("watch_video", true), false);
  assert.equal(shouldRefreshRosterOnToolDone("write_file", true), false);
  assert.equal(shouldRefreshRosterOnToolDone("tool.start", true), false);
});
