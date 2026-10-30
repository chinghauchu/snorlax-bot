// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { mathBlockClipboardText } from "./mathBlockCopy.ts";
import {
  MATH_BLOCK_SAVE_ARIA,
  MATH_BLOCK_SAVE_FILENAME,
  MATH_BLOCK_SAVE_LABEL,
  MATH_BLOCK_SAVE_MIME,
  MATH_BLOCK_SAVE_MS,
  MATH_BLOCK_SAVED_ARIA,
  MATH_BLOCK_SAVED_LABEL,
  mathBlockSaveAnimates,
  mathBlockSaveAriaLabel,
  mathBlockSaveBody,
  mathBlockSaveKeepsBlock,
  mathBlockSaveLabel,
  showMathBlockSave,
} from "./mathBlockSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "mathBlockSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "MathBlockSave.swift"),
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
const iosShortcuts = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatShortcuts.swift"),
  "utf8",
);

const PHRASE = "v2.29 save a math block";

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
  assert.equal(MATH_BLOCK_SAVE_LABEL, "Save");
  assert.equal(MATH_BLOCK_SAVED_LABEL, "Saved");
  assert.equal(MATH_BLOCK_SAVE_ARIA, "Save math");
  assert.equal(MATH_BLOCK_SAVED_ARIA, "Saved");
  assert.equal(MATH_BLOCK_SAVE_MS, 1500);
  assert.equal(MATH_BLOCK_SAVE_FILENAME, "math.tex");
  assert.equal(MATH_BLOCK_SAVE_MIME, "text/plain;charset=utf-8");
  assert.equal(mathBlockSaveLabel(false), "Save");
  assert.equal(mathBlockSaveLabel(true), "Saved");
  assert.equal(mathBlockSaveAriaLabel(false), "Save math");
  assert.equal(mathBlockSaveAriaLabel(true), "Saved");
  assert.equal(showMathBlockSave({ completed: true, closed: true, block: true }), true);
  assert.equal(showMathBlockSave({ completed: false, closed: true, block: true }), false);
  assert.equal(showMathBlockSave({ completed: true, closed: false, block: true }), false);
  assert.equal(showMathBlockSave({ completed: true, closed: true, block: false }), false);
  assert.equal(mathBlockSaveKeepsBlock(), true);
  assert.equal(mathBlockSaveAnimates(false), false);
  assert.equal(mathBlockSaveAnimates(true), false);
  assert.equal(src.includes("/v1/"), false);
  assert.equal(swift.includes("/v1/"), false);
  assert.equal(swift.includes("PHPhotoLibrary"), false);
  assert.equal(swift.includes("UserDefaults"), false);
  assert.match(swift, /static let saveLabel = "Save"/);
  assert.match(swift, /static let savedLabel = "Saved"/);
  assert.match(swift, /static let saveAria = "Save math"/);
  assert.match(swift, /static let filename = "math.tex"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /snorlax-math/);
  assert.match(src, /Never animate/);
});

test("the file is the TeX interior and not the delimiters", () => {
  const tex = "E = mc^2";
  assert.equal(mathBlockSaveBody(tex), tex);
  assert.equal(mathBlockSaveBody(tex), mathBlockClipboardText(tex));
  assert.equal(mathBlockSaveBody("  x\ny  "), "  x\ny  ");
  assert.equal(mathBlockSaveBody(""), "");
  assert.equal(mathBlockSaveBody("a\n").endsWith("\n\n"), false);
  assert.equal(mathBlockSaveBody("$$E$$").includes("$$$$"), false);
});

