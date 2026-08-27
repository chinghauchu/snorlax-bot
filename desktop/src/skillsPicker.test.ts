// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  composerSkillAgentId,
  filterSkills,
  insertSkill,
  skillPopupOpen,
  skillTrigger,
} from "./skillsPicker.ts";

const status = { id: "status", name: "status" };
const notes = { id: "workspace-note", name: "workspace-note" };
const skills = [status, notes];
const alice = { id: "alice", kind: "agent" };
const channel = { id: "snorlax-bot-group", kind: "channel" };

test("1:1 slash opens a prefix-filtered list of that agent's skills", () => {
  assert.deepEqual(skillTrigger("/", 1), { start: 0, query: "" });
  assert.deepEqual(skillTrigger("/sta", 4), { start: 0, query: "sta" });
  assert.deepEqual(skillTrigger("run /sta", 8), { start: 4, query: "sta" });
  assert.deepEqual(filterSkills(skills, ""), skills);
  assert.deepEqual(filterSkills(skills, "sta"), [status]);
  assert.deepEqual(filterSkills(skills, "nope"), []);
  assert.equal(skillPopupOpen(skills, "", alice), true);
  assert.equal(skillPopupOpen(skills, "sta", alice), true);
  assert.equal(skillPopupOpen(skills, "nope", alice), false);
});

test("empty skill list or no match never opens a popup", () => {
  assert.equal(skillPopupOpen([], "", alice), false);
  assert.equal(skillPopupOpen([], "sta", alice), false);
  assert.equal(skillPopupOpen(skills, null, alice), false);
  assert.equal(skillPopupOpen(skills, "nope", alice), false);
});

test("channel slash is plain text — no popup", () => {
  assert.equal(skillPopupOpen(skills, "", channel), false);
  assert.equal(skillPopupOpen(skills, "sta", channel), false);
  assert.equal(composerSkillAgentId(channel), null);
  assert.equal(composerSkillAgentId(alice), "alice");
  assert.equal(composerSkillAgentId(null), null);
});

test("pick inserts /name as plain text, not a chip, and does not send", () => {
  const { text, caret } = insertSkill("/sta", 4, "status");
  assert.equal(text, "/status ");
  assert.equal(caret, "/status ".length);
  assert.equal(text.includes("@"), false);
  assert.equal(skillTrigger(text, caret), null);
  const padded = insertSkill("go /sta now", 7, "status");
  assert.equal(padded.text, "go /status now");
  assert.equal(padded.caret, "go /status".length);
});

test("backspace through the slash closes the trigger", () => {
  assert.deepEqual(skillTrigger("/s", 2), { start: 0, query: "s" });
  assert.equal(skillTrigger("", 0), null);
  assert.equal(skillTrigger("hello", 5), null);
});

test("https:// is not a skill trigger", () => {
  const url = "https://example.com";
  assert.equal(skillTrigger(url, url.length), null);
});
