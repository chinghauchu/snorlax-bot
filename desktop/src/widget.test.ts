// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isTranscriptVisible } from "./mentions.ts";
import {
  isPendingWidget,
  isWidget,
  optionValue,
  pendingWidgetMessage,
  widgetOf,
} from "./widget.ts";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
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

test("widget helpers lock kind=widget status and values on the Message", () => {
  const pending = {
    id: "msg_w",
    kind: "widget" as const,
    widgetStatus: "pending" as const,
    widgetValues: [] as string[],
    widget: {
      prompt: "Ship it?",
      options: [{ label: "Yes", value: "Ship it" }],
    },
  };
  assert.equal(isWidget(pending), true);
  assert.equal(isPendingWidget(pending), true);
  assert.equal(widgetOf(pending)?.prompt, "Ship it?");
  assert.equal(optionValue(pending.widget.options[0]), "Ship it");
  assert.deepEqual(pendingWidgetMessage([pending])?.id, "msg_w");

  const resolved = {
    ...pending,
    widgetStatus: "resolved",
    widgetValues: ["Ship it"],
  };
  assert.equal(isPendingWidget(resolved), false);

  const dismissed = {
    ...pending,
    widgetStatus: "dismissed",
    widgetValues: [],
  };
  assert.equal(isPendingWidget(dismissed), false);
});

test("1:1 isolation hides another speaker's widget card", () => {
  const alice = { id: "alice", kind: "agent" as const };
  const bobCard = {
    senderId: "bob",
    kind: "widget",
    widget: {
      prompt: "From Bob?",
      options: [{ label: "Ok" }],
      status: "pending",
    },
  };
  const aliceCard = {
    senderId: "alice",
    kind: "widget",
    widget: {
      prompt: "From Alice?",
      options: [{ label: "Ok" }],
      status: "pending",
    },
  };
  assert.equal(isTranscriptVisible(bobCard, alice), false);
  assert.equal(isTranscriptVisible(aliceCard, alice), true);
  assert.equal(
    isTranscriptVisible(bobCard, { id: "room", kind: "channel" }),
    true,
  );
});

test("routine confirm stays kind=widget Save/Don't with no ApproveCard fork", () => {
  const app = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
    "utf8",
  );
  assert.match(app, /<WidgetCard/);
  assert.match(app, /isWidget\(message\)/);
  assert.doesNotMatch(app, /kind === "routine"/);
  assert.doesNotMatch(css, /\.routine-confirm/);
  const card = block(".widget-card");
  assert.match(card, /min-width:\s*240px/);
  assert.match(card, /max-width:\s*320px/);
  assert.equal(
    existsSync(join(dirname(fileURLToPath(import.meta.url)), "computerPane.ts")),
    false,
  );
});

test("question card chrome is LEFT, not a bubble, 240-320px", () => {
  const card = block(".widget-card");
  const prompt = block(".widget-prompt");
  const help = block(".widget-help");
  const options = block(".widget-options");
  const option = block(".widget-option");
  const primary = block(".widget-option.style-primary");
  const danger = block(".widget-option.style-danger");
  const custom = block(".widget-custom");
  const done = block(".widget-done");
  const dismiss = block(".widget-dismiss");
  const check = block(".widget-check");
  const mark = block(".widget-picked-mark");
  const dismissed = block(".widget-dismissed-label");

  assert.match(card, /min-width:\s*240px/);
  assert.match(card, /max-width:\s*320px/);
  assert.match(card, /border-radius:\s*12px/);
  assert.match(card, /padding:\s*12px/);
  assert.match(card, /border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(card, /background:\s*var\(--bubble\)/);
  assert.match(prompt, /font-size:\s*14px/);
  assert.match(prompt, /line-height:\s*1\.4/);
  assert.match(help, /font-size:\s*12px/);
  assert.match(help, /color:\s*var\(--text-muted\)/);
  assert.match(options, /gap:\s*6px/);
  assert.match(option, /min-height:\s*36px/);
  assert.match(option, /border-radius:\s*8px/);
  assert.match(option, /font-size:\s*13px/);
  assert.match(option, /font-weight:\s*500/);
  assert.match(option, /text-align:\s*left/);
  assert.match(primary, /color-mix\(in srgb,\s*var\(--accent\)\s+28%/);
  assert.match(danger, /color:\s*var\(--danger\)/);
  assert.match(custom, /height:\s*36px/);
  assert.match(done, /min-height:\s*36px/);
  assert.match(dismiss, /width:\s*20px/);
  assert.match(dismiss, /height:\s*20px/);
  assert.match(check, /width:\s*16px/);
  assert.match(check, /height:\s*16px/);
  assert.match(mark, /width:\s*16px/);
  assert.match(mark, /height:\s*16px/);
  assert.match(dismissed, /font-size:\s*12px/);
  assert.match(dismissed, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(css, /Pick one of the following/);
  assert.doesNotMatch(css, /\.widget-card\.right/);
  assert.match(css, /\.turn\.left\s+\.widget-card/);
});
