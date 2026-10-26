// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import {
  tabFenceCloses,
  tabFenceCodeLine,
  tabFenceOpen,
} from "./markdownFenceIndent.ts";
import { splitIndentedCode } from "./markdownIndentedCode.ts";
import {
  listSplitByTabFence,
  splitMarkdownLists,
  type ListBlock,
} from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const fence = read(join(here, "markdownFenceIndent.ts"));
const list = read(join(here, "markdownList.ts"));
const quote = read(join(here, "markdownQuoteTask.ts"));
const body = read(join(here, "MarkdownBody.tsx"));
const app = read(join(here, "App.tsx"));
const swiftFence = read(join(root, "ios", "SnorlaxBot", "MarkdownFenceIndent.swift"));
const swiftList = read(join(root, "ios", "SnorlaxBot", "MarkdownList.swift"));
const swiftQuote = read(join(root, "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"));
const roadmap = read(join(root, "ROADMAP.md"));
const spec = read(join(root, "docs", "specs", "v0.1-chat-and-agents.md"));
const ci = read(join(root, ".github", "workflows", "ci.yml"));
const pkg = read(join(here, "..", "package.json"));
const openapi = read(join(here, "..", "openapi.yaml"));
const protocol = read(join(root, "protocol", "openapi.yaml"));
const runtimeOpenapi = read(join(root, "runtime", "openapi.yaml"));

