// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { LINK_STATUS_MAX, linkStatusLabel } from "./linkStatus.ts";
import {
  LINK_COPY_ARIA,
  LINK_COPY_COPIED_ARIA,
  LINK_COPY_COPIED_LABEL,
  LINK_COPY_LABEL,
  LINK_COPY_MS,
  linkCopyAriaLabel,
  linkCopyAnimates,
  linkCopyClipboardText,
  linkCopyLabel,
  showLinkCopy,
} from "./linkCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "linkCopy.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "LinkCopy.swift"),
  "utf8",
);
const preview = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "LinkPreview.swift"),
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

const PHRASE = "v2.25 copy a link";

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
  assert.equal(LINK_COPY_LABEL, "Copy link");
  assert.equal(LINK_COPY_COPIED_LABEL, "Copied");
  assert.equal(LINK_COPY_ARIA, "Copy link");
  assert.equal(LINK_COPY_COPIED_ARIA, "Copied");
  assert.equal(LINK_COPY_MS, 1500);
  assert.equal(linkCopyLabel(false), "Copy link");
  assert.equal(linkCopyLabel(true), "Copied");
  assert.equal(linkCopyAriaLabel(false), "Copy link");
  assert.equal(linkCopyAriaLabel(true), "Copied");
  assert.equal(showLinkCopy({ completed: false, revealed: true }), false);
  assert.equal(showLinkCopy({ completed: true, revealed: false }), false);
  assert.equal(showLinkCopy({ completed: true, revealed: true }), true);
  assert.equal(linkCopyAnimates(false), false);
  assert.equal(linkCopyAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.match(swift, /static let copiedLabel = "Copied"/);
  assert.match(swift, /static let copiedAria = "Copied"/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /return nil/);
});

test("clipboard is the full destination, not the label or the pill", () => {
  const destination = "https://example.com/docs";
  assert.equal(linkCopyClipboardText(destination), destination);
  assert.equal(linkCopyClipboardText("mailto:a@example.com"), "mailto:a@example.com");
  const path = "/very/long/path".repeat(8);
  const url = `https://example.com${path}`;
  assert.ok(url.length > LINK_STATUS_MAX);
  assert.equal(linkCopyClipboardText(url), url);
  assert.notEqual(linkCopyClipboardText(url), linkStatusLabel(url));
  assert.equal(linkCopyClipboardText("API reference"), "API reference");
});

test("Copy link sits on a completed assistant link and does not open it", () => {
  const link = sliceFn(body, "export function MdLink", "function FootnoteMarkers");
  assert.match(link, /useContext\(AssistantLinkCopyContext\)/);
  assert.match(link, /useContext\(InsideMdLinkContext\)/);
  assert.match(link, /nested \|\| !showLinkCopy\(\{ completed: assistantCopy, revealed: reveal \}\)/);
  assert.match(link, /className="md-link-wrap"/);
  assert.match(link, /<LinkCopyButton id=\{id\} destination=\{url\} \/>/);
  assert.match(link, /onMouseEnter=\{reveal \? \(\) => linkStatusHover\(id, url\)/);
  assert.match(link, /openOsBrowser\(url\)/);
  const button = sliceFn(body, "function LinkCopyButton", "function FootnoteMarkers");
  assert.match(button, /linkCopyClipboardText\(destination\)/);
  assert.match(button, /copyText\(linkCopyClipboardText\(destination\)\)/);
  assert.match(button, /linkCopyLabel\(copied\)/);
  assert.match(button, /aria-label=\{linkCopyAriaLabel\(copied\)\}/);
  assert.match(button, /className="md-link-copy"/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /LINK_COPY_MS/);
  assert.match(button, /event\.preventDefault\(\)/);
  assert.match(button, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(button, /openOsBrowser/);
  assert.match(body, /<AssistantLinkCopyContext\.Provider value=\{completed\}>/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.doesNotMatch(userBranch, /md-link-copy/);
  assert.doesNotMatch(userBranch, /AssistantLinkCopyContext/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainEnd = app.indexOf("showAssistantCopy", plainStart);
  const plainBranch = app.slice(plainStart, plainEnd);
  assert.doesNotMatch(plainBranch, /md-link-copy/);
  const chrome = block(".md-link-copy");
  assert.match(chrome, /display:\s*none/);
  assert.match(chrome, /position:\s*absolute/);
  assert.match(chrome, /font-size:\s*12px/);
  assert.match(chrome, /color:\s*var\(--text-muted\)/);
  assert.match(chrome, /transition:\s*none/);
  assert.match(chrome, /animation:\s*none/);
  assert.match(css, /\.md-link-wrap:hover > \.md-link-copy/);
  assert.match(css, /\.md-link-wrap:focus-within > \.md-link-copy/);
  assert.match(css, /display:\s*inline/);
  const reduceAt = css.indexOf("v2.25: Reduce Motion");
  assert.ok(reduceAt >= 0);
  const reduce = css.slice(reduceAt, reduceAt + 400);
  assert.match(reduce, /\.md-link-copy/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  assert.doesNotMatch(shortcuts, /Copy link/);
  assert.doesNotMatch(iosShortcuts, /Copy link/);
});

test("iOS Copy Link still copies the destination and then shows Copied", () => {
  assert.match(preview, /static let copyLink = "Copy Link"/);
  assert.match(preview, /UIPasteboard\.general\.string = copyText\(url\)/);
  assert.match(preview, /LinkCopy\.clipboardText\(destination\(url\)\)/);
  assert.match(preview, /LinkCopy\.noteCopied\(\)/);
  assert.match(swift, /static func clipboardText\(_ destination: String\) -> String/);
  assert.match(swift, /snorlax\.linkCopied/);
  assert.match(chat, /LinkCopy\.copiedNotification/);
  assert.match(chat, /noteLinkCopied\(\)/);
  assert.match(chat, /LinkCopy\.copiedLabel/);
  assert.match(chat, /LinkCopy\.copiedAria/);
  assert.match(chat, /LinkCopy\.feedbackNanoseconds/);
  assert.match(chat, /LinkCopy\.animation\(reduceMotion: reduceMotion\)/);
  const confirm = sliceFn(chat, "if linkCopied {", "private func applyJumpChipPaint");
  assert.match(confirm, /Text\(LinkCopy\.copiedLabel\)/);
  assert.doesNotMatch(confirm, /Button\(LinkCopy\.copiedLabel\)/);
  assert.doesNotMatch(confirm, /openURL/);
  assert.doesNotMatch(shortcuts, /Copy link/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 225\. v2\.25/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_link_copy\.py/);
  assert.match(pkg, /linkCopy\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
