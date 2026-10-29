// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { highlightCode } from "./codeHighlight.ts";
import { codeBlockClipboardText } from "./codeBlockCopy.ts";
import {
  CODE_BLOCK_LINES_ARIA,
  CODE_BLOCK_LINES_LABEL,
  CODE_BLOCK_LINES_OFF_ARIA,
  CODE_BLOCK_LINES_OFF_LABEL,
  clearCodeBlockLinesSession,
  codeBlockDisplayRows,
  codeBlockGutterChars,
  codeBlockGutterLabel,
  codeBlockLinesAnimates,
  codeBlockLinesAriaLabel,
  codeBlockLinesByDefault,
  codeBlockLinesClass,
  codeBlockLinesId,
  codeBlockLinesInClipboard,
  codeBlockLinesLabel,
  codeBlockLinesPersists,
  codeBlockNumberedBody,
  codeBlockNumberedLines,
  readCodeBlockLines,
  showCodeBlockLines,
  splitHighlightedLines,
  toggleCodeBlockLines,
} from "./codeBlockLines.ts";
import { codeBlockSaveBody } from "./codeBlockSave.ts";
import {
  clearCodeBlockWrapSession,
  codeBlockWrapId,
  readCodeBlockWrap,
  toggleCodeBlockWrap,
} from "./codeBlockWrap.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "codeBlockLines.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const shortcuts = readFileSync(join(here, "chatShortcuts.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeBlockLines.swift"),
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
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");

const PHRASE = "v2.22 show line numbers on a code block";

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

test("line numbers default off, are per block, and die with the session", () => {
  clearCodeBlockLinesSession();
  clearCodeBlockWrapSession();
  assert.equal(codeBlockLinesByDefault(), false);
  assert.equal(codeBlockLinesPersists(), false);
  assert.equal(codeBlockLinesInClipboard(), false);
  const first = codeBlockLinesId("msg-1:0", 0);
  const second = codeBlockLinesId("msg-1:0", 1);
  assert.equal(first, codeBlockWrapId("msg-1:0", 0));
  assert.equal(readCodeBlockLines(first), false);
  assert.equal(readCodeBlockLines(""), false);
  assert.equal(toggleCodeBlockLines(first, false), true);
  assert.equal(readCodeBlockLines(first), true);
  assert.equal(readCodeBlockLines(second), false);
  assert.equal(readCodeBlockWrap(first), false);
  toggleCodeBlockWrap(first, false);
  assert.equal(readCodeBlockLines(first), true);
  assert.equal(toggleCodeBlockLines(first, true), false);
  assert.equal(readCodeBlockWrap(first), true);
  clearCodeBlockLinesSession();
  assert.equal(readCodeBlockLines(first), false);
  assert.equal(readCodeBlockWrap(first), true);
  clearCodeBlockWrapSession();
  assert.equal(showCodeBlockLines(false), false);
  assert.equal(showCodeBlockLines(true), true);
  assert.equal(codeBlockLinesAnimates(false), false);
  assert.equal(codeBlockLinesAnimates(true), false);
});

test("the gutter is 1-based and is not part of the copied or saved text", () => {
  assert.deepEqual(codeBlockNumberedLines(""), []);
  assert.deepEqual(codeBlockNumberedLines("\n"), []);
  assert.deepEqual(codeBlockNumberedLines("a\n"), ["a"]);
  assert.deepEqual(codeBlockNumberedLines("a\n\n"), ["a", ""]);
  assert.deepEqual(codeBlockNumberedLines("a\nb"), ["a", "b"]);
  assert.equal(codeBlockNumberedBody("a\n"), "a");
  assert.equal(codeBlockGutterLabel(0), "1");
  assert.equal(codeBlockGutterLabel(9), "10");
  assert.equal(codeBlockGutterChars(0), 1);
  assert.equal(codeBlockGutterChars(9), 1);
  assert.equal(codeBlockGutterChars(10), 2);
  assert.equal(codeBlockGutterChars(100), 3);
  const source = "alpha\nbeta\n";
  assert.equal(codeBlockClipboardText(source), source);
  assert.equal(codeBlockSaveBody(source), source);
  assert.equal(codeBlockLinesInClipboard(), false);
  const rows = codeBlockDisplayRows(source, "", true);
  assert.equal(rows.length, 2);
  assert.equal(rows.map((row) => row.map((span) => span.text).join("")).join("\n"), "alpha\nbeta");
  assert.equal(codeBlockLinesClass(false), "");
  assert.equal(codeBlockLinesClass(true), " md-fence-body-lines");
});

test("a multiline string stays colored after the gutter split", () => {
  const source = 'x = """\nhello\n"""\n';
  const body = codeBlockNumberedBody(source);
  const tokens = highlightCode(body, "python");
  const split = splitHighlightedLines(tokens);
  assert.equal(split.length, codeBlockNumberedLines(source).length);
  const hello = split[1] ?? [];
  assert.ok(hello.some((span) => span.kind === "string" && span.text.includes("hello")));
  const rows = codeBlockDisplayRows(source, "python", true);
  assert.equal(rows.length, split.length);
  assert.equal(
    rows.map((row) => row.map((span) => span.text).join("")).join("\n"),
    body,
  );
  const plain = splitHighlightedLines([{ text: "a\nb\n", kind: "plain" }]);
  assert.equal(plain.length, 3);
  assert.deepEqual(plain[2], []);
});

test("the control reads Lines, then No lines", () => {
  assert.equal(CODE_BLOCK_LINES_LABEL, "Lines");
  assert.equal(CODE_BLOCK_LINES_OFF_LABEL, "No lines");
  assert.equal(codeBlockLinesLabel(false), "Lines");
  assert.equal(codeBlockLinesLabel(true), "No lines");
  assert.equal(CODE_BLOCK_LINES_ARIA, "Show line numbers");
  assert.equal(CODE_BLOCK_LINES_OFF_ARIA, "Hide line numbers");
  assert.equal(codeBlockLinesAriaLabel(false), "Show line numbers");
  assert.equal(codeBlockLinesAriaLabel(true), "Hide line numbers");
  assert.match(src, /Not written to disk/);
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /not written to disk/);
  assert.doesNotMatch(swift, /UserDefaults/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(swift, /static let linesLabel = "Lines"/);
  assert.match(swift, /static let hideLabel = "No lines"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /includedInClipboard\(\) -> Bool \{ false \}/);
});

test("desktop fence header adds Lines beside Wrap and keeps Copy on the source", () => {
  const button = block(".md-fence-lines");
  assert.match(button, /font-size:\s*12px/);
  assert.match(button, /color:\s*var\(--text-muted\)/);
  assert.match(button, /transition:\s*none/);
  assert.match(button, /animation:\s*none/);
  assert.match(block(".md-fence-lines:focus-visible"), /outline:/);
  const gutter = block(".md-fence-gutter-col");
  assert.match(gutter, /position:\s*sticky/);
  assert.match(gutter, /user-select:\s*none/);
  assert.match(gutter, /box-sizing:\s*content-box/);
  assert.match(gutter, /color:\s*var\(--text-muted\)/);
  const reduceAt = css.indexOf(
    ".md-fence-lines,\n  .md-fence-gutter,\n  .md-fence-gutter-col {\n    transition: none;\n    animation: none;",
  );
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for line numbers");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 24,
  );
  assert.match(reduce, /\.md-fence-lines/);

  const bar = sliceFn(body, "function FenceBar(", "function NumberedCode(");
  assert.match(bar, /showCodeBlockLines\(completed\)/);
  assert.match(bar, /codeBlockLinesLabel\(numbered\)/);
  assert.match(bar, /aria-label=\{codeBlockLinesAriaLabel\(numbered\)\}/);
  assert.match(bar, /aria-pressed=\{numbered\}/);
  assert.match(bar, /className="md-fence-lines"/);
  assert.match(bar, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(bar, /codeBlockClipboardText\(source\)/);
  assert.match(bar, /codeBlockSaveBody\(source\)/);
  const linesAt = bar.indexOf('className="md-fence-lines"');
  const wrapAt = bar.indexOf('className="md-fence-wrap"');
  const copyAt = bar.indexOf('className="md-copy"');
  assert.ok(linesAt > 0 && linesAt < wrapAt && wrapAt < copyAt);
  assert.doesNotMatch(bar, /shown/);
  const chrome = sliceFn(body, "function FenceChrome(", "function FenceBar(");
  assert.match(chrome, /toggleCodeBlockLines\(wrapId, numbered\)/);
  assert.match(chrome, /codeBlockLinesClass\(linesOn\)/);
  assert.match(chrome, /codeBlockWrapClass\(wrapOn\)/);
  assert.match(chrome, /showCodeBlockLines\(completed\) && numbered/);
  assert.match(chrome, /<NumberedCode/);
  assert.match(chrome, /<HighlightedCode/);
  const numbered = sliceFn(body, "function NumberedCode(", "function HighlightedCode(");
  assert.match(numbered, /codeBlockDisplayRows\(source, language, completed\)/);
  assert.match(numbered, /md-fence-gutter-col/);
  assert.match(numbered, /md-fence-line/);
  assert.match(numbered, /aria-hidden="true"/);
  assert.match(numbered, /codeBlockGutterLabel\(index\)/);
  const success = sliceFn(body, "if (!svg)", "function FenceChrome");
  const diagram = success.slice(success.lastIndexOf("return ("));
  assert.match(diagram, /md-mermaid-body/);
  assert.doesNotMatch(diagram, /onToggleLines/);
  assert.doesNotMatch(diagram, /md-fence-lines/);
  const math = sliceFn(body, "function MathNode(", "function FootnoteText(");
  assert.doesNotMatch(math, /showCodeBlockLines/);
  assert.doesNotMatch(math, /md-fence-lines/);
  assert.doesNotMatch(shortcuts, /Show line numbers/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("OpenAPI stays 0.18.0 and the spec records line numbers", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, /## 222\. v2\.22/);
  assert.match(spec, new RegExp(PHRASE));
  assert.match(ci, /python3 ios\/scripts\/test_ios_code_block_lines\.py/);
  assert.match(pkg, /codeBlockLines\.test\.ts/);
  assert.match(markdown, /CodeBlockLines\.label\(numbered: numbered\)/);
  assert.match(markdown, /CodeBlockLines\.showsLines\(completed: completed\)/);
  assert.match(markdown, /showsLines: failed/);
  assert.match(markdown, /showsLines: true/);
  assert.match(markdown, /codeBlockNumbered/);
  assert.match(markdown, /CodeBlockLines\.gutterLabel\(index: index\)/);
  assert.match(markdown, /CodeHighlight\.paint\(source, language: language, completed: completed\)/);
  assert.match(markdown, /FenceSource\(source: source, wrapped: wrapped, language: language, completed: completed\)/);
  assert.match(markdown, /FenceSource\(source: source, wrapped: wrapped\)/);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.doesNotMatch(iosShortcuts, /Show line numbers/);
  const iosMath = sliceFn(markdown, "struct MathBlock", "struct MathFallback");
  assert.doesNotMatch(iosMath, /CodeBlockLines/);
});
