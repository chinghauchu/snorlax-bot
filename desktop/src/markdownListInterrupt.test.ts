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
  markdownListEnd,
  splitMarkdownLists,
  type ListBlock,
} from "./markdownList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownList.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const app = readFileSync(join(here, "App.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
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
  "v1.56 CommonMark lists do not interrupt a paragraph in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function blocks(text: string, completed = true): ListBlock[] {
  return splitMarkdownLists(text, completed);
}

function listAt(parts: ListBlock[], index = 0) {
  const found = parts.filter((part) => part.type === "list");
  const list = found[index];
  assert.ok(list && list.type === "list");
  return list.type === "list" ? list.list : null;
}

test("a non-1 ordered marker stays in the paragraph", () => {
  const windows =
    "The number of windows in my house is\n14.  The number of doors is 6.";
  assert.deepEqual(blocks(windows), [{ type: "markdown", text: windows }]);
  assert.match(html(windows), /<p>The number of windows in my house is/);
  assert.match(html(windows), /14\. {2}The number of doors is 6\.<\/p>/);
  assert.doesNotMatch(html(windows), /<ol/);

  const run = "Foo\n9. bar\n10. baz\nstill";
  assert.deepEqual(blocks(run), [{ type: "markdown", text: run }]);
  assert.match(html(run), /<p>Foo\n9\. bar\n10\. baz\nstill<\/p>/);
  assert.doesNotMatch(html(run), /<ol/);

  assert.deepEqual(blocks("Foo\n0. bar"), [{ type: "markdown", text: "Foo\n0. bar" }]);
  assert.deepEqual(blocks("Foo\n003. bar"), [
    { type: "markdown", text: "Foo\n003. bar" },
  ]);
  assert.deepEqual(blocks("para\n2) no\n3) still"), [
    { type: "markdown", text: "para\n2) no\n3) still" },
  ]);
  assert.match(html("para\n2) no\n3) still"), /<p>para\n2\) no\n3\) still<\/p>/);
  assert.deepEqual(blocks("Foo\n   9. three"), [
    { type: "markdown", text: "Foo\n   9. three" },
  ]);
  const lines = run.split("\n");
  assert.equal(markdownListEnd(lines, 1), null);
});

test("1. and a bullet with text still interrupt; any number starts after a blank", () => {
  const one = blocks("Foo\n1. bar\n2. baz");
  assert.equal(one[0]?.type, "markdown");
  assert.equal(one[0]?.type === "markdown" ? one[0].text : "", "Foo");
  const started = listAt(one);
  assert.equal(started?.start, 1);
  assert.deepEqual(started?.items, ["bar", "baz"]);
  assert.match(html("Foo\n1. bar\n2. baz"), /<p>Foo<\/p>\s*<ol>\s*<li>bar<\/li>\s*<li>baz<\/li>/);

  const paren = blocks("para\n1) yes\n2) next");
  assert.equal(listAt(paren)?.start, 1);
  assert.deepEqual(listAt(paren)?.items, ["yes", "next"]);
  assert.match(html("para\n1) yes"), /<p>para<\/p>\s*<ol>\s*<li>yes<\/li>/);

  const bullet = blocks("foo\n- item");
  assert.equal(bullet[0]?.type === "markdown" ? bullet[0].text : "", "foo");
  assert.deepEqual(listAt(bullet)?.items, ["item"]);
  assert.match(html("foo\n- item"), /<p>foo<\/p>\s*<ul>\s*<li>item<\/li>/);

  const afterBlank = blocks("Foo\n\n9. bar\n10. next");
  assert.equal(afterBlank[0]?.type === "markdown" ? afterBlank[0].text : "", "Foo");
  assert.equal(listAt(afterBlank)?.start, 9);
  assert.deepEqual(listAt(afterBlank)?.items, ["bar", "next"]);
  assert.match(html("Foo\n\n9. bar"), /<ol start="9">\s*<li>bar<\/li>/);

  assert.equal(listAt(blocks("9. bar\n10. next"))?.start, 9);
  assert.equal(listAt(blocks("0. bar"))?.start, 0);
  assert.equal(listAt(blocks("01. bar\n02. baz"))?.start, 1);
  assert.deepEqual(listAt(blocks("01. bar\n02. baz"))?.items, ["bar", "baz"]);
  assert.match(html("01. bar"), /<ol>\s*<li>bar<\/li>/);
  assert.equal(listAt(blocks("   9. start"))?.start, 9);

  const lines = "Foo\n\n9. bar".split("\n");
  assert.equal(markdownListEnd(lines, 2), 3);
});

