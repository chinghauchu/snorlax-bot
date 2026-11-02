// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { formatBubbleTime } from "./bubbleTime.ts";
import { transcriptPlainText } from "./copyTranscript.ts";
import {
  CONVERSATION_FILENAME,
  CONVERSATION_MIME,
  CONVERSATION_SAVE_ARIA,
  CONVERSATION_SAVE_LABEL,
  CONVERSATION_SAVE_MS,
  CONVERSATION_SAVED_ARIA,
  CONVERSATION_SAVED_LABEL,
  conversationHeading,
  conversationMarkdown,
  conversationSaveAnimates,
  conversationSaveAriaLabel,
  conversationSaveBody,
  conversationSaveKeepsChat,
  conversationSaveLabel,
  conversationSpeaker,
  escapeConversationSpeaker,
  showConversationSave,
} from "./conversationSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "conversationSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "ConversationSave.swift"),
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

const PHRASE = "v2.42 save the open conversation as markdown";
const now = new Date(2026, 10, 2, 16, 5, 0);

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
  assert.equal(CONVERSATION_SAVE_LABEL, "Save as conversation.md");
  assert.equal(CONVERSATION_SAVED_LABEL, "Saved");
  assert.equal(CONVERSATION_SAVE_ARIA, "Save as conversation.md");
  assert.equal(CONVERSATION_SAVED_ARIA, "Saved");
  assert.equal(CONVERSATION_SAVE_MS, 1500);
  assert.equal(CONVERSATION_FILENAME, "conversation.md");
  assert.equal(CONVERSATION_MIME, "text/markdown;charset=utf-8");
  assert.equal(conversationSaveLabel(false), "Save as conversation.md");
  assert.equal(conversationSaveLabel(true), "Saved");
  assert.equal(conversationSaveAriaLabel(false), "Save as conversation.md");
  assert.equal(conversationSaveAriaLabel(true), "Saved");
  assert.equal(showConversationSave({ chatOpen: true, text: "hello" }), true);
  assert.equal(showConversationSave({ chatOpen: false, text: "hello" }), false);
  assert.equal(showConversationSave({ chatOpen: true, text: null }), false);
  assert.equal(showConversationSave({ chatOpen: true, text: "" }), false);
  assert.equal(conversationSaveKeepsChat(), true);
  assert.equal(conversationSaveAnimates(false), false);
  assert.equal(conversationSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let saveLabel = "Save as conversation.md"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save as conversation.md"/);
  assert.match(swift, /static let filename = "conversation.md"/);
  assert.match(swift, /kind == nil \|\| kind == \.message/);
  assert.match(swift, /BubbleTime\.format/);
  assert.match(swift, /return fromUser \? "You" : "Assistant"/);
  assert.match(swift, /guard chatOpen, let text, !text.isEmpty else \{ return false \}/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-conversation/);
  assert.match(swift, /No new HTTP/);
  assert.match(src, /Never animate/);
  assert.match(src, /No new HTTP/);
});

test("the file labels speakers and times and skips chrome", () => {
  const userAt = new Date(2026, 10, 2, 15, 4, 0);
  const botAt = new Date(2026, 9, 9, 9, 5, 0);
  const rows = [
    {
      kind: "message",
      role: "user",
      senderId: "user",
      senderName: "User",
      content: "  hello  ",
      createdAt: userAt,
    },
    { kind: "tool", role: "assistant", senderId: "bot", senderName: "Snorlax", content: "Ran ls", createdAt: userAt },
    { kind: "widget", role: "assistant", content: "Pick one", createdAt: userAt },
    { kind: "approve", role: "assistant", content: "rm", createdAt: userAt },
    { kind: "connect", role: "assistant", content: "Slack", createdAt: userAt },
    { kind: "handoff", role: "assistant", content: "ask", createdAt: userAt },
    {
      kind: "message",
      role: "assistant",
      senderId: "snorlax-bot",
      senderName: "Snorlax",
      content: "keep\n\nthis",
      createdAt: botAt,
    },
    { kind: "message", role: "user", senderId: "user", senderName: "User", content: "   ", createdAt: userAt },
    { role: "assistant", senderId: "bot", senderName: "  Ada   Lovelace ", content: "plain", createdAt: "nope" },
  ];
  const userTime = formatBubbleTime(userAt, now);
  const botTime = formatBubbleTime(botAt, now);
  assert.equal(userTime, "3:04 PM");
  assert.equal(botTime, "Oct 9, 9:05 AM");
  const markdown = conversationMarkdown(rows, now);
  assert.equal(
    markdown,
    [
      `**User** · ${userTime}`,
      "",
      "hello",
      "",
      `**Snorlax** · ${botTime}`,
      "",
      "keep\n\nthis",
      "",
      "**Ada Lovelace**",
      "",
      "plain",
    ].join("\n"),
  );
  assert.equal(markdown!.endsWith("\n"), false);
  assert.equal(markdown!.includes("Ran ls"), false);
  assert.equal(markdown!.includes("Pick one"), false);
  assert.equal(conversationSaveBody(markdown!), markdown);
  assert.equal(showConversationSave({ chatOpen: true, text: markdown }), true);
  assert.equal(showConversationSave({ chatOpen: true, text: conversationMarkdown([]) }), false);
  const plain = transcriptPlainText(rows);
  assert.equal(plain, "hello\n\nkeep\n\nthis\n\nplain");
  assert.equal(plain!.includes("**"), false);
  assert.notEqual(markdown, plain);
  assert.equal(conversationSpeaker({ senderName: "  ", senderId: "user", role: "user" }), "You");
  assert.equal(conversationSpeaker({ senderName: "", role: "assistant" }), "Assistant");
  assert.equal(conversationSpeaker({ senderId: "user", role: "assistant", senderName: "" }), "You");
  assert.equal(escapeConversationSpeaker("A*B\\C"), "A\\*B\\\\C");
  assert.equal(
    conversationHeading({ senderName: "A*B", createdAt: userAt }, now),
    `**A\\*B** · ${userTime}`,
  );
  assert.equal(conversationHeading({ senderName: "Ada" }, now), "**Ada**");
});

