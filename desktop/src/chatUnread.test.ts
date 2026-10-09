// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CHAT_UNREAD_KEY,
  ChatUnread,
  browserUnreadStorage,
  isFinishedAssistantReply,
  onScreenChatId,
  parseChatUnread,
  replyMarksUnread,
  serializeChatUnread,
  windowIsFocused,
  type UnreadStorage,
} from "./chatUnread.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatUnread.ts"), "utf8");
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
  "v0.70 unread chat dot (a 6px accent dot on a sidebar row when an assistant reply finishes in a chat that is not open, or while the app/window is not focused; opening that chat clears it; desktop local storage; iOS UserDefaults; no new HTTP)";

class MemoryStorage implements UnreadStorage {
  readonly bag = new Map<string, string>();
  getItem(key: string): string | null {
    return this.bag.has(key) ? (this.bag.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.bag.set(key, value);
  }
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("a finished assistant reply marks a chat that is not open", () => {
  assert.equal(
    replyMarksUnread({ chatId: "agent-a", openChatId: "agent-b", focused: true }),
    true,
  );
  assert.equal(
    replyMarksUnread({ chatId: "agent-a", openChatId: "agent-a", focused: true }),
    false,
  );
  assert.equal(
    replyMarksUnread({ chatId: "agent-a", openChatId: "agent-a", focused: false }),
    true,
  );
  assert.equal(
    replyMarksUnread({ chatId: "agent-a", openChatId: null, focused: true }),
    true,
  );
  assert.equal(
    replyMarksUnread({ chatId: "", openChatId: null, focused: false }),
    false,
  );
});

test("only a non-empty assistant kind=message finishes a reply", () => {
  assert.equal(
    isFinishedAssistantReply({ role: "assistant", kind: "message", content: "hi" }),
    true,
  );
  assert.equal(
    isFinishedAssistantReply({
      senderId: "snorlax-bot",
      content: "hi",
    }),
    true,
  );
  assert.equal(
    isFinishedAssistantReply({
      role: "assistant",
      kind: "message",
      content: "",
      attachments: [{ id: "a" }],
    }),
    true,
  );
  assert.equal(
    isFinishedAssistantReply({ role: "assistant", kind: "message", content: "" }),
    false,
  );
  assert.equal(
    isFinishedAssistantReply({ role: "user", kind: "message", content: "hi" }),
    false,
  );
  assert.equal(
    isFinishedAssistantReply({ senderId: "user", kind: "message", content: "hi" }),
    false,
  );
  assert.equal(
    isFinishedAssistantReply({ role: "assistant", kind: "tool", content: "Ran ls" }),
    false,
  );
  assert.equal(
    isFinishedAssistantReply({ role: "assistant", kind: "widget", content: "Pick" }),
    false,
  );
  assert.equal(
    isFinishedAssistantReply({ role: "assistant", kind: "approve", content: "Run?" }),
    false,
  );
  assert.equal(
    isFinishedAssistantReply({ role: "assistant", kind: "connect", content: "Connect" }),
    false,
  );
});

test("iPhone list has no open chat; iPad detail is the selection", () => {
  assert.equal(
    onScreenChatId({ pad: false, selectedId: "agent-a", navigationLast: null }),
    null,
  );
  assert.equal(
    onScreenChatId({
      pad: false,
      selectedId: "agent-a",
      navigationLast: "agent-a",
    }),
    "agent-a",
  );
  assert.equal(
    onScreenChatId({ pad: true, selectedId: "agent-b", navigationLast: null }),
    "agent-b",
  );
  assert.equal(
    windowIsFocused({ hasFocus: () => true, visibilityState: "visible" }),
    true,
  );
  assert.equal(
    windowIsFocused({ hasFocus: () => true, visibilityState: "hidden" }),
    false,
  );
  assert.equal(
    windowIsFocused({ hasFocus: () => false, visibilityState: "visible" }),
    false,
  );
});

test("unread survives relaunch; opening clears; deleted chats drop", () => {
  const memory = new MemoryStorage();
  const unread = new ChatUnread(memory);
  assert.equal(unread.mark("agent-a"), true);
  assert.equal(unread.mark("agent-a"), false);
  assert.equal(unread.mark("agent-b"), true);
  assert.equal(unread.has("agent-a"), true);

  const revived = new ChatUnread(memory);
  assert.equal(revived.has("agent-a"), true);
  assert.equal(revived.has("agent-b"), true);
  assert.deepEqual(
    [...revived.snapshot()].sort(),
    ["agent-a", "agent-b"],
  );

  assert.equal(revived.clear("agent-a"), true);
  assert.equal(revived.clear("agent-a"), false);
  assert.equal(new ChatUnread(memory).has("agent-a"), false);
  assert.equal(new ChatUnread(memory).has("agent-b"), true);

  const kept = new ChatUnread(memory);
  assert.equal(kept.retain(new Set(["agent-b"])), false);
  assert.equal(kept.retain(new Set()), true);
  assert.equal(new ChatUnread(memory).snapshot().size, 0);

  assert.equal(parseChatUnread(null).size, 0);
  assert.equal(parseChatUnread("").size, 0);
  assert.equal(parseChatUnread("{").size, 0);
  assert.equal(parseChatUnread("{}").size, 0);
  assert.equal(parseChatUnread('["", 1, "agent-a"]').size, 1);
  assert.equal(
    serializeChatUnread(new Set(["b", "a"])),
    '["a","b"]',
  );
  assert.equal(CHAT_UNREAD_KEY, "snorlax.chatUnread");

  const boom: UnreadStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  const local = new ChatUnread(boom);
  assert.equal(local.mark("agent-a"), true);
  assert.equal(local.has("agent-a"), true);
  assert.equal(browserUnreadStorage(), null);
});

test("desktop marks from message.done, clears on open, and paints the existing dot", () => {
  assert.match(app, /from "\.\/chatUnread"/);
  assert.match(app, /new ChatUnread\(browserUnreadStorage\(\)\)/);
  assert.match(app, /const streamChatId = active\.id/);

  const done = sliceFn(app, "onDone(message)", "onError(code, message)");
  assert.match(done, /isFinishedAssistantReply\(message\)/);
  assert.match(done, /noteReplyUnread\(streamChatId\)/);
  assert.ok(
    done.indexOf("noteReplyUnread(streamChatId)") <
      done.indexOf("message.replyTo"),
  );

  const load = sliceFn(
    app,
    "async function loadConversation(",
    "async function selectAgent(",
  );
  assert.match(load, /clearReplyUnread\(id\)/);
  assert.ok(
    load.indexOf("clearReplyUnread(id)") < load.indexOf("setActiveId(id)"),
  );

  const focus = sliceFn(app, "const syncFocus = () => {", "window.addEventListener");
  assert.match(focus, /windowIsFocused\(document\)/);
  assert.match(focus, /clearReplyUnread\(convoRef\.current\.agentId\)/);
  assert.match(app, /visibilitychange/);

  assert.match(
    app,
    /unreadIds\.has\(agent\.id\) \|\| replyUnreadIds\.has\(agent\.id\)/,
  );
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.doesNotMatch(
    app,
    /agent\.kind === "channel" && unreadIds\.has\(agent\.id\)/,
  );

  const remove = sliceFn(app, "async function confirmDelete()", "async function submitTurn(");
  assert.match(remove, /chatUnread\.current\.retain\(/);
  assert.match(remove, /chatUnread\.current\.clear\(next\)/);
});

test("OpenAPI stays 0.18.0; unread is local; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(src, /localStorage/);
  assert.match(src, /CHAT_UNREAD_KEY = "snorlax\.chatUnread"/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /chatUnread\.test\.ts/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
