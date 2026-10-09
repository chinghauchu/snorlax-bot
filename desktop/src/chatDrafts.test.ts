// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ChatDrafts, chatDraftKey } from "./chatDrafts.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatDrafts.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE =
  "v0.64 per-chat composer drafts (switch keeps each chat's unsent text; Send clears; failed Send restores to its own chat; no new HTTP)";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("per-chat separation: text typed in A does not follow into B", () => {
  const drafts = new ChatDrafts();
  drafts.set("agent-a", null, "hello A");
  drafts.set("agent-b", null, "hello B");
  assert.equal(drafts.get("agent-a", null), "hello A");
  assert.equal(drafts.get("agent-b", null), "hello B");
  assert.notEqual(
    chatDraftKey("agent-a", null),
    chatDraftKey("agent-b", null),
  );

  const shown = drafts.swap(
    { agentId: "agent-a", threadId: null },
    "hello A edited",
    { agentId: "agent-b", threadId: null },
  );
  assert.equal(shown, "hello B");
  assert.equal(drafts.get("agent-a", null), "hello A edited");
  assert.equal(drafts.get("agent-b", null), "hello B");

  const back = drafts.swap(
    { agentId: "agent-b", threadId: null },
    "hello B",
    { agentId: "agent-a", threadId: null },
  );
  assert.equal(back, "hello A edited");
});

test("thread and top-level timelines keep separate drafts", () => {
  const drafts = new ChatDrafts();
  assert.notEqual(chatDraftKey("chan", null), chatDraftKey("chan", "thread-1"));
  drafts.set("chan", null, "timeline");
  drafts.set("chan", "thread-1", "in the thread");
  assert.equal(drafts.get("chan", null), "timeline");
  assert.equal(drafts.get("chan", "thread-1"), "in the thread");
  assert.equal(drafts.get("chan", "thread-2"), "");

  const timeline = drafts.swap(
    { agentId: "chan", threadId: "thread-1" },
    "thread more",
    { agentId: "chan", threadId: null },
  );
  assert.equal(timeline, "timeline");
  assert.equal(drafts.get("chan", "thread-1"), "thread more");

  const again = drafts.swap(
    { agentId: "chan", threadId: null },
    "timeline",
    { agentId: "chan", threadId: "thread-1" },
  );
  assert.equal(again, "thread more");
});

test("successful Send clears that conversation's draft only", () => {
  const drafts = new ChatDrafts();
  drafts.set("agent-a", null, "send me");
  drafts.set("agent-a", "thread-1", "leave the thread draft");
  drafts.set("agent-b", null, "leave B");
  drafts.clear("agent-a", null);
  assert.equal(drafts.get("agent-a", null), "");
  assert.equal(drafts.get("agent-a", "thread-1"), "leave the thread draft");
  assert.equal(drafts.get("agent-b", null), "leave B");
});

test("failed Send restores text to the original chat, not the open one", () => {
  const drafts = new ChatDrafts();
  drafts.set("agent-a", null, "typed in A");
  drafts.clear("agent-a", null);
  const shown = drafts.swap(
    { agentId: "agent-a", threadId: null },
    "",
    { agentId: "agent-b", threadId: null },
  );
  assert.equal(shown, "");
  drafts.set("agent-b", null, "typed in B");
  drafts.restore("agent-a", null, "typed in A");
  assert.equal(drafts.get("agent-a", null), "typed in A");
  assert.equal(drafts.get("agent-b", null), "typed in B");

  drafts.restore("agent-a", "thread-9", "thread fail");
  assert.equal(drafts.get("agent-a", null), "typed in A");
  assert.equal(drafts.get("agent-a", "thread-9"), "thread fail");
  assert.equal(drafts.get("agent-b", null), "typed in B");
});

test("same conversation keeps the live text; missing draft is empty", () => {
  const drafts = new ChatDrafts();
  drafts.set("agent-a", null, "stored");
  const live = drafts.swap(
    { agentId: "agent-a", threadId: null },
    "still typing",
    { agentId: "agent-a", threadId: null },
  );
  assert.equal(live, "still typing");
  assert.equal(drafts.get("agent-a", null), "stored");

  const fresh = drafts.swap(
    null,
    "",
    { agentId: "new-agent", threadId: null },
  );
  assert.equal(fresh, "");
});

test("desktop swaps on loadConversation, clears on Send, restores to the origin chat", () => {
  assert.match(app, /from "\.\/chatDrafts"/);
  assert.match(app, /new ChatDrafts\(\)/);

  const load = sliceFn(
    app,
    "async function loadConversation(",
    "async function selectAgent(",
  );
  assert.match(load, /moveComposer\(id, thread\)/);
  assert.ok(load.indexOf("moveComposer(id, thread)") < load.indexOf("setActiveId(id)"));
  assert.match(load, /setPendingAttachments\(\(prev\)/);
  assert.doesNotMatch(load, /cancelDictation\(/);
  assert.doesNotMatch(load, /stopSpeaking\(/);
  assert.match(load, /focusComposer\(\)/);

  const create = sliceFn(app, "async function onCreate()", "async function onCreateChannel()");
  assert.match(create, /moveComposer\(agent\.id, null\)/);

  const jump = sliceFn(app, "async function openJump(", "async function onCreate()");
  assert.match(jump, /loadConversation\(channelId, nextThread\)/);

  const send = sliceFn(app, "async function onSend()", "async function answerWidget(");
  assert.match(send, /chatDrafts\.current\.clear\(/);
  assert.match(send, /draftOrigin/);
  assert.match(send, /setDraft\(""\)/);
  assert.ok(send.indexOf("chatDrafts.current.clear") < send.indexOf('setDraft("")'));

  const fail = sliceFn(app, "if (userMsg)", "setComposerError(COULDNT_SEND)");
  assert.match(fail, /chatDrafts\.current\.restore\(/);
  assert.match(fail, /opts\.draftOrigin/);
  assert.match(fail, /convoRef\.current/);
  assert.match(fail, /if \(content\) setDraft\(content\)/);
  assert.ok(
    fail.indexOf("here.agentId === origin.agentId") <
      fail.indexOf("if (content) setDraft(content)"),
  );
  assert.match(fail, /setPendingAttachments\(opts\.restoreAttachments\)/);

  assert.match(app, /aria-label="Back to timeline"[\s\S]*loadConversation\(active\.id, null\)/);
  assert.match(pkg, /chatDrafts\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("OpenAPI stays 0.18.0; drafts are in-memory only; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /sessionStorage/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
