// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { showAssistantCopy } from "./messageActions.ts";
import {
  REPLY_MARKDOWN_FILENAME,
  REPLY_MARKDOWN_MIME,
  REPLY_MARKDOWN_SAVE_ARIA,
  REPLY_MARKDOWN_SAVE_LABEL,
  REPLY_MARKDOWN_SAVE_MS,
  REPLY_MARKDOWN_SAVED_ARIA,
  REPLY_MARKDOWN_SAVED_LABEL,
  replyMarkdownSaveAnimates,
  replyMarkdownSaveAriaLabel,
  replyMarkdownSaveBody,
  replyMarkdownSaveKeepsReply,
  replyMarkdownSaveLabel,
  showReplyMarkdownSave,
} from "./replyMarkdownSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "replyMarkdownSave.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ReplyMarkdownSave.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.30 save a reply as markdown";

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
  assert.equal(REPLY_MARKDOWN_SAVE_LABEL, "Save");
  assert.equal(REPLY_MARKDOWN_SAVED_LABEL, "Saved");
  assert.equal(REPLY_MARKDOWN_SAVE_ARIA, "Save reply");
  assert.equal(REPLY_MARKDOWN_SAVED_ARIA, "Saved");
  assert.equal(REPLY_MARKDOWN_SAVE_MS, 1500);
  assert.equal(REPLY_MARKDOWN_FILENAME, "reply.md");
  assert.equal(REPLY_MARKDOWN_MIME, "text/markdown;charset=utf-8");
  assert.equal(replyMarkdownSaveLabel(false), "Save");
  assert.equal(replyMarkdownSaveLabel(true), "Saved");
  assert.equal(replyMarkdownSaveAriaLabel(false), "Save reply");
  assert.equal(replyMarkdownSaveAriaLabel(true), "Saved");
  const offer = { completed: true, fromUser: false, kindMessage: true };
  assert.equal(showReplyMarkdownSave(offer), true);
  assert.equal(showReplyMarkdownSave({ ...offer, completed: false }), false);
  assert.equal(showReplyMarkdownSave({ ...offer, fromUser: true }), false);
  assert.equal(showReplyMarkdownSave({ ...offer, kindMessage: false }), false);
  const left = { kind: "message", role: "assistant", senderId: "snorlax-bot" };
  assert.equal(
    showReplyMarkdownSave(offer),
    showAssistantCopy({ message: left, completed: true }),
  );
  assert.equal(
    showReplyMarkdownSave({ ...offer, completed: false }),
    showAssistantCopy({ message: left, completed: false }),
  );
  assert.equal(
    showReplyMarkdownSave({ ...offer, fromUser: true }),
    showAssistantCopy({
      message: { kind: "message", role: "user", senderId: "user" },
      completed: true,
    }),
  );
  assert.equal(
    showReplyMarkdownSave({ ...offer, kindMessage: false }),
    showAssistantCopy({
      message: { kind: "tool", role: "assistant", senderId: "snorlax-bot" },
      completed: true,
    }),
  );
  assert.equal(replyMarkdownSaveKeepsReply(), true);
  assert.equal(replyMarkdownSaveAnimates(false), false);
  assert.equal(replyMarkdownSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save reply"/);
  assert.match(swift, /static let filename = "reply.md"/);
  assert.match(swift, /completed && !fromUser && kindMessage/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-reply/);
  assert.match(src, /Never animate/);
});

test("the file is the reply markdown and not a rendered fragment", () => {
  const source = "See $$\nE=mc^2\n$$\n\n```py\nprint(1)\n```\n";
  assert.equal(replyMarkdownSaveBody(source), source);
  assert.equal(replyMarkdownSaveBody("  x\ny  "), "  x\ny  ");
  assert.equal(replyMarkdownSaveBody(""), "");
  assert.equal(replyMarkdownSaveBody("a"), "a");
  assert.equal(replyMarkdownSaveBody("a\n"), "a\n");
  assert.equal(replyMarkdownSaveBody("a").endsWith("\n"), false);
  assert.equal(replyMarkdownSaveBody("# Title").includes("<h1>"), false);
});

