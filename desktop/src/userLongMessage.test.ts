// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  shouldClampLongMessage,
  showLongMessageToggle,
} from "./longMessage.ts";
import { userLongMessageSettled } from "./userLongMessage.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "userLongMessage.ts"), "utf8");
const view = readFileSync(join(here, "UserMessageClamp.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "UserLongMessage.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);

const PHRASE = "v2.16 collapse long user messages";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

const settledUser = {
  fromUser: true,
  kindMessage: true,
  hasText: true,
  pending: false,
};

test("only a settled user message with text can collapse", () => {
  assert.equal(userLongMessageSettled(settledUser), true);
  assert.equal(userLongMessageSettled({ ...settledUser, pending: true }), false);
  assert.equal(userLongMessageSettled({ ...settledUser, hasText: false }), false);
  assert.equal(userLongMessageSettled({ ...settledUser, fromUser: false }), false);
  assert.equal(userLongMessageSettled({ ...settledUser, kindMessage: false }), false);
  assert.equal(
    userLongMessageSettled({ ...settledUser, hasText: true, pending: false }),
    true,
  );

  const open = {
    overflows: true,
    expanded: false,
    activeFind: false,
  };
  assert.equal(
    shouldClampLongMessage({
      ...open,
      completed: userLongMessageSettled(settledUser),
    }),
    true,
  );
  assert.equal(
    shouldClampLongMessage({
      ...open,
      completed: userLongMessageSettled({ ...settledUser, pending: true }),
    }),
    false,
  );
  assert.equal(
    shouldClampLongMessage({
      completed: true,
      overflows: true,
      expanded: false,
      activeFind: true,
    }),
    false,
  );
  assert.equal(
    shouldClampLongMessage({
      completed: true,
      overflows: true,
      expanded: true,
      activeFind: false,
    }),
    false,
  );
  assert.equal(
    showLongMessageToggle({
      completed: userLongMessageSettled(settledUser),
      overflows: true,
      activeFind: false,
    }),
    true,
  );
  assert.equal(
    showLongMessageToggle({
      completed: userLongMessageSettled({ ...settledUser, pending: true }),
      overflows: true,
      activeFind: false,
    }),
    false,
  );
});

test("desktop and iOS clamp each settled user bubble and keep find visible", () => {
  assert.match(swift, /static func settled\(/);
  assert.match(swift, /fromUser && kindMessage && hasText && !pending/);
  assert.match(swift, /LongMessageBody\(/);
  assert.match(swift, /completed: settled/);
  assert.match(swift, /activeFind: activeFind/);
  assert.match(swift, /No new HTTP/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(src.includes("computerPane.ts"), false);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /fetch\(/);
  assert.match(view, /completed=\{settled\}/);
  assert.match(view, /activeFind=\{activeFind\}/);
  assert.match(view, /<LongMessageBody/);
  assert.doesNotMatch(view, /focusComposer/);
  assert.doesNotMatch(view, /\.focus\(/);
  assert.doesNotMatch(view, /\/v1\//);

  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.match(user, /<UserMessageClamp/);
  assert.match(user, /userLongMessageSettled\(/);
  assert.match(user, /isUserKindMessage\(message\)/);
  assert.match(user, /userCopyPending\(/);
  assert.match(user, /activeFind=\{findRowActive\(message\.id\) === "true"\}/);
  assert.match(user, /<pre>/);
  assert.match(user, /quoteRootAttr\(\{/);
  assert.doesNotMatch(user, /LongMessageBody/);
  assert.doesNotMatch(user, /Regenerate/);
  assert.doesNotMatch(user, /streaming-caret/);
  const left = sliceFn(app, 'className="assistant-bubbles"', "showAssistantCopy");
  assert.match(left, /<LongMessageBody/);

  const iosUser = sliceFn(chat, "} else if isUser {", "} else {");
  assert.match(iosUser, /UserMessageClamp\(/);
  assert.match(iosUser, /UserLongMessage\.settled\(/);
  assert.match(iosUser, /OptimisticSend\.isOptimistic\(message\.id\)/);
  assert.match(iosUser, /model\.failedSend\(id: message\.id\) == nil/);
  assert.match(iosUser, /ChatFind\.queryActive\(find\.query\)/);
  assert.match(iosUser, /MentionLabel\(/);
  assert.match(iosUser, /links: true/);
  assert.doesNotMatch(iosUser, /LongMessageBody/);
  assert.ok(chat.indexOf("UserMessageClamp(") < chat.indexOf("LongMessageBody("));
  assert.match(css, /\.bubble\.user \.long-message-toggle\s*\{\s*margin:\s*0;/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const body of [openapi, protocol, runtimeOpenapi]) {
    assert.match(body, /version: 0\.18\.0/);
    assert.doesNotMatch(body, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 216\. v2\.16/);
  assert.match(spec, /OpenAPI stays \*\*0\.18\.0\*\*/);
  assert.match(ci, /test_ios_user_long_message\.py/);
  assert.match(pkg, /src\/userLongMessage\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
