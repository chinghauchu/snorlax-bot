// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chatRowPreview } from "./chatDraftPreview.ts";
import {
  GENERATING_LABEL,
  TYPING_HINT,
  activeGeneratingChat,
  chatListLine,
  generatingDotsShouldPulse,
  showGeneratingDots,
} from "./chatGenerating.ts";
import { WAITING_LABEL, waitingDotsShouldPulse } from "./waiting.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "chatGenerating.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatGenerating.swift"),
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
  "v0.93 sidebar generating indicator (while an assistant reply the client started is in flight, that chat's sidebar row shows a small muted animated ··· in place of its relative time and a muted Typing… preview; Draft: still wins the preview for a non-open chat with a draft and the dots stay; Reduce Motion paints static dots; it clears when the reply completes, is Stopped, or errors, and the unread dot takes over if that chat is not open; pins and the Unread filter stay; the iOS chat list matches; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function reducedMotionForDots(): string {
  const needle = "@media (prefers-reduced-motion: reduce)";
  let from = 0;
  while (true) {
    const idx = css.indexOf(needle, from);
    assert.ok(idx >= 0, "missing Reduce Motion block");
    const start = css.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = css.slice(idx, end + 1);
    if (body.includes(".waiting-dots span")) return body;
    from = end + 1;
  }
}

test("the in-flight chat is the one the client started", () => {
  assert.equal(TYPING_HINT, "Typing…");
  assert.equal(GENERATING_LABEL, "···");
  assert.equal(GENERATING_LABEL, WAITING_LABEL);
  assert.equal(activeGeneratingChat({ busy: false, chatId: "seed" }), null);
  assert.equal(activeGeneratingChat({ busy: true, chatId: null }), null);
  assert.equal(activeGeneratingChat({ busy: true, chatId: "" }), null);
  assert.equal(activeGeneratingChat({ busy: true, chatId: "seed" }), "seed");
  assert.equal(showGeneratingDots(false), false);
  assert.equal(showGeneratingDots(true), true);
  assert.equal(generatingDotsShouldPulse(true), false);
  assert.equal(generatingDotsShouldPulse(false), true);
  assert.equal(
    generatingDotsShouldPulse(true),
    waitingDotsShouldPulse(true),
  );
});

test("Draft: wins the preview; Typing… covers the in-flight chat", () => {
  const draft = chatRowPreview({
    chatId: "other",
    openChatId: "seed",
    draft: "unsent note",
    lastMessage: "pong",
  });
  assert.deepEqual(
    chatListLine({ preview: draft, generating: true, chatId: "other" }),
    { kind: "draft", prefix: "Draft:", text: "unsent note" },
  );

  const openDraft = chatRowPreview({
    chatId: "seed",
    openChatId: "seed",
    draft: "still typing here",
    lastMessage: "pong",
  });
  assert.deepEqual(
    chatListLine({ preview: openDraft, generating: true, chatId: "seed" }),
    { kind: "typing", text: "Typing…" },
  );
  assert.deepEqual(
    chatListLine({ preview: openDraft, generating: false, chatId: "seed" }),
    { kind: "message", text: "pong" },
  );

  const blank = chatRowPreview({
    chatId: "other",
    openChatId: "seed",
    draft: " \n\t",
    lastMessage: "pong",
  });
  assert.deepEqual(
    chatListLine({ preview: blank, generating: true, chatId: "other" }),
    { kind: "typing", text: "Typing…" },
  );
  assert.deepEqual(
    chatListLine({ preview: null, generating: true, chatId: "other" }),
    { kind: "typing", text: "Typing…" },
  );
  assert.equal(
    chatListLine({ preview: null, generating: false, chatId: "other" }),
    null,
  );
  assert.equal(
    chatListLine({ preview: null, generating: true, chatId: "" }),
    null,
  );
  assert.equal(showGeneratingDots(true), true);
});

test("the sidebar paints dots in the time slot and keeps neighbors", () => {
  const dots = block(".row-generating");
  assert.match(dots, /font-size:\s*12px/);
  assert.match(dots, /color:\s*var\(--text-muted\)/);
  assert.match(dots, /margin-left:\s*auto/);
  assert.match(dots, /white-space:\s*nowrap/);
  const typing = block(".row-typing");
  assert.match(typing, /color:\s*var\(--text-muted\)/);
  const reduce = reducedMotionForDots();
  assert.match(reduce, /\.waiting-dots span \{[\s\S]*animation:\s*none/);

  assert.match(app, /from "\.\/chatGenerating"/);
  assert.match(app, /activeGeneratingChat\(\{ busy: true, chatId: streamChatId \}\)/);
  assert.match(app, /activeGeneratingChat\(\{ busy: false, chatId: streamChatId \}\)/);
  assert.match(app, /const streamChatId = active\.id/);
  assert.match(app, /noteReplyUnread\(streamChatId\)/);
  assert.match(app, /chatRowPreview\(\{/);
  assert.match(app, /chatListLine\(\{/);
  assert.match(app, /showGeneratingDots\(generatingChatId === agent\.id\)/);
  assert.match(app, /className="row-generating waiting-dots"/);
  assert.match(app, /className="row-typing"/);
  assert.match(app, /aria-label=\{TYPING_HINT\}/);
  assert.match(app, /className="row-time"/);
  assert.match(app, /className="row-draft-prefix"/);
  assert.match(app, /className="unread-dot" aria-label="Unread"/);
  assert.match(app, /className="roster-filter"/);
  assert.match(app, /className=\{pinned \? "row-pin pinned" : "row-pin"\}/);
  assert.match(app, /className="waiting"/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);

  assert.match(swift, /static let hint = "Typing…"/);
  assert.match(swift, /WaitingChrome\.shouldPulse/);
  assert.match(swift, /ChatDraftPreview\.row/);
  assert.match(swift, /kind == \.draft/);
  assert.match(swift, /No new HTTP/);
  assert.match(swift, /struct GeneratingDots/);
  assert.match(swift, /accessibilityReduceMotion/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);

  assert.match(list, /GeneratingDots\(\)/);
  assert.match(list, /ChatGenerating\.hint/);
  assert.match(list, /ChatGenerating\.showsDots/);
  assert.match(list, /model\.generatingChatID == agent\.id/);
  assert.match(list, /ChatDraftPreview\.prefix/);
  assert.match(list, /ChatListTime\.label/);
  assert.match(list, /showsUnreadDot\(agent\)/);
  assert.match(list, /toggleChatPin\(agent\.id\)/);
  assert.match(model, /var generatingChatID: String\?/);
  assert.match(model, /generatingChatID = originAgentID/);
  assert.match(model, /generatingChatID = agent\.id/);
  assert.match(model, /generatingChatID = nil/);
  assert.match(model, /ChatGenerating\.line\(/);
  assert.match(model, /openChatId: onScreenChatID\(\)/);
  assert.match(model, /generating: generatingChatID == agentId/);
  assert.doesNotMatch(model, /computerPane\.ts/);

  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(pkg, /"version": "0\.18\.0"/);
  assert.match(pkg, /chatGenerating\.test\.ts/);
  assert.match(ci, /test_ios_chat_generating\.py/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v0\.93 /);
  assert.match(roadmap, /sidebar generating indicator/);
  assert.match(spec, /## 94\. v0\.93/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
});
