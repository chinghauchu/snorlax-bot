// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractMath } from "./math.ts";
import {
  MATH_INLINE_COPIED_ARIA,
  MATH_INLINE_COPIED_LABEL,
  MATH_INLINE_COPY_ARIA,
  MATH_INLINE_COPY_LABEL,
  MATH_INLINE_COPY_MS,
  mathInlineClipboardText,
  mathInlineCopyAnimates,
  mathInlineCopyAriaLabel,
  mathInlineCopyLabel,
  showMathInlineCopy,
} from "./mathInlineCopy.ts";
import { showMathBlockCopy } from "./mathBlockCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "mathInlineCopy.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "InlineMathCopy.swift"),
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

const PHRASE = "v2.27 copy inline math";

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

test("clipboard is the TeX interior, not the paren delimiters", () => {
  const tex = "E = mc^2";
  assert.equal(mathInlineClipboardText(tex), tex);
  assert.equal(mathInlineClipboardText("  keep\n\n"), "  keep\n\n");
  assert.equal(mathInlineClipboardText(""), "");
  const inline = extractMath("Energy is \\( E = mc^2 \\) today.");
  const slot = inline.slots.find((item) => item.kind === "inline");
  assert.ok(slot);
  assert.equal(slot.closed, true);
  assert.equal(mathInlineClipboardText(slot.tex), " E = mc^2 ");
  assert.doesNotMatch(mathInlineClipboardText(slot.tex), /\\\(/);
  assert.doesNotMatch(mathInlineClipboardText(slot.tex), /\\\)/);
  assert.match(slot.raw, /\\\(/);
  assert.match(slot.raw, /\\\)/);
  const tight = extractMath("See \\(x\\).");
  assert.equal(mathInlineClipboardText(tight.slots[0]?.tex ?? ""), "x");
  const blockMath = extractMath("$$\nE = mc^2\n$$\n");
  const display = blockMath.slots.find((item) => item.kind === "block");
  assert.ok(display);
  assert.equal(
    showMathBlockCopy({ completed: true, closed: true, block: true }),
    true,
  );
  assert.equal(showMathBlockCopy({ completed: true, closed: true, block: false }), false);
  assert.equal(MATH_INLINE_COPY_MS, 1500);
  assert.equal(MATH_INLINE_COPY_LABEL, "Copy");
  assert.equal(MATH_INLINE_COPIED_LABEL, "Copied");
  assert.equal(mathInlineCopyLabel(false), "Copy");
  assert.equal(mathInlineCopyLabel(true), "Copied");
  assert.equal(MATH_INLINE_COPY_ARIA, "Copy inline math");
  assert.equal(MATH_INLINE_COPIED_ARIA, "Copied");
  assert.equal(mathInlineCopyAriaLabel(false), "Copy inline math");
  assert.equal(mathInlineCopyAriaLabel(true), "Copied");
});