test("Save sits in the chat header and does not replace transcript Save", () => {
  const head = sliceFn(app, '<header className="chat-head">', "</header>");
  assert.match(head, /showConversationSave\(\{/);
  assert.match(head, /conversationMarkdown\(visibleMessages\)/);
  assert.match(head, /conversationSaveLabel\(conversationSaved\)/);
  assert.match(head, /aria-label=\{conversationSaveAriaLabel\(conversationSaved\)\}/);
  assert.match(head, /className="message-action conversation-save"/);
  assert.match(head, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(head, /onClick=\{onSaveConversation\}/);
  const transcriptAt = head.indexOf("transcript-save");
  const conversationAt = head.indexOf("conversation-save");
  assert.ok(transcriptAt >= 0 && transcriptAt < conversationAt);
  const transcriptSave = sliceFn(app, "function onSaveTranscript", "function onSaveConversation");
  assert.match(transcriptSave, /downloadTranscript\(/);
  assert.match(transcriptSave, /TRANSCRIPT_FILENAME/);
  assert.doesNotMatch(transcriptSave, /downloadConversation/);
  assert.doesNotMatch(transcriptSave, /CONVERSATION_FILENAME/);
  assert.doesNotMatch(transcriptSave, /conversationMarkdown/);
  const saveCall = sliceFn(app, "function onSaveConversation", "// v1.14:");
  assert.match(saveCall, /conversationSaveKeepsChat\(\)/);
  assert.match(saveCall, /conversationMarkdown\(visibleMessages\)/);
  assert.match(saveCall, /conversationSaveBody\(text\)/);
  assert.match(saveCall, /downloadConversation\(/);
  assert.match(saveCall, /CONVERSATION_FILENAME/);
  assert.match(saveCall, /CONVERSATION_SAVE_MS/);
  assert.match(saveCall, /setConversationSaved\(true\)/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /setTranscriptCopiedId/);
  assert.doesNotMatch(saveCall, /setTranscriptSaved/);
  assert.doesNotMatch(saveCall, /downloadTranscript/);
  assert.doesNotMatch(saveCall, /reply\.md/);
  assert.doesNotMatch(saveCall, /transcript\.txt/);
  const copyCall = sliceFn(app, "copyTranscriptRef.current = () => {", "function onSaveTranscript");
  assert.doesNotMatch(copyCall, /downloadConversation/);
  assert.doesNotMatch(copyCall, /conversation\.md/);
  const save = block(".conversation-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".conversation-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".conversation-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for conversation Save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 80,
  );
  assert.match(reduce, /\.conversation-save/);
  assert.doesNotMatch(shortcuts, /Save as conversation\.md/);
  assert.doesNotMatch(iosShortcuts, /Save as conversation\.md/);
});

test("iOS Save writes conversation.md and the other saves stay", () => {
  const bar = sliceFn(chat, ".toolbar {", ".sheet(isPresented: $model.showProfile)");
  assert.match(bar, /if offersConversationSave/);
  assert.match(bar, /ConversationSave\.label\(saved: conversationSaved\)/);
  assert.match(bar, /ConversationSave\.accessibilityLabel\(saved: conversationSaved\)/);
  assert.match(bar, /ConversationSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(bar, /saveOpenConversation\(\)/);
  assert.match(bar, /\.font\(\.system\(size: 12, weight: \.medium\)\)/);
  const saveCall = sliceFn(chat, "private func saveOpenConversation", "private func chatNavKey");
  assert.match(saveCall, /ConversationSave\.keepsChat\(\)/);
  assert.match(saveCall, /ConversationSave\.markdown\(turns: conversationTurns\(\)\)/);
  assert.match(saveCall, /ConversationSave\.bodyText\(text\)/);
  assert.match(saveCall, /ConversationSave\.writeFile/);
  assert.match(saveCall, /ConversationSave\.filename/);
  assert.match(saveCall, /ConversationSave\.feedbackNanoseconds/);
  assert.match(saveCall, /conversationShareURL = file/);
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.doesNotMatch(saveCall, /PHPhotoLibrary/);
  assert.doesNotMatch(saveCall, /composerFocused/);
  assert.doesNotMatch(saveCall, /TranscriptSave/);
  assert.doesNotMatch(saveCall, /transcript\.txt/);
  assert.match(chat, /UIActivityViewController/);
  const offer = sliceFn(chat, "private var offersConversationSave", "var body: some View");
  assert.match(offer, /ConversationSave\.showsSave\(/);
  assert.match(offer, /ConversationSave\.markdown\(turns: conversationTurns\(\)\)/);
  assert.match(offer, /hasRealAgent/);
  const transcript = sliceFn(chat, "private func saveOpenTranscript", "private func saveOpenConversation");
  assert.match(transcript, /TranscriptSave\.filename/);
  assert.doesNotMatch(transcript, /ConversationSave/);
  assert.doesNotMatch(transcript, /conversation\.md/);
  const reply = sliceFn(chat, "private func saveReply", "private func copyMessageText");
  assert.doesNotMatch(reply, /ConversationSave/);
  assert.doesNotMatch(reply, /conversation\.md/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 242\. v2\.42/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_conversation_save\.py/);
  assert.match(pkg, /conversationSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
