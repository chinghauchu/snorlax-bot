// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PREVIEW_LIMIT,
  applyFinishedPreview,
  isPreferredKind,
  lastMessagePreview,
  oneLine,
  previewOwnsMessages,
  rememberChatPreview,
  retainChatPreviews,
  snapshotChatPreview,
  type PreviewMessage,
} from "./lastMessagePreview.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "lastMessagePreview.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "LastMessagePreview.swift"),
  "utf8",
);
const list = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AgentListView.swift"),
  "utf8",
);
const model = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AppModel.swift"),
  "utf8",
);

const PHRASE =
  "v0.80 sidebar last-message preview (under each chat or agent name, one muted truncated line of the latest user or assistant text; prefer kind=message; skip tool, widget, approve, and connect chrome with no useful text; empty chats show no preview; updates when a send completes or an assistant reply finishes from messages already in memory; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function msg(partial: PreviewMessage): PreviewMessage {
  return partial;
}

test("latest kind=message wins; empty chrome is skipped", () => {
  assert.equal(isPreferredKind("message"), true);
  assert.equal(isPreferredKind(undefined), true);
  assert.equal(isPreferredKind("handoff"), true);
  assert.equal(isPreferredKind("tool"), false);
  assert.equal(isPreferredKind("widget"), false);
  assert.equal(isPreferredKind("approve"), false);
  assert.equal(isPreferredKind("connect"), false);

  assert.equal(
    lastMessagePreview([
      msg({ kind: "message", content: "ping" }),
      msg({ kind: "message", content: "pong" }),
    ]),
    "pong",
  );
  assert.equal(
    lastMessagePreview([
      msg({ kind: "message", content: "See you" }),
      msg({ kind: "tool", content: "Read a.ts" }),
    ]),
    "See you",
  );
  assert.equal(
    lastMessagePreview([
      msg({ kind: "message", content: "See you" }),
      msg({ kind: "widget", content: "", widget: { prompt: "" } }),
      msg({ kind: "approve", content: "", approve: { command: "" } }),
      msg({ kind: "connect", content: "", connect: { prompt: "" } }),
    ]),
    "See you",
  );
  assert.equal(lastMessagePreview([]), null);
  assert.equal(
    lastMessagePreview([msg({ kind: "message", content: "  \n\t" })]),
    null,
  );
  assert.equal(
    lastMessagePreview([msg({ kind: "widget", content: "" })]),
    null,
  );
});

test("chrome with useful text is the fallback; attachments and handoff count", () => {
  assert.equal(
    lastMessagePreview([msg({ kind: "tool", content: "Read a.ts" })]),
    "Read a.ts",
  );
  assert.equal(
    lastMessagePreview([
      msg({ kind: "widget", content: "", widget: { prompt: "Pick a color" } }),
    ]),
    "Pick a color",
  );
  assert.equal(
    lastMessagePreview([
      msg({ kind: "approve", content: "", approve: { command: "rm tmp" } }),
    ]),
    "rm tmp",
  );
  assert.equal(
    lastMessagePreview([
      msg({
        kind: "connect",
        content: "",
        connect: { prompt: "Connect Slack" },
      }),
    ]),
    "Connect Slack",
  );
  assert.equal(
    lastMessagePreview([
      msg({
        kind: "message",
        content: "",
        attachments: [{ kind: "image", name: "shot.png" }],
      }),
    ]),
    "shot.png",
  );
  assert.equal(
    lastMessagePreview([
      msg({
        kind: "message",
        content: "",
        attachments: [{ kind: "image", name: "  " }],
      }),
    ]),
    "Image",
  );
  assert.equal(
    lastMessagePreview([
      msg({ kind: "message", content: "", images: [{}] }),
    ]),
    "Image",
  );
  assert.equal(
    lastMessagePreview([
      msg({
        kind: "message",
        content: "",
        attachments: [{ kind: "video", name: "" }],
      }),
    ]),
    "Video",
  );
  assert.equal(
    lastMessagePreview([
      msg({ kind: "handoff", userAsk: "Can you check?", content: "ignored" }),
    ]),
    "Can you check?",
  );
  assert.equal(
    lastMessagePreview([
      msg({
        kind: "message",
        content: "from Ada: hello",
        senderName: "Ada",
      }),
    ]),
    "hello",
  );
});