test("an empty marker does not interrupt, and a heading or fence does end the paragraph", () => {
  assert.deepEqual(blocks("foo\n1."), [{ type: "markdown", text: "foo\n1." }]);
  assert.deepEqual(blocks("foo\n*"), [{ type: "markdown", text: "foo\n*" }]);
  assert.deepEqual(blocks("foo\n1.\n   text"), [
    { type: "markdown", text: "foo\n1.\n   text" },
  ]);
  assert.match(html("foo\n1."), /<p>foo\n1\.<\/p>/);
  assert.doesNotMatch(html("foo\n1."), /<ol/);
  assert.match(html("foo\n*"), /<p>foo\n\*<\/p>/);

  const emptyAfterBlank = blocks("foo\n\n*");
  assert.equal(emptyAfterBlank[0]?.type === "markdown" ? emptyAfterBlank[0].text : "", "foo");
  assert.deepEqual(listAt(emptyAfterBlank)?.items, [""]);
  assert.deepEqual(listAt(blocks("*"))?.items, [""]);
  assert.deepEqual(listAt(blocks("1.\n   text"))?.items, ["text"]);

  const heading = blocks("# Head\n9. item\n10. next");
  assert.equal(heading[0]?.type === "markdown" ? heading[0].text : "", "# Head");
  assert.equal(listAt(heading)?.start, 9);
  assert.deepEqual(listAt(heading)?.items, ["item", "next"]);
  assert.match(html("# Head\n9. item"), /<h1>Head<\/h1>\s*<ol start="9">/);

  const fence = blocks("```\ncode\n```\n9. item");
  assert.match(fence[0]?.type === "markdown" ? fence[0].text : "", /```/);
  assert.equal(listAt(fence)?.start, 9);
  assert.match(html("```\ncode\n```\n9. item"), /<pre><code>code\n<\/code><\/pre>\s*<ol start="9">/);
});

test("a nested non-1 marker stays in the item, and 1. still nests", () => {
  const plain = blocks("- parent\n  text\n  9. no\n  10. more");
  assert.equal(plain.length, 1);
  const item = listAt(plain)?.items[0] ?? "";
  assert.equal(item, "parent\ntext\n9. no\n10. more");
  assert.deepEqual(blocks(item), [{ type: "markdown", text: item }]);
  const plainHtml = html("- parent\n  text\n  9. no\n  10. more");
  assert.match(plainHtml, /<li>parent\ntext\n9\. no\n10\. more<\/li>/);
  assert.doesNotMatch(plainHtml, /<ol/);

  const nested = blocks("- parent\n  text\n  1. yes\n  2. more");
  const nestedItem = listAt(nested)?.items[0] ?? "";
  const inner = blocks(nestedItem);
  assert.equal(inner[0]?.type === "markdown" ? inner[0].text : "", "parent\ntext");
  assert.equal(listAt(inner)?.start, 1);
  assert.deepEqual(listAt(inner)?.items, ["yes", "more"]);
  assert.match(html("- parent\n  text\n  1. yes"), /<ol>\s*<li>yes<\/li>/);

  const loose = blocks("- parent\n  text\n\n  9. yes");
  const looseItem = listAt(loose)?.items[0] ?? "";
  const looseInner = blocks(looseItem);
  assert.equal(listAt(looseInner)?.start, 9);
  assert.match(html("- parent\n  text\n\n  9. yes"), /<ol start="9">\s*<li>yes<\/li>/);
});

test("streaming stays the markdown string and copy stays source", () => {
  const live = "Foo\n9. bar\n1. baz";
  assert.deepEqual(blocks(live, false), [{ type: "markdown", text: live }]);
  assert.match(src, /v1\.56/);
  assert.match(src, /function markerInterruptsParagraph/);
  assert.match(src, /marker\.ordered && marker\.number !== 1/);
  assert.match(swift, /v1\.56/);
  assert.match(swift, /markerInterruptsParagraph/);
  assert.match(swift, /marker\.ordered && marker\.number != 1/);
  assert.match(swift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(body, /<ol start=\{start\}>/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.56 /);
  assert.match(spec, /## 156\. v1\.56/);
  assert.match(spec, /lists do not interrupt a paragraph in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_list_interrupt\.py/);
  assert.match(pkg, /markdownListInterrupt\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
