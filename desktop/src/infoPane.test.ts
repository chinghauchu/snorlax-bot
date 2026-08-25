// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteAgent,
  channelMembers,
  displayInitials,
  infoPaneKind,
  nextRosterSelection,
} from "./infoPane.ts";

test("seed and user-created agents are deletable; the channel is not", () => {
  assert.equal(canDeleteAgent({ kind: "agent" }), true);
  assert.equal(canDeleteAgent({ kind: "channel" }), false);
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
