// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MESSAGE_LINKS_COPIED_ARIA,
  MESSAGE_LINKS_COPIED_LABEL,
  MESSAGE_LINKS_COPY_ARIA,
  MESSAGE_LINKS_COPY_LABEL,
  MESSAGE_LINKS_FILENAME,
  MESSAGE_LINKS_MIME,
  MESSAGE_LINKS_MS,
  MESSAGE_LINKS_SAVE_ARIA,
  MESSAGE_LINKS_SAVE_LABEL,
  MESSAGE_LINKS_SAVED_ARIA,
  MESSAGE_LINKS_SAVED_LABEL,
  messageLinks,
  messageLinksAnimates,
  messageLinksBody,
  messageLinksCopyAriaLabel,
  messageLinksCopyLabel,
  messageLinksKeepsReply,
  messageLinksSaveAriaLabel,
  messageLinksSaveLabel,
  showMessageLinks,
} from "./messageLinks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "messageLinks.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const plain = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "MessageLinks.swift"),
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

const PHRASE = "v2.40 copy and save message links";

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
  assert.equal(MESSAGE_LINKS_COPY_LABEL, "Copy links");
  assert.equal(MESSAGE_LINKS_COPIED_LABEL, "Copied");
  assert.equal(MESSAGE_LINKS_COPY_ARIA, "Copy links");
  assert.equal(MESSAGE_LINKS_COPIED_ARIA, "Copied");
  assert.equal(MESSAGE_LINKS_SAVE_LABEL, "Save as links.md");
  assert.equal(MESSAGE_LINKS_SAVED_LABEL, "Saved");
  assert.equal(MESSAGE_LINKS_SAVE_ARIA, "Save as links.md");
  assert.equal(MESSAGE_LINKS_SAVED_ARIA, "Saved");
  assert.equal(MESSAGE_LINKS_MS, 1500);
  assert.equal(MESSAGE_LINKS_FILENAME, "links.md");
  assert.equal(MESSAGE_LINKS_MIME, "text/markdown;charset=utf-8");
  assert.equal(messageLinksCopyLabel(false), "Copy links");
  assert.equal(messageLinksCopyLabel(true), "Copied");
  assert.equal(messageLinksCopyAriaLabel(false), "Copy links");
  assert.equal(messageLinksCopyAriaLabel(true), "Copied");
  assert.equal(messageLinksSaveLabel(false), "Save as links.md");
  assert.equal(messageLinksSaveLabel(true), "Saved");
  assert.equal(messageLinksSaveAriaLabel(false), "Save as links.md");
  assert.equal(messageLinksSaveAriaLabel(true), "Saved");
  const offer = {
    completed: true,
    fromUser: false,
    kindMessage: true,
    markdown: "See [Docs](https://example.com/docs).",
  };
  assert.equal(showMessageLinks(offer), true);
  assert.equal(showMessageLinks({ ...offer, completed: false }), false);
  assert.equal(showMessageLinks({ ...offer, fromUser: true }), false);
  assert.equal(showMessageLinks({ ...offer, kindMessage: false }), false);
  assert.equal(showMessageLinks({ ...offer, markdown: "No links here." }), false);
  assert.equal(showMessageLinks({ ...offer, markdown: "" }), false);
  assert.equal(messageLinksKeepsReply(), true);
  assert.equal(messageLinksAnimates(false), false);
  assert.equal(messageLinksAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let copyLabel = "Copy links"/);
  assert.match(swift, /static let copiedLabel = "Copied"/);
  assert.match(swift, /static let saveLabel = "Save as links.md"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let filename = "links.md"/);
  assert.match(swift, /completed && !fromUser && kindMessage && !links\(in: markdown\)\.isEmpty/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-links/);
  assert.match(src, /Never animate/);
});

test("the file lists each link label and URL", () => {
  assert.equal(
    messageLinksBody("See [Docs](https://example.com/docs)."),
    "[Docs](https://example.com/docs)",
  );
  assert.equal(
    messageLinksBody("https://a.example then [Docs](https://b.example)"),
    "[https://a.example](https://a.example)\n[Docs](https://b.example)",
  );
  assert.equal(
    messageLinksBody("Mail ada@example.com today."),
    "[ada@example.com](mailto:ada@example.com)",
  );
  assert.equal(
    messageLinksBody("Go to <https://example.com/a>."),
    "[https://example.com/a](https://example.com/a)",
  );
  assert.equal(
    messageLinksBody("Visit www.example.com now."),
    "[www.example.com](http://www.example.com)",
  );
  assert.equal(
    messageLinksBody("[Ada](mailto:ada@example.com)"),
    "[Ada](mailto:ada@example.com)",
  );
  assert.equal(
    messageLinksBody('[Docs](https://example.com "hint")'),
    "[Docs](https://example.com)",
  );
  assert.equal(
    messageLinksBody("[](https://example.com/docs)"),
    "[https://example.com/docs](https://example.com/docs)",
  );
  assert.equal(
    messageLinksBody("See https://a.example."),
    "[https://a.example](https://a.example)",
  );
  assert.equal(
    messageLinksBody("[A](https://example.com) and [B](https://example.com)"),
    "[A](https://example.com)\n[B](https://example.com)",
  );
  assert.equal(
    messageLinksBody("See [Docs][id].\n\n[id]: https://example.com/docs\n"),
    "[Docs](https://example.com/docs)",
  );
  assert.equal(messageLinksBody("[id]: https://example.com/docs\n"), "");
  const multiline = messageLinksBody("[Docs\npage](https://example.com/docs)");
  assert.equal(multiline, "[Docs page](https://example.com/docs)");
  assert.equal(messageLinksBody("plain").endsWith("\n"), false);
  assert.equal(messageLinksBody("[Docs](https://example.com)").includes("<a"), false);
  assert.equal(messageLinks("No links.").length, 0);
  assert.equal(
    messageLinksBody(messageLinksBody("https://a.example then [Docs](https://b.example)")),
    messageLinksBody("https://a.example then [Docs](https://b.example)"),
  );
});