test("Save sits beside Copy and does not replace it", () => {
  const actions = sliceFn(app, "function MessageActions(", "function QuoteMessageButton(");
  assert.match(actions, /showReplyMarkdownSave\(\{/);
  assert.match(actions, /fromUser: false/);
  assert.match(actions, /kindMessage: true/);
  assert.match(actions, /replyMarkdownSaveBody\(content\)/);
  assert.match(actions, /downloadReplyMarkdown\(/);
  assert.match(actions, /REPLY_MARKDOWN_FILENAME/);
  assert.match(actions, /replyMarkdownSaveLabel\(saved\)/);
  assert.match(actions, /aria-label=\{replyMarkdownSaveAriaLabel\(saved\)\}/);
  assert.match(actions, /className="message-action message-save"/);
  assert.match(actions, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(actions, /replyMarkdownSaveKeepsReply\(\)/);
  assert.match(actions, /REPLY_MARKDOWN_SAVE_MS/);
  const copyAt = actions.indexOf("COPY_CONTROL_LABEL");
  const saveAt = actions.indexOf("replyMarkdownSaveLabel");
  const quoteAt = actions.indexOf("<QuoteMessageButton");
  assert.ok(copyAt >= 0 && copyAt < saveAt && saveAt < quoteAt);
  const copyCall = sliceFn(actions, "async function onCopy", "function onSave");
  assert.match(copyCall, /copyText\(content\)/);
  assert.doesNotMatch(copyCall, /replyMarkdownSaveBody/);
  assert.doesNotMatch(copyCall, /downloadReplyMarkdown/);
  const saveCall = sliceFn(actions, "function onSave", "const speakName");
  assert.match(saveCall, /replyMarkdownSaveBody\(content\)/);
  assert.match(saveCall, /REPLY_MARKDOWN_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /setCopied/);
  const save = block(".message-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".message-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".message-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for reply Save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 40,
  );
  assert.match(reduce, /\.message-save/);
  const user = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.doesNotMatch(user, /replyMarkdownSave/);
  assert.doesNotMatch(user, /downloadReplyMarkdown/);
  assert.doesNotMatch(user, /message-save/);
  assert.doesNotMatch(body, /replyMarkdownSave/);
  assert.doesNotMatch(body, /reply\.md/);
  assert.doesNotMatch(shortcuts, /Save reply/);
  assert.doesNotMatch(iosShortcuts, /Save reply/);
});

test("iOS Save writes the markdown and Copy stays", () => {
  const row = sliceFn(chat, 'Button("Copy")', "if showSpeak");
  assert.match(row, /offersReplySave/);
  assert.match(row, /ReplyMarkdownSave\.label\(saved: replySaved\)/);
  assert.match(row, /ReplyMarkdownSave\.accessibilityLabel\(saved: replySaved\)/);
  assert.match(row, /ReplyMarkdownSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(row, /saveReply\(\)/);
  assert.match(row, /focusable\(false\)/);
  assert.match(row, /UIPasteboard\.general\.string = message\.content/);
  const saveCall = sliceFn(chat, "private func saveReply", "private func copyMessageText");
  assert.match(saveCall, /ReplyMarkdownSave\.keepsReply\(\)/);
  assert.match(saveCall, /ReplyMarkdownSave\.bodyText\(message\.content\)/);
  assert.match(saveCall, /ReplyMarkdownSave\.writeFile/);
  assert.match(saveCall, /ReplyMarkdownSave\.filename/);
  assert.match(saveCall, /ReplyMarkdownSave\.feedbackNanoseconds/);
  assert.match(saveCall, /shareURL = file/);
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.doesNotMatch(saveCall, /PHPhotoLibrary/);
  assert.match(chat, /UIActivityViewController/);
  const menu = sliceFn(chat, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet");
  assert.match(menu, /if showReplySave/);
  assert.match(menu, /ReplyMarkdownSave\.label\(saved: replySaved\)/);
  assert.match(menu, /onSaveReply\(\)/);
  const offer = sliceFn(chat, "private var offersReplySave", "private var offersReplyRating");
  assert.match(offer, /ReplyMarkdownSave\.showsSave\(/);
  assert.match(offer, /fromUser: message\.isFromUser/);
  assert.match(offer, /!message\.isToolLine/);
  assert.match(offer, /!message\.isHandoffRoot/);
  assert.doesNotMatch(markdown, /ReplyMarkdownSave/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /ReplyMarkdownSave/);
  assert.doesNotMatch(user, /saveReply/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 230\. v2\.30/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_reply_markdown_save\.py/);
  assert.match(pkg, /replyMarkdownSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
