// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CODE_BLOCK_COLLAPSE_LINES,
  CODE_BLOCK_SHOW_LESS,
  CODE_BLOCK_SHOW_LESS_ARIA,
  CODE_BLOCK_SHOW_MORE,
  CODE_BLOCK_SHOW_MORE_ARIA,
  codeBlockCollapseAnimates,
  codeBlockCollapseAria,
  codeBlockCollapseLabel,
  codeBlockFindKeepsOpen,
  codeBlockFindRowId,
  codeBlockLineCount,
  codeBlockVisibleText,
  shouldCollapseCodeBlock,
  showCodeBlockCollapseToggle,
} from "./codeBlockCollapse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "codeBlockCollapse.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeBlockCollapse.swift"),
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

const PHRASE = "v2.19 collapse long code blocks";

function lines(count: number, trailing = false): string {
  const body = Array.from({ length: count }, (_, index) => `line ${index + 1}`).join(
    "\n",
  );
  return trailing ? `${body}\n` : body;
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function block(selector: string): string {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing ${selector}`);
  return css.slice(at, css.indexOf("}", at) + 1);
}

test("14 lines stay open and the 15th line collapses to the first 14", () => {
  assert.equal(CODE_BLOCK_COLLAPSE_LINES, 14);
  assert.equal(codeBlockLineCount(""), 0);
  assert.equal(codeBlockLineCount("\n"), 0);
  assert.equal(codeBlockLineCount("\n\n"), 2);
  assert.equal(codeBlockLineCount(lines(14)), 14);
  assert.equal(codeBlockLineCount(lines(14, true)), 14);
  assert.equal(codeBlockLineCount(lines(15, true)), 15);

  const open = {
    completed: true,
    lineCount: 14,
    expanded: false,
    activeFind: false,
  };
  assert.equal(shouldCollapseCodeBlock(open), false);
  assert.equal(
    showCodeBlockCollapseToggle({
      completed: true,
      lineCount: 14,
      activeFind: false,
    }),
    false,
  );

  const long = { ...open, lineCount: 15 };
  assert.equal(shouldCollapseCodeBlock(long), true);
  assert.equal(shouldCollapseCodeBlock({ ...long, completed: false }), false);
  assert.equal(shouldCollapseCodeBlock({ ...long, expanded: true }), false);
  assert.equal(shouldCollapseCodeBlock({ ...long, activeFind: true }), false);
  assert.equal(
    showCodeBlockCollapseToggle({
      completed: true,
      lineCount: 15,
      activeFind: false,
    }),
    true,
  );
  assert.equal(
    showCodeBlockCollapseToggle({
      completed: false,
      lineCount: 15,
      activeFind: false,
    }),
    false,
  );
  assert.equal(
    showCodeBlockCollapseToggle({
      completed: true,
      lineCount: 15,
      activeFind: true,
    }),
    false,
  );

  const full = lines(15, true);
  assert.equal(codeBlockVisibleText(full, false), full);
  assert.equal(codeBlockVisibleText(full, true), lines(14));
  assert.equal(codeBlockVisibleText(lines(14, true), false).endsWith("\n"), true);
});

test("an active find hit inside the block stays fully open", () => {
  const source = lines(20);
  assert.equal(
    codeBlockFindKeepsOpen({ activeRow: false, source, query: "line 20" }),
    false,
  );
  assert.equal(
    codeBlockFindKeepsOpen({ activeRow: true, source, query: "line 20" }),
    true,
  );
  assert.equal(
    codeBlockFindKeepsOpen({ activeRow: true, source, query: "LINE 16" }),
    true,
  );
  assert.equal(
    codeBlockFindKeepsOpen({ activeRow: true, source, query: "not here" }),
    false,
  );
  assert.equal(
    codeBlockFindKeepsOpen({ activeRow: true, source, query: "   " }),
    false,
  );
  assert.equal(codeBlockFindRowId("msg:0\u00003"), "msg:0");
  assert.equal(codeBlockFindRowId("msg#1\u0000indent\u00002"), "msg#1");
  assert.equal(codeBlockFindRowId("plain"), "plain");
  assert.equal(codeBlockFindRowId(""), "");
});

test("Show more names the code and does not animate", () => {
  assert.equal(CODE_BLOCK_SHOW_MORE, "Show more");
  assert.equal(CODE_BLOCK_SHOW_LESS, "Show less");
  assert.equal(codeBlockCollapseLabel(false), "Show more");
  assert.equal(codeBlockCollapseLabel(true), "Show less");
  assert.equal(CODE_BLOCK_SHOW_MORE_ARIA, "Show more code");
  assert.equal(CODE_BLOCK_SHOW_LESS_ARIA, "Show less code");
  assert.equal(codeBlockCollapseAria(false), "Show more code");
  assert.equal(codeBlockCollapseAria(true), "Show less code");
  assert.equal(codeBlockCollapseAnimates(false), false);
  assert.equal(codeBlockCollapseAnimates(true), false);
  assert.match(src, /No new HTTP/);
  assert.match(src, /No animation/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /new Map/);
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.match(swift, /static let showMore = "Show more"/);
  assert.match(swift, /static let showLess = "Show less"/);
  assert.match(swift, /static let showMoreAria = "Show more code"/);
  assert.match(swift, /static let lines = 14/);
  assert.match(swift, /static func findKeepsOpen\(/);
  assert.match(swift, /ChatFind.indexHits/);
  assert.match(swift, /return false/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UserDefaults/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});

test("desktop and iOS collapse each finished code block and still copy it all", () => {
  const chrome = sliceFn(body, "function FenceChrome(", "function FenceBar(");
  assert.match(chrome, /codeBlockLineCount\(source\)/);
  assert.match(chrome, /codeBlockFindRowId\(wrapId\)/);
  assert.match(chrome, /codeBlockFindKeepsOpen\(/);
  assert.match(chrome, /shouldCollapseCodeBlock\(/);
  assert.match(chrome, /codeBlockVisibleText\(source, collapsed\)/);
  assert.match(chrome, /showCodeBlockCollapseToggle\(/);
  assert.match(chrome, /source=\{shown\}/);
  assert.match(chrome, /className="md-fence-more"/);
  assert.match(chrome, /aria-label=\{codeBlockCollapseAria\(expanded\)\}/);
  assert.match(chrome, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(chrome, /codeBlockCollapseLabel\(expanded\)/);
  assert.match(chrome, /source=\{source\}/);
  const keep = sliceFn(body, "function keepCodeBlockFocus(", "function FenceChrome(");
  assert.match(keep, /preventDefault\(\)/);
  assert.doesNotMatch(keep, /\.focus\(/);
  const bar = sliceFn(body, "function FenceBar(", "function HighlightedCode(");
  assert.match(bar, /codeBlockClipboardText\(source\)/);
  assert.doesNotMatch(bar, /shown/);
  const diagram = sliceFn(body, "if (!svg)", "function FenceChrome(");
  const picture = diagram.slice(diagram.lastIndexOf("return ("));
  assert.match(picture, /md-mermaid-body/);
  assert.doesNotMatch(picture, /md-fence-more/);
  assert.doesNotMatch(picture, /codeBlockVisibleText/);
  assert.match(app, /FindQueryProvider query=\{findQueryShown\} rowId=\{activeFindHit\?\.rowId \?\? ""\}/);
  assert.match(body, /useFindRowId\(\)/);

  const button = block(".md-fence-more");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /font-weight:\s*500/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(button, /animation:\s*none/);
  const reduceAt = css.indexOf(".md-fence-more {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for code collapse");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 80,
  );
  assert.match(reduce, /\.md-fence-more/);
  assert.match(reduce, /animation:\s*none/);

  const fence = sliceFn(markdown, "struct CodeFence", "struct FenceMoreButton");
  assert.match(fence, /CodeBlockCollapse.visibleText\(source, collapsed: collapsed\)/);
  assert.match(fence, /CodeBlockCollapse.shouldCollapse\(/);
  assert.match(fence, /CodeBlockCollapse.findKeepsOpen\(/);
  assert.match(fence, /FenceBar\(/);
  assert.match(fence, /source: source/);
  assert.match(
    fence,
    /FenceSource\(source: source, wrapped: wrapped, language: language, completed: completed\)/,
  );
  assert.match(fence, /expanded = false/);
  const more = sliceFn(markdown, "struct FenceMoreButton", "struct FenceBar");
  assert.match(more, /CodeBlockCollapse.label\(expanded: expanded\)/);
  assert.match(more, /CodeBlockCollapse.accessibilityLabel\(expanded: expanded\)/);
  assert.match(more, /focusable\(false\)/);
  assert.doesNotMatch(more, /\.focus\(/);
  const mermaid = sliceFn(markdown, "struct MermaidFence", "struct CodeFence");
  assert.match(mermaid, /if failed \{/);
  assert.match(mermaid, /FenceMoreButton\(/);
  assert.match(mermaid, /FenceSource\(source: source, wrapped: wrapped\)/);
  assert.match(mermaid, /CodeBlockCollapse.visibleText/);
  const failed = sliceFn(mermaid, "if failed {", "ScrollView(.horizontal");
  assert.match(failed, /FenceMoreButton\(/);
  assert.doesNotMatch(failed, /FenceSource/);
  const afterFailed = markdown.slice(markdown.indexOf("if failed {"));
  const scrollAt = afterFailed.indexOf("ScrollView(.horizontal");
  const pictureOnly = afterFailed.slice(
    scrollAt,
    afterFailed.indexOf(".padding(.horizontal, 10)", scrollAt),
  );
  assert.doesNotMatch(pictureOnly, /FenceMoreButton/);
  assert.doesNotMatch(pictureOnly, /CodeBlockCollapse/);
  assert.doesNotMatch(shortcuts, /Show more code/);
  assert.doesNotMatch(iosShortcuts, /Show more code/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 219\. v2\.19/);
  assert.match(ci, /test_ios_code_block_collapse\.py/);
  assert.match(pkg, /src\/codeBlockCollapse\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
