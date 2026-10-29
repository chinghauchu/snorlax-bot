// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CODE_BLOCK_SAVE_ARIA,
  CODE_BLOCK_SAVE_EXTENSIONS,
  CODE_BLOCK_SAVE_FALLBACK,
  CODE_BLOCK_SAVE_FILE_NAMES,
  CODE_BLOCK_SAVE_LABEL,
  CODE_BLOCK_SAVE_MAX,
  CODE_BLOCK_SAVE_MIME,
  CODE_BLOCK_SAVE_STEM,
  codeBlockSaveAnimates,
  codeBlockSaveBody,
  codeBlockSaveFilename,
  codeBlockSaveKeepsFence,
  showCodeBlockSave,
} from "./codeBlockSave.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "codeBlockSave.ts"), "utf8");
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
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeBlockSave.swift"),
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

const PHRASE = "v2.21 save a code block";

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

function quotedPairs(text: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const match of text.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    pairs.set(match[1] ?? "", match[2] ?? "");
  }
  return pairs;
}

test("the file name follows the fence info string", () => {
  assert.equal(codeBlockSaveFilename(""), CODE_BLOCK_SAVE_FALLBACK);
  assert.equal(codeBlockSaveFilename("   "), CODE_BLOCK_SAVE_FALLBACK);
  assert.equal(codeBlockSaveFilename("python"), "snippet.py");
  assert.equal(codeBlockSaveFilename("Python"), "snippet.py");
  assert.equal(codeBlockSaveFilename("python extra"), "snippet.py");
  assert.equal(codeBlockSaveFilename("c++"), "snippet.cpp");
  assert.equal(codeBlockSaveFilename("C#"), "snippet.cs");
  assert.equal(codeBlockSaveFilename("typescript"), "snippet.ts");
  assert.equal(codeBlockSaveFilename("mermaid"), "snippet.mmd");
  assert.equal(codeBlockSaveFilename("kotlin"), "snippet.kt");
  assert.equal(codeBlockSaveFilename("src/app.ts"), "app.ts");
  assert.equal(codeBlockSaveFilename("src\\App.TSX"), "App.TSX");
  assert.equal(codeBlockSaveFilename("./notes.txt"), "notes.txt");
  assert.equal(codeBlockSaveFilename("dockerfile"), "Dockerfile");
  assert.equal(codeBlockSaveFilename("Makefile"), "Makefile");
  assert.equal(codeBlockSaveFilename("gemfile"), "Gemfile");
  assert.equal(codeBlockSaveFilename("notes"), CODE_BLOCK_SAVE_FALLBACK);
  assert.equal(codeBlockSaveFilename(".."), CODE_BLOCK_SAVE_FALLBACK);
  assert.equal(codeBlockSaveFilename("../secret.py"), "secret.py");
  assert.equal(codeBlockSaveFilename("dir/CON.txt"), CODE_BLOCK_SAVE_FALLBACK);
  assert.equal(codeBlockSaveFilename("con"), CODE_BLOCK_SAVE_FALLBACK);
  assert.equal(codeBlockSaveFilename("foo:bar.py"), "foobar.py");
  const long = `${"a".repeat(90)}.py`;
  const capped = codeBlockSaveFilename(long);
  assert.equal(capped.length, CODE_BLOCK_SAVE_MAX);
  assert.ok(capped.endsWith(".py"));
  assert.equal(CODE_BLOCK_SAVE_EXTENSIONS.python, "py");
  assert.equal(CODE_BLOCK_SAVE_EXTENSIONS["c++"], "cpp");
  assert.equal(CODE_BLOCK_SAVE_FILE_NAMES.dockerfile, "Dockerfile");
  assert.equal(CODE_BLOCK_SAVE_STEM, "snippet");
});

test("Save writes the full fence body and does not animate", () => {
  const bodyText = "  keep\n\nline\n";
  assert.equal(codeBlockSaveBody(bodyText), bodyText);
  assert.equal(codeBlockSaveBody(""), "");
  assert.equal(codeBlockSaveBody("```not a wrapper"), "```not a wrapper");
  assert.equal(showCodeBlockSave(true), true);
  assert.equal(showCodeBlockSave(false), false);
  assert.equal(codeBlockSaveKeepsFence(), true);
  assert.equal(codeBlockSaveAnimates(false), false);
  assert.equal(codeBlockSaveAnimates(true), false);
  assert.equal(CODE_BLOCK_SAVE_LABEL, "Save");
  assert.equal(CODE_BLOCK_SAVE_ARIA, "Save code");
  assert.equal(CODE_BLOCK_SAVE_MIME, "text/plain;charset=utf-8");
  assert.match(src, /Never animate|does not change/);
  assert.match(swift, /return nil/);
  assert.match(swift, /static let label = "Save"/);
  assert.match(swift, /static let accessibilityLabel = "Save code"/);
  assert.match(swift, /static let fallbackName = "snippet.txt"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /PHPhotoLibrary/);
  assert.doesNotMatch(swift, /UserDefaults/);
});