function renderChunk(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function decode(text: string): string {
  return text
    .replace(/&#x9;/gi, "\t")
    .replace(/&#9;/g, "\t")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function codeBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/g;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    bodies.push(decode(match[1] ?? "").replace(/\n$/, ""));
  }
  return bodies;
}

function lists(blocks: ListBlock[]) {
  return blocks.flatMap((block) => (block.type === "list" ? [block.list] : []));
}

function items(text: string): string[] {
  return lists(splitMarkdownLists(text, true)).flatMap((group) => group.items);
}

function quoteText(text: string): string {
  const block = splitQuoteAndTasks(text, true).find((part) => part.type === "quote");
  assert.ok(block && block.type === "quote");
  return block.text;
}

test("spec 2.2 tab stops already match cmark-gfm", () => {
  assert.deepEqual(splitIndentedCode("\tfoo\tbaz\n", true), [
    { type: "code", source: "foo\tbaz" },
  ]);
  assert.deepEqual(splitIndentedCode("  \tfoo\tbaz\n", true), [
    { type: "code", source: "foo\tbaz" },
  ]);
  assert.equal(listSplitByTabFence("\tfoo\tbaz\n"), false);
  assert.equal(listSplitByTabFence("- foo\n\n\tbar\n"), false);
  assert.deepEqual(items("- foo\n\n\tbar\n"), ["foo\n\n  bar"]);
  assert.match(renderChunk("- foo\n\n\tbar\n"), /<p>foo<\/p>/);
  assert.match(renderChunk("- foo\n\n\tbar\n"), /<p>bar<\/p>/);
  assert.equal(quoteText(">\t\tfoo\n"), "      foo");
  assert.deepEqual(codeBodies(renderChunk(quoteText(">\t\tfoo\n"))), ["  foo"]);
  assert.deepEqual(items("-\t\tfoo\n"), ["      foo"]);
  assert.deepEqual(codeBodies(renderChunk(items("-\t\tfoo\n")[0] ?? "")), ["  foo"]);
  assert.match(renderChunk("#\tFoo\n"), /<h1>Foo<\/h1>/);
  assert.match(renderChunk("*\t*\t*\t\n"), /<hr/);
  assert.equal(tabFenceOpen("\t```", 0), null);
  assert.equal(tabFenceOpen("   ```", 0), null);
  assert.equal(tabFenceOpen("#\tFoo", 0), null);
  assert.equal(listSplitByTabFence("10. foo\n\t```\n\tcode\n\t```\n"), false);
  assert.deepEqual(items("10. foo\n\t```\n\tcode\n\t```\n"), ["foo\n```\ncode\n```"]);
  assert.deepEqual(codeBodies(renderChunk("```\n\tcode\n```\n")), ["\tcode"]);
  assert.equal(quoteText("> ```\n>\t\tcode\n> ```\n"), "```\n  \tcode\n```");
  assert.equal(quoteText(">\t\t```\n>\t\tcode\n>\t\t```\n"), "      ```\n      code\n      ```");
});

test("a partial tab is one byte of fence offset", () => {
  assert.deepEqual(tabFenceOpen(">\t```", 2, true), { marker: "```", info: "", offset: 1 });
  assert.equal(tabFenceCodeLine(">\tcode", 2, 1, true), " code");
  assert.equal(tabFenceCodeLine(">\t\tline", 2, 1, true), " \tline");
  assert.equal(tabFenceCloses(">\t```", 2, "```", true), true);
  assert.equal(tabFenceCloses(">\tcode", 2, "```", true), false);
  assert.deepEqual(tabFenceOpen(">\t```js info", 2, true), {
    marker: "```",
    info: "js info",
    offset: 1,
  });
  assert.equal(tabFenceOpen(">\t``", 2, true), null);
  assert.deepEqual(tabFenceOpen("- foo\n\t```".split("\n")[1] ?? "", 2), {
    marker: "```",
    info: "",
    offset: 1,
  });

  assert.equal(quoteText(">\t```\n>\tcode\n>\t```\n"), "```\n code\n```");
  assert.equal(quoteText(">\t```\n>\t\tline\n>\t```\n"), "```\n \tline\n```");
  assert.equal(quoteText(">\t```js\n>\t\tline\tX\n>\t```\n"), "```js\n \tline\tX\n```");
  assert.equal(quoteText(">\t~~~\n>\tcode\n>\t~~~\n"), "~~~\n code\n~~~");
  assert.equal(quoteText(">>\t```\n>>\tcode\n>>\t```\n"), "> ```\n> code\n> ```");
  assert.equal(quoteText("   >\t```\n   >\tcode\n   >\t```\n"), "```\n  code\n```");
  assert.equal(quoteText("> \t```\n> \tcode\n> \t```\n"), "```\n code\n```");
  assert.equal(quoteText("> ```\n>\tcode\n> ```\n"), "```\n  code\n```");
  assert.deepEqual(codeBodies(renderChunk(quoteText(">\t```\n>\tcode\n>\t```\n"))), [" code"]);
  assert.deepEqual(codeBodies(renderChunk(quoteText(">\t```\n>\t\tline\n>\t```\n"))), [" \tline"]);
  assert.deepEqual(codeBodies(renderChunk(quoteText(">\t```js\n>\t\tline\tX\n>\t```\n"))), [
    " \tline\tX",
  ]);
  assert.match(renderChunk(quoteText(">\t```js\n>\t\tline\tX\n>\t```\n")), /language-js/);

  assert.equal(listSplitByTabFence("- foo\n\t```\n\tcode\n\t```\n"), true);
  assert.deepEqual(items("- foo\n\t```\n\tcode\n\t```\n"), ["foo\n```\n code\n```"]);
  assert.deepEqual(items("- foo\n\t```\n\t\tcode\tX\n\t```\n"), ["foo\n```\n \tcode\tX\n```"]);
  assert.deepEqual(items("- foo\n \t```\n \tcode\n \t```\n"), ["foo\n```\n code\n```"]);
  assert.deepEqual(items("1. foo\n\t```\n\tcode\tX\n\t```\n"), ["foo\n```\ncode\tX\n```"]);
  assert.deepEqual(codeBodies(renderChunk(items("- foo\n\t```\n\tcode\n\t```\n")[0] ?? "")), [
    " code",
  ]);
  assert.deepEqual(codeBodies(renderChunk(items("1. foo\n\t```\n\tcode\tX\n\t```\n")[0] ?? "")), [
    "code\tX",
  ]);

  const blocks = splitMarkdownLists("- foo\n\t```\ncode\n\t```\n", true);
  assert.deepEqual(items("- foo\n\t```\ncode\n\t```\n"), ["foo\n```"]);
  assert.equal(blocks.find((block) => block.type === "markdown")?.text, "code\n\t```");
  assert.deepEqual(codeBodies(renderChunk("foo\n```")), [""]);

  assert.equal(quoteText("> - foo\n>\t```\n>\tcode\n>\t```\n"), "- foo\n  ```\n  code\n  ```");
  assert.equal(quoteText(">- foo\n>\t```\n>\tcode\n>\t```\n"), "- foo\n  ```\n  code\n  ```");
  assert.deepEqual(codeBodies(renderChunk(items(quoteText("> - foo\n>\t```\n>\tcode\n>\t```\n"))[0] ?? "")), [
    "code",
  ]);
  assert.equal(listSplitByTabFence("-\t\tfoo\n"), false);
  assert.equal(listSplitByTabFence("- foo\n\n\t\t```\n\t\tcode\n\t\t```\n"), false);
});

test("streaming stays the markdown string and copy stays the source", () => {
  const live = ">\t```\n>\tcode\n>\t```\n";
  assert.deepEqual(splitQuoteAndTasks(live, false), [{ type: "markdown", text: live }]);
  const listed = "- foo\n\t```\n\tcode\n\t```\n";
  assert.deepEqual(splitMarkdownLists(listed, false), [{ type: "markdown", text: listed }]);
  assert.equal(listSplitByTabFence(listed), true);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(fence, /clipboard|copyText|UIPasteboard/);
  assert.doesNotMatch(list, /clipboard|copyText|UIPasteboard/);
  assert.doesNotMatch(swiftFence, /UIPasteboard/);
  assert.doesNotMatch(swiftList, /UIPasteboard/);
  assert.doesNotMatch(swiftQuote, /UIPasteboard/);
});

test("docs, CI, and OpenAPI record v1.89 without a new route", () => {
  for (const source of [fence, list, quote, swiftFence, swiftList, swiftQuote]) {
    assert.match(source, /v1\.89/);
    assert.match(source, /tabFenceOpen/);
    assert.match(source, /tabFenceCodeLine/);
    assert.match(source, /tabFenceCloses/);
    assert.doesNotMatch(source, /\/v1\//);
  }
  assert.match(list, /listSplitByTabFence/);
  assert.match(body, /listSplitByTabFence/);
  assert.match(swiftList, /fenceLiteral/);
  assert.match(swiftQuote, /markers: true/);
  assert.match(roadmap, /v1\.89 cmark-gfm tab stops when a container marker partly consumes a tab/);
  assert.match(roadmap, /\/ v1\.89 /);
  assert.match(spec, /## 189\. v1\.89/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_tab\.py/);
  assert.match(pkg, /markdownTab\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
