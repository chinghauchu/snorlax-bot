// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  showAssistantCopy,
  showAssistantRegenerate,
  showUserCopy,
  userCopyPending,
} from "./messageActions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const actionsSrc = readFileSync(join(here, "messageActions.ts"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const shortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);
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

const PHRASE =
  "v0.86 user-RIGHT Copy (hover a user-RIGHT kind=message to show a muted 12px Copy that copies that message text 1:1; Copied sits beside Copy for 1.2s and the Copy label stays; no toast; hidden while that bubble is still sending; iOS long-press offers Copy; no Regenerate on user bubbles; no new HTTP)";

function msg(
  partial: Record<string, unknown>,
): { kind?: string; role?: string; senderId?: string } {
  return partial as { kind?: string; role?: string; senderId?: string };
}

function sliceFn(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end > start ? src.slice(start, end) : src.slice(start);
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("Copy on settled user-RIGHT kind=message; hidden while that send is in flight", () => {
  const user = msg({ kind: "message", role: "user", senderId: "user" });
  assert.equal(showUserCopy({ message: user }), true);
  assert.equal(showUserCopy({ message: user, pending: false }), true);
  assert.equal(showUserCopy({ message: user, pending: true }), false);
  assert.equal(
    showUserCopy({
      message: msg({ kind: "message", role: "assistant", senderId: "snorlax-bot" }),
    }),
    false,
  );
  for (const kind of ["tool", "widget", "connect", "approve", "handoff"]) {
    assert.equal(
      showUserCopy({
        message: msg({ kind, role: "user", senderId: "user" }),
      }),
      false,
      kind,
    );
  }
  assert.equal(showAssistantCopy({ message: user, completed: true }), false);
  assert.equal(
    showAssistantRegenerate({
      message: user,
      completed: true,
      isLatest: true,
      isChannel: false,
      streaming: false,
    }),
    false,
  );
  assert.equal(
    userCopyPending({ id: "local-1", busy: true, failed: false }),
    true,
  );
  assert.equal(
    userCopyPending({ id: "local-1", busy: false, failed: false }),
    false,
  );
  assert.equal(
    userCopyPending({ id: "local-1", busy: true, failed: true }),
    false,
  );
  assert.equal(
    userCopyPending({ id: "server-1", busy: true, failed: false }),
    false,
  );
});

test("desktop hover shows the LEFT Copy chrome; Copied stays beside Copy", () => {
  const control = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.match(control, /copyText\(content\)/);
  assert.match(control, /COPY_CONTROL_LABEL/);
  assert.match(control, /copiedFeedbackLabel\(copied\)/);
  assert.match(control, /MESSAGE_COPY_FEEDBACK_MS/);
  assert.match(control, /className="message-copy"/);
  assert.match(control, /className="message-copied"/);
  assert.match(control, /aria-live="polite"/);
  assert.match(control, /className=\{`message-actions user-copy/);
  assert.match(control, /is-copied/);
  assert.doesNotMatch(control, /Regenerate/);
  assert.doesNotMatch(control, /onSpeak/);
  assert.doesNotMatch(control, /toast/i);
  assert.doesNotMatch(control, /copied \? "Copied" : "Copy"/);
  assert.ok(
    control.indexOf("{COPY_CONTROL_LABEL}") < control.indexOf("{copiedLabel}"),
    "Copied must sit beside Copy, not replace it",
  );

  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.match(userBranch, /<UserMessageCopy content=\{message\.content\} \/>/);
  assert.match(userBranch, /showUserCopy\(/);
  assert.match(userBranch, /userCopyPending\(/);
  assert.doesNotMatch(userBranch, /Regenerate/);
  assert.doesNotMatch(userBranch, /showAssistantRegenerate/);

  const hidden = block(".turn.right .user-copy");
  assert.match(hidden, /opacity:\s*0/);
  assert.match(hidden, /pointer-events:\s*none/);
  assert.match(hidden, /max-height:\s*0/);
  assert.match(hidden, /transition:[^;]*120ms/);
  const shown = css.slice(css.indexOf(".turn.right:hover .user-copy"));
  const shownBlock = shown.slice(0, shown.indexOf("}") + 1);
  assert.match(shownBlock, /opacity:\s*1/);
  assert.match(shownBlock, /pointer-events:\s*auto/);
  assert.match(shownBlock, /margin-top:\s*6px/);
  assert.match(shownBlock, /\.turn\.right:focus-within \.user-copy/);
  assert.match(shownBlock, /\.turn\.right \.user-copy\.is-copied/);
  const btn = block(".message-action");
  assert.match(btn, /font-size:\s*12px/);
  assert.match(btn, /color:\s*var\(--text-muted\)/);
  const copied = block(".message-copied");
  assert.match(copied, /font-size:\s*12px/);
  assert.match(copied, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(copied, /position:\s*fixed/);
  assert.match(
    css,
    /\.turn\.right \.user-copy \{\s*transition:\s*none/,
  );
});

test("iOS long-press offers Copy; Speak and Regenerate stay on LEFT", () => {
  assert.match(chat, /func showsUserCopy\(/);
  assert.match(chat, /message\.isFromUser, message\.isKindMessage/);
  assert.match(chat, /return !pending/);
  assert.match(chat, /Self\.showsUserCopy\(/);
  assert.match(chat, /OptimisticSend\.isOptimistic\(message\.id\)/);
  assert.match(chat, /model\.failedSend\(id: message\.id\) == nil/);
  const regen = sliceFn(chat, "func showsRegenerate(", "func showsSpeak(");
  assert.match(regen, /showsCopy\(/);
  assert.doesNotMatch(regen, /showsUserCopy/);
  const speak = sliceFn(chat, "func showsSpeak(", "private struct ComposerBar");
  assert.match(speak, /showsCopy\(/);
  assert.doesNotMatch(speak, /showsUserCopy/);
  const menu = sliceFn(chat, "struct BubbleTimestampMenu", "struct AttachmentShareSheet");
  assert.match(menu, /Button\("Copy"\)/);
  assert.match(menu, /if showCopy/);
  assert.doesNotMatch(menu, /showsUserCopy/);
  assert.match(shortcuts, /Long-press your message/);
  assert.match(shortcuts, /RecallDraft\.editAsNewMessage/);
  assert.match(shortcuts, /Copy, or /);
});

test("OpenAPI stays 0.18.0; roadmap + CI; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(protocol, /version: 0\.19\.0/);
  assert.match(runtimeOpenapi, /version: 0\.19\.0/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ci, /python3 ios\/scripts\/test_ios_user_copy\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(actionsSrc, /computerPane\.ts/);
  assert.doesNotMatch(actionsSrc, /\/v1\//);
  assert.doesNotMatch(chat, /computerPane\.ts/);
});
