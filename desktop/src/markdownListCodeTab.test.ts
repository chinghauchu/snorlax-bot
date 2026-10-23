// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitIndentedCode } from "./markdownIndentedCode.ts";
import {
  listItemIndentedCode,
  splitMarkdownLists,
  type ListBlock,
} from "./markdownList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownList.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const plain = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
  "utf8",
);
const app = readFileSync(join(here, "App.tsx"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(
  join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"),
  "utf8",
);
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(
  join(here, "..", "..", "protocol", "openapi.yaml"),
  "utf8",
);
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE =
  "v1.72 CommonMark tab stops for indented code inside list items in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function decode(text: string): string {
  return text
    .replace(/&#x9;/gi, "\t")
    .replace(/&#9;/g, "\t")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Code blocks inside list items, the way react-markdown paints them. */
function desktopCodes(text: string): string[] {
  const rendered = html(text);
  const codes: string[] = [];
  for (const item of rendered.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    for (const code of (item[1] ?? "").matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)) {
      let body = decode(code[1] ?? "");
      if (body.endsWith("\n")) body = body.slice(0, -1);
      codes.push(body);
    }
  }
  return codes;
}

function items(blocks: ListBlock[]): string[] {
  const list = blocks.find((block) => block.type === "list");
  assert.ok(list && list.type === "list");
  return list.list.items;
}

/** Code the iOS list split stores, after the indented-code pass. */
function parserCodes(text: string): string[] {
  const codes: string[] = [];
  for (const block of splitMarkdownLists(text, true)) {
    if (block.type !== "list") continue;
    for (const item of block.list.items) {
      for (const part of splitIndentedCode(item, true)) {
        if (part.type === "code") codes.push(part.source);
      }
    }
  }
  return codes;
}

test("a tab keeps its stop inside a list item's indented code", () => {
  const cases: Array<[string, string[]]> = [
    ["-\t\tfoo\n", ["  foo"]],
    ["-\t\t\tfoo\n", ["  \tfoo"]],
    ["- foo\n\n\t\tbar\tbaz\n", ["  bar\tbaz"]],
    ["- foo\n\n      bar\tbaz\n", ["bar\tbaz"]],
    ["1.\t\tfoo\n", [" foo"]],
    ["1.\t\t\tfoo\n", [" \tfoo"]],
    ["10.\t\tfoo\n", ["foo"]],
    ["10. foo\n\n\t\tbar\n", ["bar"]],
    ["  - foo\n\n\t\tbar\n", ["bar"]],
    ["- foo\n\n    \tbar\n", ["  bar"]],
    ["- foo\n\n     \tbar\n", ["  bar"]],
    ["-    \tfoo\n", ["  foo"]],
    ["-\t    foo\n", ["  foo"]],
    ["* foo\n\n\t\tbar\n", ["  bar"]],
    ["+ foo\n\n\t\tbar\n", ["  bar"]],
    ["9) foo\n\n\t\tbar\n", [" bar"]],
    ["- foo\n\n\t\tbar\n\n\t\tbaz\n", ["  bar\n\n  baz"]],
    ["-\t\tfoo\n\t\tbar\n", ["  foo\n  bar"]],
    ["- foo\n\n      bar\n", ["bar"]],
    ["- foo\n\n        bar\n", ["  bar"]],
    ["- foo\n\n\t\t```\n\t\tcode\n\t\t```\n", ["  ```\n  code\n  ```"]],
    ["- parent\n\n\t\t- child\n", ["  - child"]],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(parserCodes(source), expected, JSON.stringify(source));
    assert.deepEqual(desktopCodes(source), expected, JSON.stringify(source));
  }
});

test("a paragraph, a shallow fence, and spaces keep their old shape", () => {
  assert.deepEqual(parserCodes("- foo\n\t\tbar\n"), []);
  assert.deepEqual(desktopCodes("- foo\n\t\tbar\n"), []);
  assert.match(html("- foo\n\t\tbar\n"), /<li>foo\nbar<\/li>/);

  assert.deepEqual(items(splitMarkdownLists("-\tfollow\n\tmore", true)), ["follow\nmore"]);
  assert.deepEqual(parserCodes("-\tfoo\tbar\n"), []);
  assert.deepEqual(items(splitMarkdownLists("-\tfoo\tbar", true)), ["foo\tbar"]);

  const fence = "- foo\n\n\t```\n\tcode\n\t```\n";
  assert.deepEqual(parserCodes(fence), []);
  assert.match(items(splitMarkdownLists(fence, true))[0] ?? "", /```/);

  assert.deepEqual(items(splitMarkdownLists("   - foo\n\n\t\tbar", true)), [
    "foo\n\n   bar",
  ]);
  assert.deepEqual(parserCodes("   - foo\n\n\t\tbar\n"), []);
  assert.deepEqual(desktopCodes("   - foo\n\n\t\tbar\n"), []);

  const nested = splitMarkdownLists("- parent\n\t- tab child", true);
  assert.equal(nested[0]?.type, "list");
  if (nested[0]?.type === "list") {
    const inner = splitMarkdownLists(nested[0].list.items[0] ?? "", true);
    const child = inner.find((part) => part.type === "list");
    assert.ok(child && child.type === "list");
    if (child?.type === "list") assert.deepEqual(child.list.items, ["tab child"]);
  }

  assert.equal(listItemIndentedCode("-\t\tfoo", 2), "  foo");
  assert.equal(listItemIndentedCode("-\t\t\tfoo", 2), "  \tfoo");
  assert.equal(listItemIndentedCode("1.\t\tfoo", 3), " foo");
  assert.equal(listItemIndentedCode("-\tfollow", 4), null);
  assert.equal(listItemIndentedCode("\t```", 2), null);
});

test("streaming stays the markdown string and copy stays the source", () => {
  const live = "-\t\tfoo\n";
  assert.deepEqual(splitMarkdownLists(live, false), [{ type: "markdown", text: live }]);
  assert.equal(listItemIndentedCode("-\t\tfoo", 2), "  foo");
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /clipboard|copyText|UIPasteboard/);
  assert.doesNotMatch(plain, /listItemIndentedCode/);
  assert.match(markdown, /MarkdownList\.split\(/);
  assert.match(markdown, /MarkdownIndentedCode\.split\(/);
});

test("docs, CI, and OpenAPI record v1.72 without a new route", () => {
  assert.match(src, /v1\.72/);
  assert.match(src, /export function listItemIndentedCode/);
  assert.match(src, /contentColumn \+ 4/);
  assert.match(swift, /v1\.72/);
  assert.match(swift, /func listItemIndentedCode/);
  assert.match(swift, /contentColumn \+ 4/);
  assert.match(swift, /paragraph = false/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.72 /);
  assert.match(spec, /## 172\. v1\.72/);
  assert.match(spec, /tab stops for indented code inside list items/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_list_code_tab\.py/);
  assert.match(pkg, /markdownListCodeTab\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
