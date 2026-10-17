// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CODE_BLOCK_UNWRAP_ARIA,
  CODE_BLOCK_UNWRAP_LABEL,
  CODE_BLOCK_WRAP_ARIA,
  CODE_BLOCK_WRAP_LABEL,
  clearCodeBlockWrapSession,
  codeBlockWrapAnimates,
  codeBlockWrapAriaLabel,
  codeBlockWrapClass,
  codeBlockWrapId,
  codeBlockWrapLabel,
  codeBlockWrapPersists,
  codeBlockWrapsByDefault,
  readCodeBlockWrap,
  showCodeBlockWrap,
  toggleCodeBlockWrap,
} from "./codeBlockWrap.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "codeBlockWrap.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeBlockWrap.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
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

const PHRASE = "v1.29 soft-wrap toggle on assistant code blocks";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("wrap defaults off, is per block, and dies with the session", () => {
  clearCodeBlockWrapSession();
  assert.equal(codeBlockWrapsByDefault(), false);
  assert.equal(codeBlockWrapPersists(), false);
  const first = codeBlockWrapId("msg-1:0", 0);
  const second = codeBlockWrapId("msg-1:0", 1);
  const otherChat = codeBlockWrapId("msg-2:0", 0);
  assert.equal(readCodeBlockWrap(first), false);
  assert.equal(readCodeBlockWrap(""), false);
  assert.equal(toggleCodeBlockWrap(first, false), true);
  assert.equal(readCodeBlockWrap(first), true);
  assert.equal(readCodeBlockWrap(second), false);
  assert.equal(readCodeBlockWrap(otherChat), false);
  assert.equal(toggleCodeBlockWrap(second, false), true);
  assert.equal(readCodeBlockWrap(first), true);
  assert.equal(toggleCodeBlockWrap(first, true), false);
  assert.equal(readCodeBlockWrap(first), false);
  assert.equal(readCodeBlockWrap(second), true);
  clearCodeBlockWrapSession();
  assert.equal(readCodeBlockWrap(second), false);
  assert.equal(showCodeBlockWrap(false), false);
  assert.equal(showCodeBlockWrap(true), true);
  assert.equal(codeBlockWrapAnimates(false), false);
  assert.equal(codeBlockWrapAnimates(true), false);
});

test("the control reads Wrap, then Unwrap, and names the action", () => {
  assert.equal(CODE_BLOCK_WRAP_LABEL, "Wrap");
  assert.equal(CODE_BLOCK_UNWRAP_LABEL, "Unwrap");
  assert.equal(codeBlockWrapLabel(false), "Wrap");
  assert.equal(codeBlockWrapLabel(true), "Unwrap");
  assert.equal(CODE_BLOCK_WRAP_ARIA, "Wrap lines");
  assert.equal(CODE_BLOCK_UNWRAP_ARIA, "Unwrap lines");
  assert.equal(codeBlockWrapAriaLabel(false), "Wrap lines");
  assert.equal(codeBlockWrapAriaLabel(true), "Unwrap lines");
  assert.equal(codeBlockWrapClass(false), "md-fence-body");
  assert.equal(codeBlockWrapClass(true), "md-fence-body md-fence-body-wrap");
  assert.match(src, /Not written to disk/);
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /not written to disk/);
  assert.doesNotMatch(swift, /UserDefaults/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(swift, /static let wrapLabel = "Wrap"/);
  assert.match(swift, /static let unwrapLabel = "Unwrap"/);
  assert.match(swift, /return nil/);
});

test("desktop fence header keeps the language label and adds Wrap beside Copy", () => {
  const scroll = block(".md-fence-body");
  assert.match(scroll, /overflow-x:\s*auto/);
  assert.match(scroll, /white-space:\s*pre/);
  assert.doesNotMatch(scroll, /pre-wrap/);
  const wrap = block(".md-fence-body.md-fence-body-wrap,\n.md-fence-body.md-fence-body-wrap code");
  assert.match(wrap, /white-space:\s*pre-wrap/);
  assert.match(wrap, /overflow-wrap:\s*anywhere/);
  assert.match(wrap, /overflow-x:\s*hidden/);
  const button = block(".md-fence-wrap");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(button, /animation:\s*none/);
  assert.match(block(".md-fence-wrap:focus-visible"), /outline:/);
  assert.match(block(".md-fence-actions"), /margin-left:\s*auto/);
  const reduceAt = css.indexOf(".md-fence-wrap,\n  .md-fence-body.md-fence-body-wrap");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for fence wrap");
  const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt), reduceAt + 180);
  assert.match(reduce, /\.md-fence-wrap/);
  assert.match(reduce, /animation:\s*none/);

  const bar = sliceFn(body, "function FenceBar(", "function fenceFromChildren");
  assert.match(bar, /className="md-fence-lang"/);
  assert.match(bar, /showCodeBlockWrap\(completed\)/);
  assert.match(bar, /codeBlockWrapLabel\(wrapped\)/);
  assert.match(bar, /aria-label=\{codeBlockWrapAriaLabel\(wrapped\)\}/);
  assert.match(bar, /aria-pressed=\{wrapped\}/);
  assert.match(bar, /className="md-fence-wrap"/);
  assert.match(bar, /className="md-copy"/);
  assert.match(bar, /codeBlockClipboardText\(source\)/);
  const chrome = sliceFn(body, "function FenceChrome(", "function FenceBar(");
  assert.match(chrome, /toggleCodeBlockWrap\(wrapId, wrapped\)/);
  assert.match(chrome, /codeBlockWrapClass\(wrapOn\)/);
  assert.match(chrome, /showCodeBlockWrap\(completed\) && wrapped/);
  const success = sliceFn(body, "if (!svg)", "function FenceChrome");
  const diagram = success.slice(success.lastIndexOf("return ("));
  assert.match(diagram, /md-mermaid-body/);
  assert.doesNotMatch(diagram, /onToggleWrap/);
  assert.doesNotMatch(diagram, /md-fence-wrap/);
  assert.match(app, /wrapScope=\{bubbleRowId\}/);
  assert.doesNotMatch(shortcuts, /Wrap lines/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("OpenAPI stays 0.18.0 and the spec records the wrap toggle", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(spec, /## 129\. v1\.29/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_code_block_wrap\.py/);
  assert.match(markdown, /CodeBlockWrap\.label\(wrapped: wrapped\)/);
  assert.match(markdown, /CodeBlockWrap\.showsWrap\(completed: completed\)/);
  assert.match(markdown, /showsWrap: failed/);
  assert.match(markdown, /showsWrap: true/);
  assert.match(markdown, /FenceSource\(source: source, wrapped: wrapped\)/);
  assert.match(markdown, /ScrollView\(\.horizontal/);
  assert.match(chat, /wrapScope:/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