test("Save sits beside Copy and does not replace it", () => {
  const button = sliceFn(body, "function MathBlockCopyButton(", "function MathNode(");
  assert.match(button, /showMathBlockSave\(\{/);
  assert.match(button, /mathBlockSaveBody\(tex\)/);
  assert.match(button, /downloadMathBlock\(/);
  assert.match(button, /MATH_BLOCK_SAVE_FILENAME/);
  assert.match(button, /mathBlockSaveLabel\(saved\)/);
  assert.match(button, /aria-label=\{mathBlockSaveAriaLabel\(saved\)\}/);
  assert.match(button, /className="md-math-save"/);
  assert.match(button, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(button, /mathBlockSaveKeepsBlock\(\)/);
  assert.match(button, /MATH_BLOCK_SAVE_MS/);
  const copyAt = button.indexOf("mathCopyLabel");
  const saveAt = button.indexOf("mathBlockSaveLabel");
  assert.ok(copyAt >= 0 && copyAt < saveAt);
  const copyCall = sliceFn(button, "function onCopy", "function onSave");
  assert.match(copyCall, /mathBlockClipboardText\(tex\)/);
  assert.doesNotMatch(copyCall, /mathBlockSaveBody/);
  assert.doesNotMatch(copyCall, /downloadMathBlock/);
  const saveCall = sliceFn(button, "function onSave", "return (");
  assert.match(saveCall, /mathBlockSaveBody\(tex\)/);
  assert.match(saveCall, /MATH_BLOCK_SAVE_FILENAME/);
  assert.doesNotMatch(saveCall, /copyText/);
  assert.doesNotMatch(saveCall, /mathBlockClipboardText/);
  assert.doesNotMatch(saveCall, /\$\$/);
  assert.doesNotMatch(saveCall, /slot\.raw/);
  const save = block(".md-math-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-math-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".md-math-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for math Save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 40,
  );
  assert.match(reduce, /\.md-math-save/);
  const node = sliceFn(body, "function MathNode(", "function FootnoteText(");
  const inline = sliceFn(node, "if (!display)", "const equation");
  assert.doesNotMatch(inline, /md-math-save/);
  assert.doesNotMatch(inline, /showMathBlockSave/);
  const user = sliceFn(app, 'className="bubble user"', 'className="assistant-md"');
  assert.doesNotMatch(user, /mathBlockSave/);
  assert.doesNotMatch(user, /md-math-save/);
  assert.doesNotMatch(shortcuts, /Save math/);
  assert.doesNotMatch(iosShortcuts, /Save math/);
});

test("iOS Save writes the TeX and Copy stays", () => {
  const math = sliceFn(markdown, "struct MathBlock", "struct MathInline");
  assert.match(math, /MathBlockSave\.showsSave\(completed: completed, closed: closed\)/);
  assert.match(math, /MathBlockSave\.bodyText\(source\)/);
  assert.match(math, /MathBlockSave\.label\(saved: saved\)/);
  assert.match(math, /MathBlockSave\.accessibilityLabel\(saved: saved\)/);
  assert.match(math, /MathBlockSave\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(math, /MathBlockSave\.feedbackNanoseconds/);
  assert.match(math, /MathBlockSave\.filename/);
  assert.match(math, /MathBlockSave\.writeFile/);
  assert.match(math, /MathBlockSave\.keepsBlock\(\)/);
  assert.match(math, /focusable\(false\)/);
  assert.match(math, /UIActivityViewController/);
  assert.match(math, /MathBlockCopy\.clipboardText\(source\)/);
  assert.doesNotMatch(math, /PHPhotoLibrary/);
  assert.doesNotMatch(math, /CodeBlockSave/);
  const saveCall = sliceFn(math, "private func saveMath", "var body: some View");
  assert.doesNotMatch(saveCall, /UIPasteboard/);
  assert.doesNotMatch(saveCall, /raw/);
  const inline = sliceFn(markdown, "struct MathInline", "struct MathFallback");
  assert.doesNotMatch(inline, /MathBlockSave/);
  const user = sliceFn(chat, "} else if isUser {", "} else {");
  assert.doesNotMatch(user, /MathBlockSave/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 229\. v2\.29/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_math_block_save\.py/);
  assert.match(pkg, /mathBlockSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
