// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CHANNEL_DISPLAY_NAME,
  displayBody,
  fromLabel,
  isHandoffRoot,
  isToolLine,
  jumpChannelName,
  messageHandoff,
  repliesLabel,
  visibleJump,
} from "./handoff.ts";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
  "utf8",
);

test("jump chip is a 12px muted system line, not a bubble", () => {
  assert.match(css, /\.jump-line \{/);
  const idx = css.indexOf(".jump-line {");
  const block = css.slice(idx, css.indexOf("}", idx) + 1);
  assert.match(block, /font-size:\s*12px/);
  assert.match(block, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(block, /border-radius:\s*1[0-9]px/);
  assert.match(css, /\.jump-name \{[\s\S]*color:\s*var\(--accent\)/);
});

test("unread is a 6px accent dot", () => {
  const idx = css.indexOf(".unread-dot {");
  assert.ok(idx >= 0);
  const block = css.slice(idx, css.indexOf("}", idx) + 1);
  assert.match(block, /width:\s*6px/);
  assert.match(block, /height:\s*6px/);
  assert.match(block, /background:\s*var\(--accent\)/);
});

test("handoff helpers", () => {
  assert.equal(CHANNEL_DISPLAY_NAME, "Snorlax-Bot");
  assert.equal(fromLabel("Alice"), "from Alice");
  assert.equal(repliesLabel(0), "0 replies");
  assert.equal(repliesLabel(1), "1 reply");
  assert.equal(repliesLabel(3), "3 replies");
  assert.equal(
    isHandoffRoot({ kind: "handoff" } as never),
    true,
  );
  assert.equal(isHandoffRoot({ kind: "message" } as never), false);
  assert.equal(isToolLine({ kind: "tool" } as never), true);
  assert.equal(isToolLine({ kind: "message" } as never), false);
  assert.equal(isToolLine({ kind: "handoff" } as never), false);
  assert.deepEqual(
    messageHandoff({
      handoff: { channelId: "snorlax-bot-group", threadId: "msg_1" },
    } as never),
    { channelId: "snorlax-bot-group", threadId: "msg_1" },
  );
  assert.equal(messageHandoff({} as never), null);
  assert.deepEqual(
    visibleJump(
      {
        handoff: { channelId: "snorlax-bot-group", threadId: "msg_1" },
      } as never,
      [{ id: "snorlax-bot-group", kind: "channel" }],
    ),
    { channelId: "snorlax-bot-group", threadId: "msg_1" },
  );
  assert.equal(
    visibleJump(
      {
        handoff: { channelId: "snorlax-bot-group", threadId: "msg_1" },
      } as never,
      [{ id: "snorlax-bot", kind: "agent" }],
    ),
    null,
  );
  assert.deepEqual(
    visibleJump(
      {
        handoff: { channelId: "ops", threadId: "msg_1" },
      } as never,
      [{ id: "ops", kind: "channel" }],
    ),
    { channelId: "ops", threadId: "msg_1" },
  );
  assert.equal(visibleJump({} as never, []), null);
  assert.equal(
    jumpChannelName("ops", [
      { id: "snorlax-bot-group", name: "Snorlax-Bot" },
      { id: "ops", name: "Ops" },
    ]),
    "Ops",
  );
  assert.equal(jumpChannelName("missing", []), "Snorlax-Bot");
  assert.equal(displayBody("from Mary: 2", "Mary"), "2");
  assert.equal(displayBody("The answer is 2", "Mary"), "The answer is 2");
});
