// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { codeBlockClipboardText } from "./codeBlockCopy.ts";
import {
  dedentFenceLine,
  dedentFencedContent,
  fenceIndentAnimates,
  openingFence,
} from "./markdownFenceIndent.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { shouldRenderMarkdown } from "./midStreamPlaintext.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownFenceIndent.ts"), "utf8");
const markdownTs = readFileSync(join(here, "markdown.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownFenceIndent.swift"),
  "utf8",
);
const iosMarkdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
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

const PHRASE = "v1.53 CommonMark indented fences in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

test("a fence indented 1–3 spaces drops that indent, including a partial tab", () => {
  assert.equal(dedentFenceLine("   aaa", 3), "aaa");
  assert.equal(dedentFenceLine("    aaa", 3), " aaa");
  assert.equal(dedentFenceLine("aaa", 3), "aaa");
  assert.equal(dedentFenceLine("", 3), "");
  assert.equal(dedentFenceLine("\ta", 1), "   a");
  assert.equal(dedentFenceLine("\ta", 2), "  a");
  assert.equal(dedentFenceLine("\ta", 3), " a");
  assert.equal(dedentFenceLine(" \ta", 1), "\ta");
  assert.equal(dedentFencedContent("   aaa\n    aaa\naaa", 3), "aaa\n aaa\naaa");
  assert.equal(dedentFencedContent("code", 0), "code");
  assert.equal(fenceIndentAnimates(true), false);
  assert.equal(fenceIndentAnimates(false), false);

  const indented = "   ```\n   aaa\n    aaa\naaa\n   ```\n";
  assert.equal(openingFence("   ```")?.indent, 3);
  assert.match(html(indented), /<pre><code>aaa\n aaa\naaa\n<\/code><\/pre>/);

  const one = " ```\n aaa\naaa\n```\n";
  assert.match(html(one), /<pre><code>aaa\naaa\n<\/code><\/pre>/);

  const tilde = "  ~~~\n  foo\n  ~~~\n";
  assert.equal(openingFence("  ~~~")?.marker, "~~~");
  assert.match(html(tilde), /<pre><code>foo\n<\/code><\/pre>/);

  assert.match(html(" ```\n\ta\n ```\n"), /<pre><code>   a\n<\/code><\/pre>/);
  assert.match(html(" ```\n \ta\n ```\n"), /<pre><code>\ta\n<\/code><\/pre>/);
  assert.match(html("  ```\ncode\n  ```\n"), /<pre><code>code\n<\/code><\/pre>/);
  assert.match(html("   ```\n   ```\n"), /<pre><code><\/code><\/pre>/);
});

test("column 0 is unchanged, and four spaces is not a fence", () => {
  const plain = "```\n  keep\n```\n";
  assert.equal(openingFence("```")?.indent, 0);
  assert.match(html(plain), /<pre><code> {2}keep\n<\/code><\/pre>/);
  assert.equal(openingFence("    ```"), null);
  assert.equal(openingFence("\t```"), null);
  assert.equal(openingFence("   ``` ``"), null);
  assert.equal(openingFence(" ```js extra")?.info, "js extra");
  assert.match(
    html("   ```js extra\n   const x = 1\n   ```\n"),
    /<pre><code class="language-js">const x = 1\n<\/code><\/pre>/,
  );
  const quoted = splitQuoteAndTasks(">   ```\n>   code\n>   ```\n", true);
  const quote = quoted.find((block) => block.type === "quote");
  assert.ok(quote && quote.type === "quote");
  assert.equal(quote.text, "  ```\n  code\n  ```");
  assert.equal(dedentFencedContent("  code", 2), "code");
  assert.match(html(quote.text + "\n"), /<pre><code>code\n<\/code><\/pre>/);
  assert.match(html("- item\n    ```\n    code\n    ```\n"), /<ul>\n<li>item\n<pre><code>code\n<\/code><\/pre>/);
});

test("streaming stays plain and copy keeps markdown source", () => {
  assert.equal(shouldRenderMarkdown({ completed: false }), false);
  assert.equal(shouldRenderMarkdown({ completed: true }), true);
  assert.equal(codeBlockClipboardText("  code"), "  code");
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /dedentFencedContent\(reply/);
  assert.match(body, /react-markdown drops that indent from the code/);
  assert.match(body, /pre: SnorlaxPre/);
});

test("desktop and iOS share the rule and do not grow the protocol", () => {
  assert.match(src, /export function dedentFencedContent/);
  assert.match(src, /export function dedentFenceLine/);
  assert.match(src, /4 - \(col % 4\)/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownFenceIndent.swift`/);
  assert.match(markdownTs, /dedentFencedContent/);
  assert.match(swift, /static func dedent\(_ text: String, columns: Int\) -> String/);
  assert.match(swift, /static func dedentLine\(_ line: String, columns: Int\) -> String/);
  assert.match(swift, /4 - \(col % 4\)/);
  assert.match(swift, /static func lineStart/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/markdownFenceIndent.ts`/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(iosMarkdown, /MarkdownFenceIndent\.indent/);
  assert.match(iosMarkdown, /MarkdownFenceIndent\.withoutOpeningIndent/);
  assert.match(iosMarkdown, /MarkdownFenceIndent\.lineStart/);
  assert.match(iosMarkdown, /MarkdownFenceIndent\.dedent/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.53 /);
  assert.match(spec, /## 153\. v1\.53/);
  assert.match(spec, /indented fences in completed assistant replies/i);
  assert.match(pkg, /markdownFenceIndent\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_fence_indent\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
