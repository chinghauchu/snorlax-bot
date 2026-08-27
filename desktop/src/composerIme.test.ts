// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  composerEnterShouldSend,
  isImeComposing,
} from "./composerIme.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");

test("composing Enter does not send (isComposing / keyCode 229 / Process)", () => {
  assert.equal(
    composerEnterShouldSend({ key: "Enter", isComposing: true }),
    false,
  );
  assert.equal(
    composerEnterShouldSend({ key: "Enter", keyCode: 229 }),
    false,
  );
  assert.equal(
    composerEnterShouldSend({ key: "Enter", which: 229 }),
    false,
  );
  assert.equal(composerEnterShouldSend({ key: "Process" }), false);
  assert.equal(isImeComposing({ isComposing: true, key: "Enter" }), true);
  assert.equal(isImeComposing({ keyCode: 229, key: "Enter" }), true);
  assert.equal(isImeComposing({ key: "Process" }), true);
});

test("confirmed Enter sends; Shift+Enter is newline; send button unchanged", () => {
  assert.equal(composerEnterShouldSend({ key: "Enter" }), true);
  assert.equal(
    composerEnterShouldSend({ key: "Enter", isComposing: false, keyCode: 13 }),
    true,
  );
  assert.equal(
    composerEnterShouldSend({ key: "Enter", shiftKey: true }),
    false,
  );
  assert.equal(
    composerEnterShouldSend({ key: "Enter", shiftKey: true, isComposing: true }),
    false,
  );
  assert.match(app, /composerEnterShouldSend/);
  assert.match(app, /isImeComposing/);
  assert.match(app, /function onSend\(/);
  assert.match(app, /function Paperclip/);
  assert.match(app, /attachmentIds/);
  assert.match(app, /skillPopupOpen/);
  assert.match(app, /mentionTrigger/);
});

test("create_agent / create_channel use existing tool line; no new composer chrome", () => {
  assert.match(app, /shouldRefreshRosterOnToolDone/);
  assert.doesNotMatch(app, /CreateAgentSheet|CreateChannelSheet|HireSheet/);
  assert.doesNotMatch(app, /\/v1\/chats\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(app, /className="tool-trace"/);
});
