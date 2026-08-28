// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isTranscriptVisible } from "./mentions.ts";
import {
  approveOf,
  approveStatusOf,
  isApprove,
  isPendingApprove,
  resolvedApproveLabel,
} from "./approve.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("approve helpers lock kind=approve status on the Message", () => {
  const pending = {
    id: "msg_a",
    kind: "approve" as const,
    approveStatus: "pending" as const,
    approve: { command: "rm -rf scratch" },
  };
  assert.equal(isApprove(pending), true);
  assert.equal(isPendingApprove(pending), true);
  assert.equal(approveOf(pending)?.command, "rm -rf scratch");
  assert.equal(approveStatusOf(pending), "pending");
  assert.equal(resolvedApproveLabel("denied"), "Denied");
  assert.equal(resolvedApproveLabel("approved"), null);
  assert.equal(isPendingApprove({ ...pending, approveStatus: "denied" }), false);
  assert.equal(isApprove({ kind: "widget" }), false);
  assert.equal(isApprove({ kind: "connect" }), false);
});

test("1:1 isolation hides another speaker's approve card", () => {
  const alice = { id: "alice", kind: "agent" as const };
  const bobCard = {
    senderId: "bob",
    kind: "approve",
    approve: { command: "rm foo" },
  };
  const aliceCard = {
    senderId: "alice",
    kind: "approve",
    approve: { command: "rm foo" },
  };
  assert.equal(isTranscriptVisible(bobCard, alice), false);
  assert.equal(isTranscriptVisible(aliceCard, alice), true);
  assert.equal(
    isTranscriptVisible(bobCard, { id: "room", kind: "channel" }),
    true,
  );
});

test("approve card chrome is LEFT, not a bubble, 240-320px", () => {
  const card = block(".approve-card");
  const command = block(".approve-command");
  const denied = block(".approve-denied-label");
  const dismiss = block(".approve-dismiss");
  const actions = block(".approve-actions");
  const primary = block(".approve-approve");
  const deny = block(".approve-deny");

  assert.match(card, /min-width:\s*240px/);
  assert.match(card, /max-width:\s*320px/);
  assert.match(card, /border-radius:\s*12px/);
  assert.match(card, /padding:\s*12px/);
  assert.match(card, /border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(card, /background:\s*var\(--bubble\)/);
  assert.match(command, /font-size:\s*12px/);
  assert.match(command, /line-height:\s*1\.45/);
  assert.match(command, /ui-monospace/);
  assert.match(command, /-webkit-line-clamp:\s*2/);
  assert.match(denied, /font-size:\s*12px/);
  assert.match(denied, /color:\s*var\(--text-muted\)/);
  assert.match(dismiss, /width:\s*20px/);
  assert.match(dismiss, /height:\s*20px/);
  assert.match(actions, /flex-direction:\s*column/);
  assert.match(actions, /gap:\s*6px/);
  assert.match(actions, /margin-top:\s*10px/);
  assert.match(primary, /min-height:\s*36px/);
  assert.match(primary, /color-mix\(in srgb,\s*var\(--accent\)\s+28%/);
  assert.match(deny, /min-height:\s*36px/);
  assert.match(deny, /color:\s*var\(--danger\)/);
  assert.doesNotMatch(css, /\.approve-card\.right/);
  assert.match(css, /\.turn\.left\s+\.approve-card/);
  assert.match(css, /\n\.widget-card \{/);
  assert.match(css, /\n\.connect-card \{/);
  assert.doesNotMatch(css, /\.widget-card,\s*\.approve-card/);
  assert.doesNotMatch(css, /\.approve-card,\s*\.widget-card/);
  assert.match(app, /ApproveCard/);
  assert.match(app, /approveReply/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /\/v1\/approve/);
  const cardSrc = readFileSync(join(here, "ApproveCard.tsx"), "utf8");
  assert.match(cardSrc, /title=\{card\.command\}/);
  assert.doesNotMatch(cardSrc, /cwd/);
  assert.doesNotMatch(cardSrc, /WidgetCard/);
});