test("images, code, math, and unsafe schemes stay out", () => {
  assert.equal(
    messageLinksBody("![alt](https://example.com/pic.png) and [Docs](https://example.com/docs)"),
    "[Docs](https://example.com/docs)",
  );
  assert.equal(
    messageLinksBody("```\nhttps://example.com\n```\n\n[Docs](https://example.com/docs)"),
    "[Docs](https://example.com/docs)",
  );
  assert.equal(
    messageLinksBody("Use `https://example.com` or [Docs](https://example.com/docs)"),
    "[Docs](https://example.com/docs)",
  );
  assert.equal(
    messageLinksBody("$$\nhttps://example.com\n$$\n\n[Docs](https://example.com/docs)"),
    "[Docs](https://example.com/docs)",
  );
  assert.equal(
    messageLinksBody("[x](javascript:alert(1)) and [Docs](https://example.com)"),
    "[Docs](https://example.com)",
  );
  assert.equal(messageLinksBody("    https://example.com\n"), "");
});

test("Copy links and Save sit beside Copy and do not replace it", () => {
  const actions = sliceFn(app, "function MessageActions(", "function QuoteMessageButton(");
  assert.match(actions, /showMessageLinks\(\{/);
  assert.match(actions, /fromUser: false/);
  assert.match(actions, /kindMessage: true/);
  assert.match(actions, /messageLinksBody\(content\)/);
  assert.match(actions, /downloadMessageLinks\(content, MESSAGE_LINKS_FILENAME\)/);
  assert.match(actions, /messageLinksCopyLabel\(linksCopied\)/);
  assert.match(actions, /messageLinksSaveLabel\(linksSaved\)/);
  assert.match(actions, /aria-label=\{messageLinksCopyAriaLabel\(linksCopied\)\}/);
  assert.match(actions, /aria-label=\{messageLinksSaveAriaLabel\(linksSaved\)\}/);
  assert.match(actions, /className="message-action message-links-copy"/);
  assert.match(actions, /className="message-action message-links-save"/);
  assert.match(actions, /className=\{`message-links/);
  assert.match(actions, /is-copied/);
  assert.match(actions, /is-saved/);
  assert.match(actions, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(actions, /messageLinksKeepsReply\(\)/);
  assert.match(actions, /MESSAGE_LINKS_MS/);
  const copyAt = actions.indexOf("COPY_CONTROL_LABEL");
  const saveAt = actions.indexOf("replyMarkdownSaveLabel");
  const linksAt = actions.indexOf("messageLinksCopyLabel");
  const quoteAt = actions.indexOf("<QuoteMessageButton");
  assert.ok(copyAt >= 0 && copyAt < saveAt && saveAt < linksAt && linksAt < quoteAt);
  const copyCall = sliceFn(actions, "async function onCopy", "function onSave");
  assert.match(copyCall, /copyText\(content\)/);
  assert.doesNotMatch(copyCall, /messageLinksBody/);
  assert.doesNotMatch(copyCall, /downloadMessageLinks/);
  const saveCall = sliceFn(actions, "function onSave(", "function onCopyLinks");
  assert.match(saveCall, /replyMarkdownSaveBody\(content\)/);
  assert.match(saveCall, /REPLY_MARKDOWN_FILENAME/);
  assert.doesNotMatch(saveCall, /messageLinksBody/);
  assert.doesNotMatch(saveCall, /downloadMessageLinks/);
  const linksCopy = sliceFn(actions, "function onCopyLinks", "function onSaveLinks");
  assert.match(linksCopy, /copyText\(messageLinksBody\(content\)\)/);
  assert.doesNotMatch(linksCopy, /downloadMessageLinks/);
  assert.doesNotMatch(linksCopy, /setCopied\(/);
  const linksSave = sliceFn(actions, "function onSaveLinks", "return (");
  assert.match(linksSave, /downloadMessageLinks\(content, MESSAGE_LINKS_FILENAME\)/);
  assert.doesNotMatch(linksSave, /copyText/);
  assert.doesNotMatch(linksSave, /setLinksCopied/);
  assert.doesNotMatch(linksSave, /setSaved\(/);
  const row = block(".turn.left .message-links");
  assert.match(row, /display:\s*none/);
  assert.match(row, /max-height:\s*0/);
  assert.match(row, /opacity:\s*0/);
  assert.match(row, /transition:\s*none/);
  assert.match(row, /animation:\s*none/);
  assert.match(css, /\.turn\.left:hover \.message-links/);
  assert.match(css, /\.turn\.left:focus-within \.message-links/);
  assert.match(css, /display:\s*flex/);
  assert.match(css, /\.message-links\.is-copied/);
  assert.match(css, /\.message-links\.is-saved/);
  const button = block(".message-links-copy,\n.message-links-save");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(css, /\.message-links-copy:focus-visible/);
  const reduceAt = css.indexOf(".message-links,\n  .message-links-copy,");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for message links");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 40,
  );
  assert.match(reduce, /\.message-links/);
  const user = sliceFn(app, "function UserMessageCopy(", "function AgentSkillRow");
  assert.doesNotMatch(user, /messageLinks/);
  assert.doesNotMatch(user, /downloadMessageLinks/);
  assert.doesNotMatch(body, /messageLinks/);
  assert.doesNotMatch(body, /links\.md/);
  assert.match(body, /linkCopyClipboardText/);
  assert.doesNotMatch(plain, /messageLinks/);
  assert.doesNotMatch(shortcuts, /Copy links/);
  assert.doesNotMatch(shortcuts, /Save as links\.md/);
  assert.doesNotMatch(iosShortcuts, /Copy links/);
  assert.doesNotMatch(iosShortcuts, /Save as links\.md/);
});

test("iOS Copy links writes the list and Save shares links.md", () => {
  const row = sliceFn(chat, 'Button("Copy")', "if showSpeak");
  assert.match(row, /offersMessageLinks/);
  assert.match(row, /MessageLinks\.label\(copied: linksCopied\)/);
  assert.match(row, /MessageLinks\.fileLabel\(saved: linksSaved\)/);
  assert.match(row, /MessageLinks\.copyAccessibilityLabel\(copied: linksCopied\)/);
  assert.match(row, /MessageLinks\.saveAccessibilityLabel\(saved: linksSaved\)/);
  assert.match(row, /MessageLinks\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(row, /copyLinks\(\)/);
  assert.match(row, /saveLinks\(\)/);
  assert.match(row, /focusable\(false\)/);
  assert.match(row, /UIPasteboard\.general\.string = message\.content/);
  const copyCall = sliceFn(chat, "private func copyLinks", "private func saveLinks");
  assert.match(copyCall, /MessageLinks\.clipboardText\(message\.content\)/);
  assert.match(copyCall, /UIPasteboard\.general\.string = text/);
  assert.match(copyCall, /MessageLinks\.feedbackNanoseconds/);
  assert.doesNotMatch(copyCall, /writeFile/);
  assert.doesNotMatch(copyCall, /shareURL/);
  const saveCall = sliceFn(chat, "private func saveLinks", "private func saveReply");
  assert.match(saveCall, /MessageLinks\.keepsReply\(\)/);
  assert.match(saveCall, /MessageLinks\.bodyText\(message\.content\)/);
  assert.match(saveCall, /MessageLinks\.writeFile/);
  assert.match(saveCall, /MessageLinks\.filename/);
  assert.match(saveCall, /MessageLinks\.feedbackNanoseconds/);
  assert.match(saveCall, /shareURL = file/);
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.doesNotMatch(saveCall, /PHPhotoLibrary/);
  assert.match(chat, /UIActivityViewController/);
  const menu = sliceFn(chat, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet");
  assert.match(menu, /if showMessageLinks/);
  assert.match(menu, /MessageLinks\.label\(copied: linksCopied\)/);
  assert.match(menu, /MessageLinks\.fileLabel\(saved: linksSaved\)/);
  assert.match(menu, /onCopyLinks\(\)/);
  assert.match(menu, /onSaveLinks\(\)/);
  const offer = sliceFn(chat, "private var offersMessageLinks", "private var offersReplySave");
  assert.match(offer, /MessageLinks\.shows\(/);
  assert.match(offer, /fromUser: message\.isFromUser/);
  assert.match(offer, /!message\.isToolLine/);
  assert.match(offer, /!message\.isHandoffRoot/);
  assert.doesNotMatch(markdown, /MessageLinks/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /MessageLinks/);
  assert.doesNotMatch(user, /copyLinks/);
  assert.doesNotMatch(user, /saveLinks/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 240\. v2\.40/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_message_links\.py/);
  assert.match(pkg, /messageLinks\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
