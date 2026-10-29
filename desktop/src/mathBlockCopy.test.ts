// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractMath } from "./math.ts";
import {
  MATH_BLOCK_COPIED_ARIA,
  MATH_BLOCK_COPIED_LABEL,
  MATH_BLOCK_COPY_ARIA,
  MATH_BLOCK_COPY_LABEL,
  MATH_BLOCK_COPY_MS,
  mathBlockClipboardText,
  mathBlockCopyAnimates,
  mathCopyAriaLabel,
  mathCopyLabel,
  showMathBlockCopy,
} from "./mathBlockCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "mathBlockCopy.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "MathBlockCopy.swift"),
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

const PHRASE = "v2.23 copy a math block";

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

test("clipboard is the TeX interior, not the dollar delimiters", () => {
  const tex = "E = mc^2";
  assert.equal(mathBlockClipboardText(tex), tex);
  assert.equal(mathBlockClipboardText("  keep\n\n"), "  keep\n\n");
  assert.equal(mathBlockClipboardText(""), "");
  const blockMath = extractMath("See.\n\n$$\nE = mc^2\n$$\n");
  const slot = blockMath.slots.find((item) => item.kind === "block");
  assert.ok(slot);
  assert.equal(slot.closed, true);
  assert.equal(mathBlockClipboardText(slot.tex), "E = mc^2");
  assert.doesNotMatch(mathBlockClipboardText(slot.tex), /\$\$/);
  assert.doesNotMatch(slot.tex, /\$\$/);
  const inline = extractMath("Energy is \\( E = mc^2 \\).");
  const inlineSlot = inline.slots.find((item) => item.kind === "inline");
  assert.ok(inlineSlot);
  assert.equal(
    showMathBlockCopy({ completed: true, closed: true, block: false }),
    false,
  );
  assert.equal(MATH_BLOCK_COPY_MS, 1500);
  assert.equal(MATH_BLOCK_COPY_LABEL, "Copy");
  assert.equal(MATH_BLOCK_COPIED_LABEL, "Copied");
  assert.equal(mathCopyLabel(false), "Copy");
  assert.equal(mathCopyLabel(true), "Copied");
  assert.equal(MATH_BLOCK_COPY_ARIA, "Copy math");
  assert.equal(MATH_BLOCK_COPIED_ARIA, "Copied");
  assert.equal(mathCopyAriaLabel(false), "Copy math");
  assert.equal(mathCopyAriaLabel(true), "Copied");
});

test("Copy is hidden while streaming or unclosed; confirmation does not animate", () => {
  assert.equal(showMathBlockCopy({ completed: true, closed: true, block: true }), true);
  assert.equal(showMathBlockCopy({ completed: false, closed: true, block: true }), false);
  assert.equal(showMathBlockCopy({ completed: true, closed: false, block: true }), false);
  assert.equal(showMathBlockCopy({ completed: true, closed: true, block: false }), false);
  assert.equal(mathBlockCopyAnimates(false), false);
  assert.equal(mathBlockCopyAnimates(true), false);
  assert.match(src, /Never animate/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /copied \? copiedAria : copyAria/);
  assert.match(swift, /static func showsCopy\(completed: Bool, closed: Bool\) -> Bool/);
  assert.match(swift, /static let copyAria = "Copy math"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});

test("desktop button sits above the equation and copies the TeX only", () => {
  const bar = block(".md-math-bar");
  assert.match(bar, /display:\s*flex/);
  assert.match(bar, /justify-content:\s*flex-end/);
  const reduceAt = css.indexOf(".md-math-bar .md-copy {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for math Copy");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 20,
  );
  assert.match(reduce, /\.md-math-bar/);

  const button = sliceFn(body, "function MathBlockCopyButton(", "function MathNode(");
  const node = sliceFn(body, "function MathNode(", "function FootnoteText(");
  assert.match(node, /showMathBlockCopy\(\{/);
  assert.match(node, /<MathBlockCopyButton tex=\{slot\.tex\} \/>/);
  assert.match(button, /mathBlockClipboardText\(tex\)/);
  assert.match(button, /mathCopyLabel\(copied\)/);
  assert.match(button, /aria-label=\{mathCopyAriaLabel\(copied\)\}/);
  assert.match(button, /aria-live="polite"/);
  assert.match(button, /type="button"/);
  assert.match(button, /className="md-copy"/);
  assert.match(button, /className="md-math-bar"/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /MATH_BLOCK_COPY_MS/);
  assert.match(node, /className="md-math-block"/);
  const inline = sliceFn(node, "if (!display)", "const equation");
  assert.match(inline, /md-math-inline/);
  assert.doesNotMatch(inline, /md-math-bar/);
  assert.doesNotMatch(inline, /MathBlockCopyButton/);
  const copyCall = button.slice(button.indexOf("function onCopy"), button.indexOf("setCopied(true)"));
  assert.match(copyCall, /mathBlockClipboardText\(tex\)/);
  assert.doesNotMatch(copyCall, /\$\$/);
  assert.doesNotMatch(copyCall, /slot\.raw/);
});

test("iOS button copies the TeX and inline math stays plain", () => {
  const math = sliceFn(markdown, "struct MathBlock", "struct MathInline");
  assert.match(math, /MathBlockCopy\.showsCopy\(completed: completed, closed: closed\)/);
  assert.match(math, /MathBlockCopy\.clipboardText\(source\)/);
  assert.match(math, /MathBlockCopy\.label\(copied: copied\)/);
  assert.match(math, /MathBlockCopy\.accessibilityLabel\(copied: copied\)/);
  assert.match(math, /MathBlockCopy\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(math, /MathBlockCopy\.feedbackNanoseconds/);
  assert.match(math, /focusable\(false\)/);
  assert.match(math, /UIPasteboard\.general\.string/);
  assert.doesNotMatch(math, /CodeBlockCopy/);
  assert.doesNotMatch(math, /CodeBlockSave/);
  assert.doesNotMatch(math, /CodeBlockLines/);
  const inline = sliceFn(markdown, "struct MathInline", "struct MathFallback");
  assert.doesNotMatch(inline, /MathBlockCopy/);
  assert.doesNotMatch(inline, /UIPasteboard/);
  const streaming = sliceFn(markdown, "case .blockMath", "if showFootnotes");
  assert.match(streaming, /completed && closed/);
  assert.match(streaming, /MathFallback/);
  assert.doesNotMatch(shortcuts, /Copy math/);
  assert.doesNotMatch(iosShortcuts, /Copy math/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 223\. v2\.23/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_math_block_copy\.py/);
  assert.match(pkg, /mathBlockCopy\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
