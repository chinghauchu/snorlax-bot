// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { assistantBubbleWide, splitAssistantBubbles } from "./assistantBubbles.ts";
import {
  containsIndentedCode,
  dedentCodeLine,
  indentedCodeAnimates,
  splitIndentedCode,
} from "./markdownIndentedCode.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownIndentedCode.ts"), "utf8");
const bubbles = readFileSync(join(here, "assistantBubbles.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const plain = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownIndentedCode.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const mid = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(here, "..", "..", "runtime", "openapi.yaml"), "utf8");

const PHRASE = "v1.48 CommonMark indented code blocks in completed assistant replies";

function codeOf(text: string): string {
  const parts = splitIndentedCode(text, true);
  const code = parts.find((part) => part.type === "code");
  assert.ok(code && code.type === "code");
  return code.type === "code" ? code.source : "";
}

test("four spaces or a tab become a code block; the indent is removed", () => {
  assert.equal(codeOf("    a simple\n      indented code block\n"), "a simple\n  indented code block");
  assert.equal(codeOf("\tcode\n\tmore\n"), "code\nmore");
  assert.equal(codeOf("\tfoo\tbar"), "foo\tbar");
  assert.equal(dedentCodeLine("     foo"), " foo");
  assert.equal(dedentCodeLine(" \tfoo"), "foo");
  assert.equal(codeOf("    foo\nbar\n"), "foo");
  const around = splitIndentedCode("before\n\n    inside\n\nafter\n", true);
  assert.deepEqual(
    around.map((part) => part.type),
    ["markdown", "code", "markdown"],
  );
  assert.equal(around[1]?.type === "code" ? around[1].source : "", "inside");
  assert.equal(codeOf("    chunk1\n\n    chunk2\n  \n \n\n    chunk3\n"), "chunk1\n\nchunk2\n\n\n\nchunk3");
  assert.equal(codeOf("    foo\n\n\n"), "foo");
  assert.equal(splitIndentedCode("   not code\n", true)[0]?.type, "markdown");
  assert.equal(indentedCodeAnimates(false), false);
  assert.equal(indentedCodeAnimates(true), false);
});

test("an indented line cannot interrupt a paragraph or a list item", () => {
  const paragraph = splitIndentedCode("Foo\n    bar\n", true);
  assert.equal(paragraph.length, 1);
  assert.equal(paragraph[0]?.type, "markdown");
  assert.equal(containsIndentedCode("Foo\n    bar"), false);
  const html = renderToStaticMarkup(
    React.createElement(Markdown, { children: "Foo\n    bar\n" }),
  );
  assert.doesNotMatch(html, /<pre>/);
  assert.match(html, /Foo/);
  assert.match(html, /bar/);

  const list = splitIndentedCode("- item\n    continuation\n", true);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.type, "markdown");
  const loose = splitIndentedCode("- item\n\n    bar\n", true);
  assert.equal(loose.length, 1);
  assert.equal(loose[0]?.type, "markdown");
  const nested = splitIndentedCode("- item\n\n      code\n", true);
  assert.equal(nested.length, 1);
  assert.match(nested[0]?.type === "markdown" ? nested[0].text : "", /code/);
  const listHtml = renderToStaticMarkup(
    React.createElement(Markdown, { children: "- item\n    continuation\n" }),
  );
  assert.doesNotMatch(listHtml, /<pre>/);
  assert.match(listHtml, /<li>/);

  const heading = splitIndentedCode("# Heading\n    foo\n", true);
  assert.equal(heading[0]?.type, "markdown");
  assert.equal(heading[1]?.type === "code" ? heading[1].source : "", "foo");
  const fence = splitIndentedCode("```\n    still fence\n```\n", true);
  assert.equal(fence.length, 1);
  assert.equal(fence[0]?.type, "markdown");
  const math = splitIndentedCode("$$\n    x = 1\n$$\n", true);
  assert.equal(math.length, 1);
  assert.equal(math[0]?.type, "markdown");
});

test("streaming stays the raw string; a quote can hold an indented block", () => {
  assert.deepEqual(splitIndentedCode("    hidden\n", false), [
    { type: "markdown", text: "    hidden\n" },
  ]);
  assert.deepEqual(splitIndentedCode("", true), []);
  const quoted = splitQuoteAndTasks(">" + " ".repeat(5) + "code\n", true);
  assert.equal(quoted[0]?.type, "quote");
  const inner = quoted[0]?.type === "quote" ? quoted[0].text : "";
  assert.equal(codeOf(inner), "code");
  const lazy = splitQuoteAndTasks("> quoted\n    later\n", true);
  assert.equal(lazy.length, 1);
  assert.equal(lazy[0]?.type, "quote");
});

test("blank lines inside indented code stay one bubble; other blanks still split", () => {
  assert.deepEqual(splitAssistantBubbles("    a\n\n    b", true), ["    a\n\n    b"]);
  assert.deepEqual(splitAssistantBubbles("intro\n\n    a\n\n    b\n\noutro", true), [
    "intro",
    "    a\n\n    b",
    "outro",
  ]);
  assert.deepEqual(splitAssistantBubbles("Hello\n\nThere", true), ["Hello", "There"]);
  assert.deepEqual(splitAssistantBubbles("hi\n\n  yo", true), ["hi", "  yo"]);
  assert.deepEqual(splitAssistantBubbles("- item\n    continuation", true), [
    "- item\n    continuation",
  ]);
  assert.deepEqual(splitAssistantBubbles("Foo\n    bar", true), ["Foo\n    bar"]);
  const fence = "intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\noutro";
  assert.deepEqual(splitAssistantBubbles(fence, true), [
    "intro",
    "```js\nconst a = 1;\n\nconst b = 2;\n```",
    "outro",
  ]);
  assert.equal(assistantBubbleWide("    code", true), true);
  assert.equal(assistantBubbleWide("    code", false), false);
  assert.equal(assistantBubbleWide("short hello", true), false);
  assert.equal(assistantBubbleWide("Foo\n    bar", true), false);
});

test("desktop and iOS paint the block with the fence chrome and do not add HTTP", () => {
  assert.match(body, /splitIndentedCode\(text, completed\)/);
  assert.match(body, /language=""/);
  assert.match(body, /<FenceChrome/);
  assert.match(body, /displayName = "SnorlaxPre"/);
  assert.match(body, /typeName === "SnorlaxPre"/);
  assert.match(css, /\.md-fence-body/);
  assert.match(css, /\.md-fence-wrap/);
  assert.match(css, /\.md-copy/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(app, /shouldRenderMarkdown/);
  assert.doesNotMatch(plain, /splitIndentedCode/);
  assert.match(bubbles, /pendingBlanks/);
  assert.match(src, /v1\.48/);
  assert.match(src, /export function splitIndentedCode/);
  assert.match(src, /markdownListEnd/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /v1\.48/);
  assert.match(swift, /static func split\(_ text: String, completed: Bool\)/);
  assert.match(swift, /if !completed \{ return \[\.markdown\(src\)\] \}/);
  assert.match(swift, /static func dedentCodeLine/);
  assert.match(swift, /MarkdownList\.split/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(markdown, /MarkdownIndentedCode\.split/);
  assert.match(markdown, /language: ""/);
  assert.match(markdown, /CodeFence\(/);
  assert.match(markdown, /pendingBlanks/);
  assert.doesNotMatch(mid, /MarkdownIndentedCode/);
  const user = app.slice(app.indexOf('className="bubble user"'), app.indexOf("assistant-md"));
  assert.doesNotMatch(user, /splitIndentedCode/);
  assert.match(openapi, /version:\s*0\.18\.0/);
  assert.match(protocol, /version:\s*0\.18\.0/);
  assert.match(runtimeOpenapi, /version:\s*0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.48 /);
  assert.ok(spec.includes("## 148. v1.48"));
  assert.ok(spec.includes("indented code blocks in completed assistant replies"));
  assert.ok(ci.includes("test_ios_markdown_indented_code.py"));
  assert.ok(pkg.includes("markdownIndentedCode.test.ts"));
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
