// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  dropLastAssistantTurn,
  isLeftKindMessage,
  lastCompletedLeftMessageIndex,
  MESSAGE_COPY_FEEDBACK_MS,
  regeneratePostBody,
  showAssistantCopy,
  showAssistantRegenerate,
} from "./messageActions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const api = readFileSync(join(here, "api.ts"), "utf8");

function msg(
  partial: Record<string, unknown>,
): { kind?: string; role?: string; senderId?: string } {
  return partial as { kind?: string; role?: string; senderId?: string };
}

test("Copy on completed LEFT kind=message; not on tool/widget/connect/user-right", () => {
  const left = msg({ kind: "message", role: "assistant", senderId: "snorlax-bot" });
  assert.equal(showAssistantCopy({ message: left, completed: true }), true);
  assert.equal(showAssistantCopy({ message: left, completed: false }), false);
  assert.equal(
    showAssistantCopy({
      message: msg({ kind: "tool", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantCopy({
      message: msg({ kind: "widget", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantCopy({
      message: msg({ kind: "connect", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantCopy({
      message: msg({ kind: "message", role: "user", senderId: "user" }),
      completed: true,
    }),
    false,
  );
  assert.equal(isLeftKindMessage(left), true);
});

test("Regenerate only on last 1:1 assistant message; hidden while streaming", () => {
  const left = msg({ kind: "message", role: "assistant", senderId: "snorlax-bot" });
  assert.equal(
    showAssistantRegenerate({
      message: left,
      completed: true,
      isLatest: true,
      isChannel: false,
      streaming: false,
    }),
    true,
  );
  assert.equal(
    showAssistantRegenerate({
      message: left,
      completed: true,
      isLatest: false,
      isChannel: false,
      streaming: false,
    }),
    false,
  );
  assert.equal(
    showAssistantRegenerate({
      message: left,
      completed: true,
      isLatest: true,
      isChannel: true,
      streaming: false,
    }),
    false,
  );
  assert.equal(
    showAssistantRegenerate({
      message: left,
      completed: true,
      isLatest: true,
      isChannel: false,
      streaming: true,
    }),
    false,
  );
  const rows = [
    msg({ kind: "message", role: "user", senderId: "user" }),
    msg({ kind: "message", role: "assistant", senderId: "a" }),
    msg({ kind: "message", role: "user", senderId: "user" }),
    msg({ kind: "message", role: "assistant", senderId: "a" }),
  ];
  assert.equal(
    lastCompletedLeftMessageIndex(rows, { busy: false, liveAssistantIdx: 3 }),
    3,
  );
  assert.equal(
    lastCompletedLeftMessageIndex(rows, { busy: true, liveAssistantIdx: 3 }),
    1,
  );
});

test("regenerate POST body is { regenerate: true }", () => {
  assert.deepEqual(regeneratePostBody(), { regenerate: true });
  assert.match(api, /body\.regenerate = true/);
  assert.match(app, /regeneratePostBody\(\)/);
});

test("Copy / Regenerate chrome: 12px muted row after attachments + markdown", () => {
  assert.equal(MESSAGE_COPY_FEEDBACK_MS, 1500);
  assert.match(app, /MessageActions/);
  assert.match(app, /showAssistantCopy/);
  assert.match(app, /showAssistantRegenerate/);
  assert.match(app, /onSpeak/);
  assert.match(app, /speakLabel/);
  assert.match(app, /dropLastAssistantTurn/);
  assert.match(css, /\n\.message-actions \{/);
  assert.match(css, /\n\.message-action \{/);
  const actions = css.slice(css.indexOf("\n.message-actions {"));
  const block = actions.slice(0, actions.indexOf("}") + 1);
  assert.match(block, /gap:\s*12px/);
  const btn = css.slice(css.indexOf("\n.message-action {"));
  const btnBlock = btn.slice(0, btn.indexOf("}") + 1);
  assert.match(btnBlock, /font-size:\s*12px/);
  assert.match(btnBlock, /color:\s*var\(--text-muted\)/);
  assert.match(css, /\.assistant-md\s*\{[^}]*gap:\s*6px/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("dropLastAssistantTurn keeps the user bubble and drops message+tools", () => {
  const rows = [
    { id: "u", senderId: "user", role: "user", kind: "message" },
    { id: "t", senderId: "a", role: "assistant", kind: "tool" },
    { id: "m", senderId: "a", role: "assistant", kind: "message" },
  ];
  const next = dropLastAssistantTurn(rows);
  assert.deepEqual(
    next.map((row) => row.id),
    ["u"],
  );
});
