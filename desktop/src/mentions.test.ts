// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  insertMention,
  isTranscriptVisible,
  mentionIdsInText,
  mentionTrigger,
  pickedChipNames,
  splitMentions,
} from "./mentions.ts";

test("insertMention keeps the caret after the chip", () => {
  const { text, caret } = insertMention("hello @Al", 9, "Alice");
  assert.equal(text, "hello @Alice ");
  assert.equal(caret, "hello @Alice ".length);
  assert.equal(text.slice(caret), "");
});

test("insertMention does not throw mid-sentence", () => {
  const { text, caret } = insertMention("ask @Bo please", 7, "Bob");
  assert.equal(text, "ask @Bob please");
  assert.equal(caret, "ask @Bob".length);
  assert.equal(text.slice(0, caret), "ask @Bob");
  assert.equal(text.slice(caret), " please");
});

test("composer chips stay chips; unresolved @text stays text", () => {
  const picked = new Map<string, string>([["alice", "alice"]]);
  const names = pickedChipNames(picked);
  const pieces = splitMentions("hi @Alice and @Nope", names);
  const mentions = pieces.filter((p) => p.type === "mention");
  assert.equal(mentions.length, 2);
  assert.equal(mentions[0]?.resolved, true);
  assert.equal(mentions[0]?.value, "@Alice");
  assert.equal(mentions[1]?.resolved, false);
  assert.equal(mentions[1]?.value, "@Nope");
});

test("typed prefix of a picked name is not a chip and does not send an id", () => {
  const picked = new Map<string, string>([["alice", "alice"]]);
  const pieces = splitMentions("hi @Al", pickedChipNames(picked));
  const mentions = pieces.filter((p) => p.type === "mention");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0]?.resolved, false);
  assert.deepEqual(mentionIdsInText("hi @Al", picked), []);
  assert.deepEqual(mentionIdsInText("hi @Alice", picked), ["alice"]);
});

test("mentionTrigger finds the open @query at the caret", () => {
  assert.deepEqual(mentionTrigger("hi @Al", 6), { start: 3, query: "Al" });
  assert.equal(mentionTrigger("hi @Al ", 7), null);
});

test("1:1 transcripts hide peer senders", () => {
  const alice = { id: "alice", kind: "agent" };
  const channel = { id: "snorlax-bot-group", kind: "channel" };
  assert.equal(
    isTranscriptVisible({ senderId: "user", role: "user" }, alice),
    true,
  );
  assert.equal(isTranscriptVisible({ senderId: "alice" }, alice), true);
  assert.equal(isTranscriptVisible({ senderId: "bob" }, alice), false);
  assert.equal(isTranscriptVisible({ senderId: "bob" }, channel), true);
});
