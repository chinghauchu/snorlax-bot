// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ChatDrafts } from "./chatDrafts.ts";
import {
  DRAFT_PREFIX,
  chatRowPreview,
  visibleDraftText,
} from "./chatDraftPreview.ts";
import { PREVIEW_LIMIT, oneLine } from "./lastMessagePreview.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatDraftPreview.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatDraftPreview.swift"),
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
  "v0.91 draft hint in the chat list (when a chat other than the one currently open has unsent composer text from the v0.64/v0.69 per-chat drafts, its v0.80 last-message preview reads a muted-accent Draft: prefix followed by that draft on one truncated line; whitespace-only drafts do not count; clearing or sending the draft restores the last-message preview; the open chat's row keeps its normal preview; relative time, the unread dot, the Unread filter, pins, and mark unread stay; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("whitespace-only drafts do not count; a real draft is one truncated line", () => {
  assert.equal(DRAFT_PREFIX, "Draft:");
  assert.equal(visibleDraftText(null), null);
  assert.equal(visibleDraftText(""), null);
  assert.equal(visibleDraftText("   \n\t"), null);
  assert.equal(visibleDraftText("hello\n\nthere"), "hello there");

  const long = "word ".repeat(40);
  const text = visibleDraftText(long);
  assert.ok(text);
  assert.equal(text, oneLine(long));
  assert.ok(text!.endsWith("…"));
  assert.ok(text!.length <= PREVIEW_LIMIT);

  const drafts = new ChatDrafts();
  drafts.set("other", null, "  \n ");
  assert.equal(visibleDraftText(drafts.get("other", null)), null);
  drafts.set("other", null, "follow up");
  assert.equal(visibleDraftText(drafts.get("other", null)), "follow up");
  drafts.clear("other", null);
  assert.equal(drafts.get("other", null), "");
  assert.equal(visibleDraftText(drafts.get("other", null)), null);
  drafts.set("other", "thread-1", "thread only");
  assert.equal(drafts.get("other", null), "");
});

test("a closed chat shows Draft:; the open chat keeps the last message", () => {
  assert.deepEqual(
    chatRowPreview({
      chatId: "other",
      openChatId: "seed",
      draft: "unsent note",
      lastMessage: "pong",
    }),
    { kind: "draft", prefix: "Draft:", text: "unsent note" },
  );
  assert.deepEqual(
    chatRowPreview({
      chatId: "other",
      openChatId: null,
      draft: "unsent note",
      lastMessage: "pong",
    }),
    { kind: "draft", prefix: "Draft:", text: "unsent note" },
  );
  assert.deepEqual(
    chatRowPreview({
      chatId: "other",
      openChatId: "seed",
      draft: "only a draft",
      lastMessage: null,
    }),
    { kind: "draft", prefix: "Draft:", text: "only a draft" },
  );
  assert.deepEqual(
    chatRowPreview({
      chatId: "seed",
      openChatId: "seed",
      draft: "unsent note",
      lastMessage: "pong",
    }),
    { kind: "message", text: "pong" },
  );
  assert.equal(
    chatRowPreview({
      chatId: "seed",
      openChatId: "seed",
      draft: "unsent note",
      lastMessage: "  ",
    }),
    null,
  );
  assert.deepEqual(
    chatRowPreview({
      chatId: "other",
      openChatId: "seed",
      draft: " \n\t",
      lastMessage: "pong",
    }),
    { kind: "message", text: "pong" },
  );
  assert.deepEqual(
    chatRowPreview({
      chatId: "other",
      openChatId: "seed",
      draft: "",
      lastMessage: "pong",
    }),
    { kind: "message", text: "pong" },
  );
  assert.equal(
    chatRowPreview({
      chatId: "other",
      openChatId: "seed",
      draft: "",
      lastMessage: "",
    }),
    null,
  );
  assert.deepEqual(
    chatRowPreview({
      chatId: "",
      openChatId: "",
      draft: "ghost",
      lastMessage: "pong",
    }),
    { kind: "message", text: "pong" },
  );
});

test("the sidebar paints the hint and keeps time, unread, filter, and pins", () => {
  const prefix = block(".row-draft-prefix");
  assert.match(prefix, /color:\s*color-mix\(in srgb, var\(--accent\) 70%, var\(--text-muted\)\)/);
  const preview = block(".row-preview");
  assert.match(preview, /color:\s*var\(--text-muted\)/);
  assert.match(preview, /text-overflow:\s*ellipsis/);
  assert.match(preview, /white-space:\s*nowrap/);

  assert.match(app, /from "\.\/chatDraftPreview"/);
  assert.match(app, /chatRowPreview\(\{/);
  assert.match(app, /openChatId: activeId/);
  assert.match(app, /draft: chatDrafts\.current\.get\(agent\.id, null\)/);
  assert.match(app, /className="row-preview"/);
  assert.match(app, /className="row-draft-prefix"/);
  assert.match(app, /shown\.kind === "draft"/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /className="roster-filter"/);
  assert.match(app, /className=\{pinned \? "row-pin pinned" : "row-pin"\}/);
  assert.match(app, /chatDrafts\.current\.clear\(/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let prefix = "Draft:"/);
  assert.match(swift, /visibleDraftText/);
  assert.match(swift, /LastMessagePreview\.oneLine/);
  assert.match(swift, /threadId: nil|nil thread/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(list, /model\.chatListPreview\(\s*for: agent\.id,\s*lastMessage: model\.chatPreviews\[agent\.id\]\s*\)/);
  assert.match(list, /ChatDraftPreview\.prefix/);
  assert.match(list, /Color\.accentColor\.opacity\(0\.72\)/);
  assert.match(list, /muted-accent/);
  assert.match(list, /lineLimit\(1\)/);
  assert.match(list, /truncationMode\(\.tail\)/);
  assert.match(list, /ChatListTime\.label/);
  assert.match(list, /showsUnreadDot\(agent\)/);
  assert.match(list, /toggleChatPin\(agent\.id\)/);
  assert.match(list, /toggleChatRead\(agent\.id\)/);
  assert.match(list, /ChatListFilter\.groupLabel/);
  assert.match(model, /func chatListPreview\(for agentId: String, lastMessage: String\?\)/);
  assert.match(model, /openChatId: onScreenChatID\(\)/);
  assert.match(model, /chatDrafts\.text\(agentId: agentId, threadId: nil\)/);
  assert.match(model, /lastMessage: lastMessage/);
  assert.match(model, /func toggleChatRead\(_ id: String\)/);
  assert.match(model, /func toggleChatPin\(_ id: String\)/);
  assert.doesNotMatch(model, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatDraftPreview\.test\.ts/);
  assert.match(ci, /test_ios_chat_draft_preview\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.91 /);
  assert.match(spec, /## 92\. v0\.91/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
