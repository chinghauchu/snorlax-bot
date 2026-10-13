// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CHAT_LAST_SEEN_KEY,
  ChatLastSeen,
  NEW_MESSAGES_LABEL,
  anchorsNewMessages,
  browserLastSeenStorage,
  clearNewMessages,
  freshNewMessagesPlace,
  lastSeenKey,
  newMessagesAnchorIndex,
  parseChatLastSeen,
  placeNewMessages,
  serializeChatLastSeen,
  type DividerRow,
  type LastSeenStorage,
} from "./newMessages.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "newMessages.ts"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "NewMessages.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE =
  "v0.76 new messages divider (a thin muted New messages line above the first assistant reply that arrived since you last viewed that chat; the same not-open or unfocused condition as the unread dot; computed once on open and it stays put; cleared when you come back with nothing new or when you Send; your own bubbles and collapsed tool lines do not anchor it; a day separator stays above it; desktop local storage; iOS UserDefaults; no animation; no new HTTP)";

class MemoryStorage implements LastSeenStorage {
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

function row(
  id: string,
  anchor: boolean,
): DividerRow {
  return { id, anchor };
}

test("the line sits above the first new LEFT message", () => {
  const rows = [
    row("old", false),
    row("seen", true),
    row("mine", false),
    row("tool", false),
    row("fresh", true),
    row("later", true),
  ];
  assert.equal(newMessagesAnchorIndex(rows, null), null);
  assert.equal(newMessagesAnchorIndex(rows, "missing"), null);
  assert.equal(newMessagesAnchorIndex(rows, "later"), null);
  assert.equal(newMessagesAnchorIndex(rows, "seen"), 4);
  assert.equal(newMessagesAnchorIndex([row("only-mine", false)], "gone"), null);
  assert.equal(
    newMessagesAnchorIndex(
      [row("seen", true), row("mine", false)],
      "seen",
    ),
    null,
  );
});

test("user bubbles and collapsed tools do not anchor", () => {
  assert.equal(
    anchorsNewMessages({ role: "assistant", kind: "message", content: "hi" }),
    true,
  );
  assert.equal(
    anchorsNewMessages({
      role: "assistant",
      kind: "message",
      content: "",
      attachments: [{ id: "a" }],
    }),
    true,
  );
  assert.equal(
    anchorsNewMessages({ role: "user", kind: "message", content: "hi" }),
    false,
  );
  assert.equal(
    anchorsNewMessages({ senderId: "user", kind: "message", content: "hi" }),
    false,
  );
  assert.equal(
    anchorsNewMessages({
      role: "assistant",
      kind: "tool",
      content: "Ran ls",
      collapsedTool: true,
    }),
    false,
  );
  assert.equal(
    anchorsNewMessages({
      role: "assistant",
      kind: "message",
      content: "hi",
      collapsedTool: true,
    }),
    false,
  );
  assert.equal(
    anchorsNewMessages({
      role: "assistant",
      kind: "message",
      content: "hi",
      visible: false,
    }),
    false,
  );
  assert.equal(
    anchorsNewMessages({ role: "assistant", kind: "widget", content: "Pick" }),
    false,
  );
  assert.equal(
    anchorsNewMessages({ role: "assistant", kind: "message", content: "" }),
    false,
  );
});

test("opening computes once; Send clears; nothing new keeps a placed line", () => {
  const seen = [row("a", true)];
  const opened = placeNewMessages({
    place: freshNewMessagesPlace(),
    key: "chat",
    rows: [...seen, row("b", false), row("c", true)],
    lastSeenId: "a",
    returning: true,
  });
  assert.equal(opened.anchorId, "c");
  const grew = placeNewMessages({
    place: opened,
    key: "chat",
    rows: [...seen, row("b", false), row("c", true), row("d", true)],
    lastSeenId: "d",
    returning: false,
  });
  assert.equal(grew.anchorId, "c");
  assert.equal(grew, opened);

  const refocus = placeNewMessages({
    place: opened,
    key: "chat",
    rows: [...seen, row("b", false), row("c", true), row("d", true)],
    lastSeenId: "c",
    returning: true,
  });
  assert.equal(refocus.anchorId, "d");

  const quiet = placeNewMessages({
    place: refocus,
    key: "chat",
    rows: [...seen, row("c", true), row("d", true)],
    lastSeenId: "d",
    returning: true,
  });
  assert.equal(quiet.anchorId, "d");

  const away = placeNewMessages({
    place: { key: "other", placed: false, anchorId: null },
    key: "chat",
    rows: [...seen, row("c", true), row("d", true)],
    lastSeenId: "d",
    returning: true,
  });
  assert.equal(away.anchorId, null);

  const sent = clearNewMessages(opened);
  assert.equal(sent.anchorId, null);
  assert.equal(sent.placed, true);
  const watched = placeNewMessages({
    place: sent,
    key: "chat",
    rows: [row("c", true), row("e", true)],
    lastSeenId: "e",
    returning: false,
  });
  assert.equal(watched.anchorId, null);
});

test("last seen persists per chat and drops deleted chats", () => {
  const memory = new MemoryStorage();
  const seen = new ChatLastSeen(memory);
  assert.equal(seen.see("agent-a", null, "m1"), true);
  assert.equal(seen.see("agent-a", null, "m1"), false);
  assert.equal(seen.see("agent-a", "thread", "m2"), true);
  assert.equal(seen.get("agent-a", null), "m1");
  assert.equal(seen.get("agent-a", "thread"), "m2");
  assert.equal(seen.see("", null, "m"), false);
  assert.equal(seen.see("agent-a", null, ""), false);

  const revived = new ChatLastSeen(memory);
  assert.equal(revived.get("agent-a", null), "m1");
  assert.equal(revived.retain(new Set(["agent-a"])), false);
  assert.equal(revived.retain(new Set(["agent-b"])), true);
  assert.equal(new ChatLastSeen(memory).get("agent-a", null), null);

  assert.equal(parseChatLastSeen(null).size, 0);
  assert.equal(parseChatLastSeen("{").size, 0);
  assert.equal(parseChatLastSeen("[]").size, 0);
  assert.equal(parseChatLastSeen("{}").size, 0);
  const raw = JSON.stringify({
    [lastSeenKey("agent-a", null)]: "m1",
    bad: "x",
    [lastSeenKey("agent-b", "t")]: "",
  });
  const parsed = parseChatLastSeen(raw);
  assert.equal(parsed.size, 1);
  assert.equal(parsed.get(lastSeenKey("agent-a", null)), "m1");
  assert.equal(
    serializeChatLastSeen(parsed),
    JSON.stringify({ [lastSeenKey("agent-a", null)]: "m1" }),
  );
  assert.equal(CHAT_LAST_SEEN_KEY, "snorlax.chatLastSeen");
  assert.equal(NEW_MESSAGES_LABEL, "New messages");

  const boom: LastSeenStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  const local = new ChatLastSeen(boom);
  assert.equal(local.see("agent-a", null, "m1"), true);
  assert.equal(local.get("agent-a", null), "m1");
  assert.equal(browserLastSeenStorage(), null);
});

test("desktop paints the line under a day separator and clears it on Send", () => {
  assert.match(app, /from "\.\/newMessages"/);
  assert.match(app, /new ChatLastSeen\(browserLastSeenStorage\(\)\)/);
  assert.match(app, /placeNewMessages\(/);
  assert.match(app, /className="new-messages" role="separator"/);
  assert.match(app, /\{NEW_MESSAGES_LABEL\}/);

  const send = sliceFn(app, "async function onSend()", "async function answerWidget(");
  assert.match(send, /clearNewMessages\(newMessagesPlace\.current\)/);
  assert.match(send, /setDividerAnchorId\(null\)/);

  const focus = sliceFn(app, "const syncFocus = () => {", "window.addEventListener");
  assert.match(focus, /watchingNewMessages\.current = false/);
  assert.match(focus, /setDividerTick\(\(n\) => n \+ 1\)/);

  const load = sliceFn(
    app,
    "async function loadConversation(",
    "async function selectAgent(",
  );
  assert.match(load, /beginNewMessagesLoad\(id, thread\)/);
  assert.match(load, /finishNewMessagesLoad\(epoch\)/);

  const handoff = app.indexOf('className="handoff-row"');
  const handoffDay = app.lastIndexOf('className="day-separator"', handoff);
  const handoffLine = app.lastIndexOf("<NewMessagesDivider", handoff);
  assert.ok(handoffDay >= 0 && handoffDay < handoffLine && handoffLine < handoff);

  const article = app.indexOf("className={`turn");
  const articleDay = app.lastIndexOf('className="day-separator"', article);
  const articleLine = app.lastIndexOf("<NewMessagesDivider", article);
  assert.ok(articleDay >= 0 && articleDay < articleLine && articleLine < article);

  const blockStart = css.indexOf(".new-messages {");
  assert.ok(blockStart >= 0);
  const block = css.slice(blockStart, css.indexOf(".turn {", blockStart));
  assert.match(block, /height:\s*1px/);
  assert.match(block, /var\(--text-muted\)/);
  assert.doesNotMatch(block, /animation/);
  assert.doesNotMatch(block, /transition/);

  assert.match(swift, /static let label = "New messages"/);
  assert.match(swift, /snorlax\.chatLastSeen/);
  assert.match(chat, /NewMessagesDivider\(\)/);
  // v0.85 pins the day line as the section header. The divider stays
  // in that section's body, above the transcript row.
  const pinned = chat.indexOf("pinnedViews: [.sectionHeaders]");
  const lineAt = chat.indexOf("NewMessagesDivider()");
  const itemAt = chat.indexOf("transcriptItem(", lineAt);
  const dayAt = chat.indexOf("if let dayLabel = group.label");
  assert.ok(pinned >= 0 && pinned < lineAt && lineAt < itemAt && itemAt < dayAt);
});

test("OpenAPI stays 0.18.0; last seen is local; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(src, /localStorage/);
  assert.match(src, /CHAT_LAST_SEEN_KEY = "snorlax\.chatLastSeen"/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(pkg, /newMessages\.test\.ts/);
  assert.match(ci, /test_ios_new_messages\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