test("one line collapses whitespace and ellipsizes past the cap", () => {
  assert.equal(PREVIEW_LIMIT, 120);
  assert.equal(oneLine("hello\n\nworld"), "hello world");
  assert.equal(oneLine("   "), "");
  const long = "a".repeat(PREVIEW_LIMIT + 10);
  const line = oneLine(long);
  assert.equal(line.length, PREVIEW_LIMIT);
  assert.ok(line.endsWith("…"));
  assert.equal(
    lastMessagePreview([msg({ kind: "message", content: "hello\n\nworld" })]),
    "hello world",
  );
});

test("preview updates from memory without opening that chat again", () => {
  assert.equal(snapshotChatPreview(null), true);
  assert.equal(snapshotChatPreview(undefined), true);
  assert.equal(snapshotChatPreview("thread-1"), false);
  assert.equal(previewOwnsMessages("a", []), true);
  assert.equal(previewOwnsMessages("a", [{ agentId: "a" }]), true);
  assert.equal(
    previewOwnsMessages("a", [{ agentId: "a" }, { agentId: "b" }]),
    false,
  );
  assert.equal(previewOwnsMessages("", [{ agentId: "a" }]), false);

  const afterSend = rememberChatPreview({}, "a", [
    msg({ kind: "message", content: "ping", agentId: "a" }),
  ]);
  assert.deepEqual(afterSend, { a: "ping" });
  const afterReply = applyFinishedPreview(afterSend, "a", {
    kind: "message",
    content: "pong",
  });
  assert.deepEqual(afterReply, { a: "pong" });
  const toolDoesNotClobber = applyFinishedPreview(afterReply, "a", {
    kind: "tool",
    content: "Read a.ts",
  });
  assert.deepEqual(toolDoesNotClobber, { a: "pong" });
  const otherChat = applyFinishedPreview(toolDoesNotClobber, "b", {
    kind: "message",
    content: "yo",
  });
  assert.deepEqual(otherChat, { a: "pong", b: "yo" });
  assert.deepEqual(
    rememberChatPreview(otherChat, "b", []),
    { a: "pong" },
  );
  assert.deepEqual(
    retainChatPreviews({ a: "pong", b: "yo" }, new Set(["a"])),
    { a: "pong" },
  );
  const kept = { a: "pong" };
  assert.equal(retainChatPreviews(kept, new Set(["a"])), kept);
  assert.equal(
    rememberChatPreview(kept, "a", [msg({ kind: "message", content: "pong" })]),
    kept,
  );
});

test("sidebar row is one muted truncated line; OpenAPI stays 0.18.0", () => {
  const preview = block(".row-preview");
  assert.match(preview, /font-size:\s*12px/);
  assert.match(preview, /color:\s*var\(--text-muted\)/);
  assert.match(preview, /text-overflow:\s*ellipsis/);
  assert.match(preview, /white-space:\s*nowrap/);
  assert.match(preview, /overflow:\s*hidden/);
  const row = block(".row");
  assert.match(row, /min-height:\s*44px/);
  assert.match(row, /height:\s*auto/);

  assert.match(app, /from "\.\/lastMessagePreview"/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /rememberChatPreview\(/);
  assert.match(app, /applyFinishedPreview\(/);
  assert.match(app, /snapshotChatPreview\(/);
  assert.match(app, /previewOwnsMessages\(/);
  assert.match(app, /previewLive\.current = false/);
  assert.match(app, /previewLive\.current = snapshotChatPreview\(thread\)/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /prefer kind=message/);
  assert.match(swift, /No new HTTP/);
  assert.match(swift, /static let limit = 120/);
  assert.match(list, /chatPreviews\[agent\.id\]/);
  assert.match(list, /lineLimit\(1\)/);
  assert.match(model, /noteChatPreview\(/);
  assert.match(model, /noteFinishedPreview\(/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /lastMessagePreview\.test\.ts/);
  assert.match(ci, /test_ios_last_message_preview\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /v0\.80/);
});