test("desktop and iOS maps name the same files", () => {
  const swiftExt = quotedPairs(
    sliceFn(swift, "static let languageExtensions", "static let fileNames"),
  );
  const swiftNames = quotedPairs(
    sliceFn(swift, "static let fileNames", "private static let windowsReserved"),
  );
  assert.equal(swiftExt.size, Object.keys(CODE_BLOCK_SAVE_EXTENSIONS).length);
  for (const [key, value] of Object.entries(CODE_BLOCK_SAVE_EXTENSIONS)) {
    assert.equal(swiftExt.get(key), value, key);
  }
  assert.equal(swiftNames.size, Object.keys(CODE_BLOCK_SAVE_FILE_NAMES).length);
  for (const [key, value] of Object.entries(CODE_BLOCK_SAVE_FILE_NAMES)) {
    assert.equal(swiftNames.get(key), value, key);
  }
});

test("Save sits beside Copy and keeps the full source", () => {
  const bar = sliceFn(body, "function FenceBar(", "function HighlightedCode(");
  assert.match(bar, /showCodeBlockSave\(completed\)/);
  assert.match(bar, /codeBlockSaveBody\(source\)/);
  assert.match(bar, /codeBlockSaveFilename\(language\)/);
  assert.match(bar, /className="md-fence-save"/);
  assert.match(bar, /aria-label=\{CODE_BLOCK_SAVE_ARIA\}/);
  assert.match(bar, /onMouseDown=\{keepCodeBlockFocus\}/);
  assert.match(bar, /codeBlockSaveKeepsFence\(\)/);
  assert.doesNotMatch(bar, /shown/);
  const copyCall = bar.slice(bar.indexOf("function onCopy"), bar.indexOf("setCopied(true)"));
  assert.doesNotMatch(copyCall, /codeBlockSave/);
  const save = block(".md-fence-save");
  assert.match(save, /font-size:\s*12px/);
  assert.match(save, /color:\s*var\(--text-muted\)/);
  assert.match(save, /transition:\s*none/);
  assert.match(save, /animation:\s*none/);
  assert.match(block(".md-fence-save:focus-visible"), /outline:/);
  const reduceAt = css.indexOf(".md-fence-save {\n    transition: none;");
  assert.ok(reduceAt > 0, "missing Reduce Motion rule for code save");
  const reduce = css.slice(
    css.lastIndexOf("@media (prefers-reduced-motion: reduce)", reduceAt),
    reduceAt + 40,
  );
  assert.match(reduce, /\.md-fence-save/);

  const fence = sliceFn(markdown, "struct FenceBar", "struct FenceSource");
  assert.match(fence, /CodeBlockSave.showsSave\(completed: completed\)/);
  assert.match(fence, /CodeBlockSave.filename\(language: language\)/);
  assert.match(fence, /CodeBlockSave.writeFile\(source: source/);
  assert.match(fence, /CodeBlockSave.keepsFence\(\)/);
  assert.match(fence, /focusable\(false\)/);
  assert.match(fence, /CodeBlockSave.accessibilityLabel/);
  assert.match(fence, /UIActivityViewController/);
  assert.doesNotMatch(fence, /PHPhotoLibrary/);
  const paste = fence.slice(
    fence.indexOf("UIPasteboard.general.string"),
    fence.indexOf("copied = true"),
  );
  assert.doesNotMatch(paste, /CodeBlockSave/);

  const math = sliceFn(body, "function MathNode(", "function FootnoteText(");
  assert.doesNotMatch(math, /showCodeBlockSave/);
  assert.doesNotMatch(math, /md-fence-save/);
  const iosMath = sliceFn(markdown, "struct MathBlock", "struct MathFallback");
  assert.doesNotMatch(iosMath, /CodeBlockSave/);

  const diagram = sliceFn(body, "if (!svg)", "function FenceChrome(");
  const picture = diagram.slice(diagram.lastIndexOf("return ("));
  assert.match(picture, /md-mermaid-body/);
  assert.match(picture, /<FenceBar/);
  assert.doesNotMatch(picture, /md-fence-save/);
  assert.doesNotMatch(shortcuts, /Save code/);
  assert.doesNotMatch(iosShortcuts, /Save code/);
});

test("docs keep OpenAPI 0.18.0 and do not reintroduce computerPane.ts", () => {
  for (const text of [openapi, protocol, runtimeOpenapi]) {
    assert.match(text, /version: 0\.18\.0/);
    assert.doesNotMatch(text, /version:\s*0\.19/);
  }
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(spec, new RegExp(PHRASE));
  assert.match(spec, /## 221\. v2\.21/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_code_block_save\.py/);
  assert.match(pkg, /codeBlockSave\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
