// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { showUserCopy } from "./messageActions.ts";
import {
  USER_MESSAGE_FILENAME,
  USER_MESSAGE_MIME,
  USER_MESSAGE_SAVE_ARIA,
  USER_MESSAGE_SAVE_LABEL,
  USER_MESSAGE_SAVE_MS,
  USER_MESSAGE_SAVED_ARIA,
  USER_MESSAGE_SAVED_LABEL,
  showUserMessageSave,
  userMessageSaveAnimates,
  userMessageSaveAriaLabel,
  userMessageSaveBody,
  userMessageSaveKeepsMessage,
  userMessageSaveLabel,
} from "./userMessageSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "userMessageSave.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "UserMessageSave.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.31 save a user message";

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("labels, timing, and no animation", () => {
  assert.equal(USER_MESSAGE_SAVE_LABEL, "Save");
  assert.equal(USER_MESSAGE_SAVED_LABEL, "Saved");
  assert.equal(USER_MESSAGE_SAVE_ARIA, "Save message");
  assert.equal(USER_MESSAGE_SAVED_ARIA, "Saved");
  assert.equal(USER_MESSAGE_SAVE_MS, 1500);
  assert.equal(USER_MESSAGE_FILENAME, "message.txt");
  assert.equal(USER_MESSAGE_MIME, "text/plain;charset=utf-8");
  assert.equal(userMessageSaveLabel(false), "Save");
  assert.equal(userMessageSaveLabel(true), "Saved");
  assert.equal(userMessageSaveAriaLabel(false), "Save message");
  assert.equal(userMessageSaveAriaLabel(true), "Saved");
  const offer = { fromUser: true, kindMessage: true, pending: false };
  assert.equal(showUserMessageSave(offer), true);
  assert.equal(showUserMessageSave({ ...offer, pending: true }), false);
  assert.equal(showUserMessageSave({ ...offer, fromUser: false }), false);
  assert.equal(showUserMessageSave({ ...offer, kindMessage: false }), false);
  const user = { kind: "message", role: "user", senderId: "user" };
  assert.equal(
    showUserMessageSave(offer),
    showUserCopy({ message: user, pending: false }),
  );
  assert.equal(
    showUserMessageSave({ ...offer, pending: true }),
    showUserCopy({ message: user, pending: true }),
  );
  assert.equal(
    showUserMessageSave({ ...offer, fromUser: false }),
    showUserCopy({
      message: { kind: "message", role: "assistant", senderId: "snorlax-bot" },
      pending: false,
    }),
  );
  assert.equal(userMessageSaveKeepsMessage(), true);
  assert.equal(userMessageSaveAnimates(false), false);
  assert.equal(userMessageSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save message"/);
  assert.match(swift, /static let filename = "message.txt"/);
  assert.match(swift, /fromUser && kindMessage && !pending/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-user-message/);
  assert.match(src, /Never animate/);
});

test("the file is the user text and not a rewritten reply", () => {
  const source = "  keep\nthis  \n";
  assert.equal(userMessageSaveBody(source), source);
  assert.equal(userMessageSaveBody("  x\ny  "), "  x\ny  ");
  assert.equal(userMessageSaveBody(""), "");
  assert.equal(userMessageSaveBody("a"), "a");
  assert.equal(userMessageSaveBody("a\n"), "a\n");
  assert.equal(userMessageSaveBody("a").endsWith("\n"), false);
  assert.equal(userMessageSaveBody("> quoted\n\nnext"), "> quoted\n\nnext");
  assert.equal(userMessageSaveBody("# Title").includes("<h1>"), false);
});

test("Save sits beside Copy and does not replace it", () => {
  const user = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.match(user, /showUserMessageSave\(\{/);
  assert.match(user, /fromUser: true/);
  assert.match(user, /kindMessage: true/);
  assert.match(user, /pending: false/);
  assert.match(user, /userMessageSaveBody\(content\)/);
  assert.match(user, /downloadUserMessage\(/);
  assert.match(user, /USER_MESSAGE_FILENAME/);
  assert.match(user, /userMessageSaveLabel\(saved\)/);
  assert.match(user, /aria-label=\{userMessageSaveAriaLabel\(saved\)\}/);
  assert.match(user, /className="message-action user-save"/);
  assert.match(user, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(user, /userMessageSaveKeepsMessage\(\)/);
  assert.match(user, /USER_MESSAGE_SAVE_MS/);
  assert.match(user, /is-saved/);
  const copyAt = user.indexOf("COPY_CONTROL_LABEL");
  const saveAt = user.indexOf("userMessageSaveLabel");
  const editAt = user.indexOf("EDIT_AS_NEW_MESSAGE");
  assert.ok(copyAt >= 0 && copyAt < saveAt && saveAt < editAt);
  const copyCall = sliceFn(user, "async function onCopy", "function onSave");
  assert.match(copyCall, /copyText\(content\)/);
  assert.doesNotMatch(copyCall, /userMessageSaveBody/);
  assert.doesNotMatch(copyCall, /downloadUserMessage/);
  const saveCall = sliceFn(user, "function onSave", "const copiedLabel");
  assert.match(saveCall, /userMessageSaveBody\(content\)/);
  assert.match(saveCall, /USER_MESSAGE_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /setCopied/);
  const save = block(".user-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".user-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".user-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for user Save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 40,
  );
  assert.match(reduce, /\.user-save/);
  const shown = css.slice(css.indexOf(".turn.right:hover .user-copy"));
  const shownBlock = shown.slice(0, shown.indexOf("}") + 1);
  assert.match(shownBlock, /\.user-copy\.is-saved/);
  const actions = sliceFn(app, "function MessageActions(", "function QuoteMessageButton(");
  assert.doesNotMatch(actions, /userMessageSave/);
  assert.doesNotMatch(actions, /downloadUserMessage/);
  assert.doesNotMatch(actions, /message\.txt/);
  assert.doesNotMatch(shortcuts, /Save message/);
  assert.doesNotMatch(iosShortcuts, /Save message/);
});

test("iOS Save writes the user text and reply Save stays", () => {
  const menu = sliceFn(chat, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet");
  assert.match(menu, /if showUserSave/);
  assert.match(menu, /UserMessageSave\.label\(saved: userSaved\)/);
  assert.match(menu, /UserMessageSave\.accessibilityLabel\(saved: userSaved\)/);
  assert.match(menu, /UserMessageSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(menu, /onSaveUser\(\)/);
  assert.match(menu, /userSaveButton/);
  const saveCall = sliceFn(chat, "private func saveUserMessage", "private struct BubbleTimestampMenu");
  assert.match(saveCall, /UserMessageSave\.keepsMessage\(\)/);
  assert.match(saveCall, /UserMessageSave\.bodyText\(message\.content\)/);
  assert.match(saveCall, /UserMessageSave\.writeFile/);
  assert.match(saveCall, /UserMessageSave\.filename/);
  assert.match(saveCall, /UserMessageSave\.feedbackNanoseconds/);
  assert.match(saveCall, /shareURL = file/);
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.doesNotMatch(saveCall, /PHPhotoLibrary/);
  assert.match(chat, /UIActivityViewController/);
  const offer = sliceFn(chat, "private var offersUserSave", "private var offersReplySave");
  assert.match(offer, /UserMessageSave\.showsSave\(/);
  assert.match(offer, /fromUser: message\.isFromUser/);
  assert.match(offer, /OptimisticSend\.isOptimistic\(message\.id\)/);
  assert.match(offer, /model\.failedSend\(id: message\.id\) == nil/);
  const reply = sliceFn(chat, "private func saveReply", "private func copyMessageText");
  assert.doesNotMatch(reply, /UserMessageSave/);
  assert.doesNotMatch(reply, /message\.txt/);
  const userBubble = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(userBubble, /UserMessageSave/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 231\. v2\.31/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_user_message_save\.py/);
  assert.match(pkg, /userMessageSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
