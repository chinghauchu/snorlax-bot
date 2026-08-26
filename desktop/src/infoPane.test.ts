// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  SHARED_PROJECT_HINT,
  canDeleteAgent,
  canEditChannel,
  canToggleSharedProject,
  channelMembers,
  displayInitials,
  EMPTY_ROUTINES,
  humanizeTaipeiCron,
  infoPaneKind,
  fallbackRosterSelection,
  isWebhookRoutine,
  nextRosterSelection,
  routineMutedLine,
  webhookCopyText,
} from "./infoPane.ts";

test("user-created channels are editable; seed channel is not", () => {
  assert.equal(canEditChannel({ kind: "channel", id: "ops" }), true);
  assert.equal(
    canEditChannel({ kind: "channel", id: "snorlax-bot-group" }),
    false,
  );
  assert.equal(canEditChannel({ kind: "agent", id: "snorlax-bot" }), false);
});

test("shared project helper copy is the Design lock", () => {
  assert.equal(
    SHARED_PROJECT_HINT,
    "On: channel threads share a sandbox. Off: each agent’s workspace. Not a folder on this Mac.",
  );
  assert.equal(SHARED_PROJECT_HINT.includes("folder"), true);
  assert.doesNotMatch(SHARED_PROJECT_HINT, /\/Users\//);
});

test("shared project toggle is on every channel pane, including seed", () => {
  assert.equal(
    canToggleSharedProject({ kind: "channel" }),
    true,
  );
  assert.equal(canToggleSharedProject({ kind: "agent" }), false);
});

test("seed channel, user channels, and agents are deletable", () => {
  assert.equal(canDeleteAgent({ kind: "agent" }), true);
  assert.equal(canDeleteAgent({ kind: "agent", id: "snorlax-bot" }), true);
  assert.equal(
    canDeleteAgent({ kind: "channel", id: "snorlax-bot-group" }),
    true,
  );
  assert.equal(canDeleteAgent({ kind: "channel", id: "ops" }), true);
});

test("info pane kind follows Agent.kind, never guesses snorlax-bot-group", () => {
  assert.equal(infoPaneKind({ kind: "agent" }), "agent");
  assert.equal(
    infoPaneKind({ kind: "channel" }),
    "channel",
  );
});

test("empty avatar name yields initials", () => {
  assert.equal(displayInitials("Snorlax"), "SN");
  assert.equal(displayInitials("Nap lead"), "NL");
  assert.equal(displayInitials(""), "?");
});

test("channel members resolve memberIds against the roster, skipping the channel", () => {
  const roster = [
    { id: "snorlax-bot-group", kind: "channel", name: "Snorlax-Bot" },
    { id: "snorlax-bot", kind: "agent", name: "Snorlax" },
    { id: "bob", kind: "agent", name: "Bob" },
  ];
  const members = channelMembers(
    ["snorlax-bot", "bob", "snorlax-bot-group", "gone"],
    roster,
  );
  assert.deepEqual(
    members.map((row) => row.id),
    ["snorlax-bot", "bob"],
  );
});

test("after seed delete, select the channel and do not fake a seed", () => {
  const roster = [
    { id: "snorlax-bot-group", kind: "channel" },
  ];
  assert.equal(
    nextRosterSelection(roster, "snorlax-bot", "snorlax-bot"),
    "snorlax-bot-group",
  );
  assert.equal(roster.some((row) => row.id === "snorlax-bot"), false);
});

test("after seed channel delete, select remaining agent and do not fake a channel", () => {
  const roster = [{ id: "snorlax-bot", kind: "agent" }];
  assert.equal(
    nextRosterSelection(roster, "snorlax-bot-group", "snorlax-bot-group"),
    "snorlax-bot",
  );
  assert.equal(roster.some((row) => row.id === "snorlax-bot-group"), false);
});

test("after seed channel delete, prefer an agent over remaining extra channels", () => {
  const roster = [
    { id: "ops", kind: "channel" },
    { id: "snorlax-bot", kind: "agent" },
    { id: "chip", kind: "agent" },
  ];
  assert.equal(
    nextRosterSelection(roster, "snorlax-bot-group", "snorlax-bot-group"),
    "snorlax-bot",
  );
  assert.equal(fallbackRosterSelection(roster), "snorlax-bot");
  assert.equal(roster.some((row) => row.id === "snorlax-bot-group"), false);
});

test("after seed channel delete, select a remaining channel if no agents left", () => {
  const roster = [{ id: "ops", kind: "channel" }];
  assert.equal(
    nextRosterSelection(roster, "snorlax-bot-group", "snorlax-bot-group"),
    "ops",
  );
});

test("after seed channel delete, empty roster selects nothing and does not invent the seed", () => {
  assert.equal(
    nextRosterSelection([], "snorlax-bot-group", "snorlax-bot-group"),
    null,
  );
  assert.equal(fallbackRosterSelection([]), null);
});

test("empty routines copy is locked", () => {
  assert.equal(EMPTY_ROUTINES, "No routines yet.");
});

test("humanizeTaipeiCron matches Weekdays 9:00", () => {
  assert.equal(humanizeTaipeiCron("0 9 * * 1-5"), "Weekdays 9:00");
  assert.equal(humanizeTaipeiCron("0 8 * * *"), "Every day 8:00");
  assert.equal(
    routineMutedLine({ skill: "status", schedule: "0 9 * * 1-5" }),
    "Weekdays 9:00",
  );
  assert.equal(
    routineMutedLine({
      skill: "status",
      schedule: "0 9 * * 1-5",
      scheduleLabel: "Weekdays 9:00",
    }),
    "Weekdays 9:00",
  );
  assert.equal(
    routineMutedLine({
      skill: "status",
      trigger: { kind: "webhook" },
      webhookUrl: "http://127.0.0.1:8787/v1/hooks/rtn_x",
    }),
    "Webhook",
  );
  assert.equal(isWebhookRoutine({ trigger: { kind: "webhook" } }), true);
  assert.equal(
    isWebhookRoutine({ skill: "status", schedule: "0 9 * * 1-5" }),
    false,
  );
  assert.equal(
    webhookCopyText({
      webhookUrl: "http://127.0.0.1:8787/v1/hooks/rtn_x",
      webhookKey: "secret-key",
    }),
    "http://127.0.0.1:8787/v1/hooks/rtn_x\nsecret-key",
  );
});