test("Copy is hidden while streaming or unclosed; confirmation does not animate", () => {
  assert.equal(showMathInlineCopy({ completed: true, closed: true }), true);
  assert.equal(showMathInlineCopy({ completed: false, closed: true }), false);
  assert.equal(showMathInlineCopy({ completed: true, closed: false }), false);
  const open = extractMath("Energy is \\( E = mc^2");
  const openSlot = open.slots.find((item) => item.kind === "inline");
  assert.ok(openSlot);
  assert.equal(openSlot.closed, false);
  assert.equal(
    showMathInlineCopy({ completed: true, closed: openSlot.closed }),
    false,
  );
  assert.equal(mathInlineCopyAnimates(false), false);
  assert.equal(mathInlineCopyAnimates(true), false);
  assert.match(src, /Never animate/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /copied \? copiedAria : copyAria/);
  assert.match(swift, /static func showsCopy\(completed: Bool, closed: Bool\) -> Bool/);
  assert.match(swift, /static let copyAria = "Copy inline math"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.doesNotMatch(src, /\$\$/);
});

test("desktop Copy sits beside the formula and copies the TeX only", () => {
  const chrome = block(".md-math-inline-copy");
  assert.match(chrome, /position:\s*absolute/);
  assert.match(chrome, /font-size:\s*12px/);
  assert.match(chrome, /color:\s*var\(--text-muted\)/);
  assert.match(chrome, /opacity:\s*0/);
  assert.match(chrome, /pointer-events:\s*none/);
  assert.match(chrome, /transition:\s*none/);
  assert.match(chrome, /animation:\s*none/);
  assert.match(css, /\.md-math-inline-wrap:hover > \.md-math-inline-copy/);
  assert.match(css, /\.md-math-inline-wrap:focus-within > \.md-math-inline-copy/);
  assert.match(css, /opacity:\s*1/);
  assert.match(css, /pointer-events:\s*auto/);
  const reduceAt = css.indexOf("v2.27: Reduce Motion");
  assert.ok(reduceAt >= 0, "missing Reduce Motion rule for inline math Copy");
  const reduce = css.slice(reduceAt, reduceAt + 280);
  assert.match(reduce, /\.md-math-inline-copy/);
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);

  const button = sliceFn(body, "function InlineMathCopyButton(", "function MathBlockCopyButton(");
  const node = sliceFn(body, "function MathNode(", "function FootnoteText(");
  const inline = sliceFn(node, "if (!display)", "const equation");
  assert.match(inline, /md-math-inline/);
  assert.match(inline, /showMathInlineCopy\(\{ completed, closed: slot\.closed \}\)/);
  assert.match(inline, /className="md-math-inline-wrap"/);
  assert.match(inline, /<InlineMathCopyButton tex=\{slot\.tex\} \/>/);
  assert.match(inline, /slot\.raw/);
  assert.doesNotMatch(inline, /md-math-bar/);
  assert.doesNotMatch(inline, /MathBlockCopyButton/);
  const display = sliceFn(node, "const equation", "function FootnoteText(");
  assert.match(display, /MathBlockCopyButton/);
  assert.doesNotMatch(display, /InlineMathCopyButton/);
  assert.match(button, /mathInlineClipboardText\(tex\)/);
  assert.match(button, /mathInlineCopyLabel\(copied\)/);
  assert.match(button, /aria-label=\{mathInlineCopyAriaLabel\(copied\)\}/);
  assert.match(button, /aria-live="polite"/);
  assert.match(button, /type="button"/);
  assert.match(button, /className="md-math-inline-copy"/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /event\.preventDefault\(\)/);
  assert.match(button, /event\.stopPropagation\(\)/);
  assert.match(button, /MATH_INLINE_COPY_MS/);
  const copyCall = button.slice(button.indexOf("function onCopy"), button.indexOf("setCopied(true)"));
  assert.match(copyCall, /mathInlineClipboardText\(tex\)/);
  assert.doesNotMatch(copyCall, /\$\$/);
  assert.doesNotMatch(copyCall, /slot\.raw/);
  assert.doesNotMatch(copyCall, /\\\(/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(userStart, userEnd);
  assert.doesNotMatch(userBranch, /md-math-inline-copy/);
  assert.doesNotMatch(userBranch, /InlineMathCopyButton/);
  const plainStart = app.indexOf('className="assistant-plain"');
  const plainEnd = app.indexOf("showAssistantCopy", plainStart);
  const plainBranch = app.slice(plainStart, plainEnd);
  assert.doesNotMatch(plainBranch, /md-math-inline-copy/);
  assert.doesNotMatch(shortcuts, /Copy inline math/);
  assert.doesNotMatch(iosShortcuts, /Copy inline math/);
});

test("iOS button copies the TeX beside a completed inline formula", () => {
  const button = sliceFn(markdown, "struct InlineMathCopyButton", "struct MathInline");
  const inline = sliceFn(markdown, "struct MathInline", "struct MathFallback");
  assert.match(button, /InlineMathCopy\.showsCopy\(completed: completed, closed: closed\)/);
  assert.match(button, /InlineMathCopy\.clipboardText\(tex\)/);
  assert.match(button, /InlineMathCopy\.label\(copied: copied\)/);
  assert.match(button, /InlineMathCopy\.accessibilityLabel\(copied: copied\)/);
  assert.match(button, /InlineMathCopy\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(button, /InlineMathCopy\.feedbackNanoseconds/);
  assert.match(button, /transcriptFont\(12\)/);
  assert.match(button, /focusable\(false\)/);
  assert.match(button, /UIPasteboard\.general\.string/);
  assert.doesNotMatch(button, /MathBlockCopy/);
  assert.doesNotMatch(button, /raw/);
  assert.match(inline, /InlineMathCopyButton\(tex: source, completed: completed, closed: closed\)/);
  assert.match(inline, /MathFallback\(raw: raw, block: false\)/);
  assert.doesNotMatch(inline, /MathBlockCopy/);
  assert.doesNotMatch(inline, /UIPasteboard/);
  const call = sliceFn(markdown, "case .inlineMath", "case .image");
  assert.match(call, /completed && closed/);
  assert.match(call, /MathInline\(/);
  assert.match(call, /completed: completed/);
  assert.match(call, /closed: closed/);
  assert.match(call, /MathFallback/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 227\. v2\.27/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_inline_math_copy\.py/);
  assert.match(pkg, /mathInlineCopy\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
