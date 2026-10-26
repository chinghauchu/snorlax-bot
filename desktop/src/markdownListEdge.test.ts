// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import {
  LAZY_CONTINUATION_MARK,
  listNeedsCmarkOrderedOne,
  splitMarkdownLists,
  type ListBlock,
} from "./markdownList.ts";
import { listIsLoose } from "./markdownLooseList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function lists(blocks: ListBlock[]) {
  return blocks.flatMap((block) => (block.type === "list" ? [block.list] : []));
}

function split(text: string, completed = true) {
  return splitMarkdownLists(text, completed);
}

/** The item string the list splitter stores, rendered the way a reply does. */
function renderItem(text: string): string {
  const source = literalizeRawHtml(protectMarkdownEscapes(text, true), true);
  return restoreMarkdownEscapes(
    renderToStaticMarkup(React.createElement(Markdown, { children: source })),
  );
}

function renderSource(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

test("an ordered marker interrupts a paragraph when its integer value is 1", () => {
  const padded = split("Foo\n01. bar\n02. baz");
  assert.equal(padded[0]?.type === "markdown" ? padded[0].text : "", "Foo");
  assert.equal(lists(padded)[0]?.start, 1);
  assert.equal(lists(padded)[0]?.delimiter, ".");
  assert.deepEqual(lists(padded)[0]?.items, ["bar", "baz"]);
  assert.equal(listNeedsCmarkOrderedOne("Foo\n01. bar\n02. baz"), true);
  assert.match(renderSource("Foo\n01. bar\n02. baz"), /<p>Foo\n01\. bar\n02\. baz<\/p>/);

  const paren = split("Foo\n01) bar");
  assert.equal(paren[0]?.type === "markdown" ? paren[0].text : "", "Foo");
  assert.equal(lists(paren)[0]?.delimiter, ")");
  assert.deepEqual(lists(paren)[0]?.items, ["bar"]);
  assert.equal(listNeedsCmarkOrderedOne("Foo\n01) bar"), true);

  for (const sample of ["Foo\n001. bar", "Foo\n000000001. bar"]) {
    const blocks = split(sample);
    assert.equal(blocks[0]?.type === "markdown" ? blocks[0].text : "", "Foo", sample);
    assert.equal(lists(blocks)[0]?.start, 1, sample);
    assert.deepEqual(lists(blocks)[0]?.items, ["bar"], sample);
    assert.equal(listNeedsCmarkOrderedOne(sample), true, sample);
  }

  const nested = split("- foo\n  01. bar");
  assert.deepEqual(lists(nested)[0]?.items, ["foo\n01. bar"]);
  assert.equal(listNeedsCmarkOrderedOne("- foo\n  01. bar"), true);
  assert.equal(listNeedsCmarkOrderedOne("foo\n01. bar"), true);
  const nestedParen = split("- foo\n  01) bar");
  assert.deepEqual(lists(nestedParen)[0]?.items, ["foo\n01) bar"]);
  assert.equal(listNeedsCmarkOrderedOne("- foo\n  01) bar"), true);
});

test("a non-1 ordered marker, ten digits, and a closed paragraph stay put", () => {
  for (const sample of [
    "Foo\n9. bar",
    "Foo\n0. bar",
    "Foo\n00. bar",
    "Foo\n003. bar",
    "Foo\n2) no",
    "Foo\n0000000001. bar",
    "1234567890. not ok",
  ]) {
    assert.deepEqual(split(sample), [{ type: "markdown", text: sample }], sample);
    assert.equal(listNeedsCmarkOrderedOne(sample), false, sample);
  }

  assert.equal(lists(split("123456789. ok"))[0]?.start, 123456789);
  assert.equal(listNeedsCmarkOrderedOne("123456789. ok"), false);
  assert.equal(listNeedsCmarkOrderedOne("101. bar"), false);
  assert.equal(lists(split("10. bar\n01. baz"))[0]?.start, 10);
  assert.deepEqual(lists(split("10. bar\n01. baz"))[0]?.items, ["bar", "baz"]);
  assert.equal(listNeedsCmarkOrderedOne("10. bar\n01. baz"), false);

  assert.equal(listNeedsCmarkOrderedOne("01. bar\n02. baz"), false);
  assert.equal(lists(split("01. bar\n02. baz"))[0]?.start, 1);
  assert.equal(listNeedsCmarkOrderedOne("```\n01. bar\n```"), false);
  assert.deepEqual(split("```\n01. bar\n```"), [
    { type: "markdown", text: "```\n01. bar\n```" },
  ]);
  const afterFence = split("```\ncode\n```\n01. bar");
  assert.match(
    afterFence[0]?.type === "markdown" ? afterFence[0].text : "",
    /```/,
  );
  assert.equal(lists(afterFence)[0]?.start, 1);
  assert.equal(listNeedsCmarkOrderedOne("```\ncode\n```\n01. bar"), false);

  const nestedBlank = "- foo\n\n  01. bar";
  assert.equal(listNeedsCmarkOrderedOne(nestedBlank), false);
  assert.equal(listIsLoose(nestedBlank, true), true);
  assert.match(renderSource(nestedBlank), /<ol>\s*<li>bar<\/li>/);
});

test("a line indented 4 or more that is short of the content column stays lazy", () => {
  const spec = "- a\n - b\n  - c\n   - d\n    - e";
  const specItems = lists(split(spec))[0]?.items ?? [];
  assert.deepEqual(specItems, ["a", "b", "c", "d\n\\- e"]);
  assert.equal(listIsLoose(spec, true), false);
  assert.match(renderSource(spec), /<li>d\n- e<\/li>/);
  assert.match(renderItem(specItems[3] ?? ""), /<p>d\n- e<\/p>/);
  assert.doesNotMatch(renderItem(specItems[3] ?? ""), /<ul/);

  const cases: Array<[string, string, RegExp]> = [
    ["   1. foo\n    # bar", "foo\n\\# bar", /<p>foo\n# bar<\/p>/],
    ["   1. foo\n    ***", "foo\n\\***", /<p>foo\n\*\*\*<\/p>/],
    ["   1. foo\n    ```\n    code", "foo\n\\```\ncode", /<p>foo\n```\ncode<\/p>/],
    ["   1. foo\n    > bar", "foo\n\\> bar", /<p>foo\n> bar<\/p>/],
    ["   1. foo\n    ---", "foo\n\\---", /<p>foo\n---<\/p>/],
    ["   1. foo\n    ==", "foo\n\\==", /<p>foo\n==<\/p>/],
    ["   1. foo\n    01. bar", "foo\n01\\. bar", /<p>foo\n01\. bar<\/p>/],
    ["- foo\nbar\n===", "foo\nbar\n\\===", /<p>foo\nbar\n===<\/p>/],
  ];
  for (const [source, item, painted] of cases) {
    assert.deepEqual(lists(split(source))[0]?.items, [item], source);
    const html = renderItem(item);
    assert.match(html, painted, source);
    assert.doesNotMatch(html, /<h1|<hr|<pre|<blockquote|<ul|<ol/, source);
    assert.match(renderSource(source), /<li>foo|<li>foo\nbar/, source);
  }

  const div = "   1. foo\n    <div>\n    *bar*";
  assert.deepEqual(lists(split(div))[0]?.items, ["foo\n\\<div>\n*bar*"]);
  const divHtml = renderToStaticMarkup(
    React.createElement(Markdown, {
      children: literalizeRawHtml(
        protectMarkdownEscapes("foo\n\\<div>\n*bar*", true),
        true,
      ),
    }),
  );
  assert.match(divHtml, /<em>bar<\/em>/);
  assert.match(divHtml, /§§SBE/);
  assert.doesNotMatch(divHtml, /<h1|<hr|<pre|<blockquote|<ul|<ol|<div/);
  assert.match(renderSource(div), /<li>foo\n&lt;div&gt;\n<em>bar<\/em><\/li>/);

  const br = "   1. foo\n    <br>";
  assert.deepEqual(lists(split(br))[0]?.items, ["foo\n<br>"]);
  assert.equal(listIsLoose("- foo\n| bar", true), false);
  assert.deepEqual(lists(split("- foo\n| bar"))[0]?.items, [
    `foo\n${LAZY_CONTINUATION_MARK}| bar`,
  ]);
});

test("lazy text then a blank loosens the item; a real block at the content column stays", () => {
  const loose = "   1. foo\n    # bar\n\n       second";
  assert.equal(listIsLoose(loose, true), true);
  assert.deepEqual(lists(split(loose))[0]?.items, ["foo\n\\# bar\n\n second"]);
  assert.match(renderItem("foo\n\\# bar\n\n second"), /<p>foo\n# bar<\/p>\s*<p>second<\/p>/);
  assert.match(renderSource(loose), /<p>foo\n# bar<\/p>\s*<p>second<\/p>/);

  const outside = split("   1. foo\n\n    bar");
  assert.deepEqual(lists(outside)[0]?.items, ["foo"]);
  assert.equal(outside[1]?.type === "markdown" ? outside[1].text : "", "    bar");
  assert.match(renderSource("   1. foo\n\n    bar"), /<pre><code>bar/);

  const ruled = split("   1. foo\n    <div>\n\n    *bar*");
  assert.deepEqual(lists(ruled)[0]?.items, ["foo\n\\<div>"]);
  assert.equal(ruled[1]?.type === "markdown" ? ruled[1].text : "", "    *bar*");

  assert.deepEqual(lists(split("- foo\n    # not"))[0]?.items, ["foo\n  # not"]);
  assert.match(renderItem("foo\n  # not"), /<h1>not<\/h1>/);
  assert.deepEqual(lists(split("- foo\n   # yes"))[0]?.items, ["foo\n # yes"]);
  assert.match(renderItem("foo\n # yes"), /<h1>yes<\/h1>/);
  assert.deepEqual(lists(split("- foo\n  bar\n  ==="))[0]?.items, ["foo\nbar\n==="]);
  assert.match(renderItem("foo\nbar\n==="), /<h1>foo\nbar<\/h1>/);
  assert.equal(listIsLoose("   1. foo\n    ***\n    bar", true), false);
  assert.deepEqual(lists(split("   1. foo\n    ***\n    bar"))[0]?.items, ["foo\n\\***\nbar"]);
});

test("v1.88 stays on OpenAPI 0.18.0 and does not copy or stream the split", () => {
  const live = "Foo\n01. bar\n    # baz";
  assert.deepEqual(split(live, false), [{ type: "markdown", text: live }]);
  const src = read(join(here, "markdownList.ts"));
  const loose = read(join(here, "markdownLooseList.ts"));
  const body = read(join(here, "MarkdownBody.tsx"));
  const swift = read(join(root, "ios", "SnorlaxBot", "MarkdownList.swift"));
  const swiftLoose = read(join(root, "ios", "SnorlaxBot", "MarkdownLooseList.swift"));
  const app = read(join(here, "App.tsx"));
  assert.match(src, /v1\.88/);
  assert.match(src, /export function lazyItemLine/);
  assert.match(src, /export function listNeedsCmarkOrderedOne/);
  assert.match(src, /htmlBlockInterrupts\(line\)/);
  assert.match(loose, /lazyItemLine\(line\)/);
  assert.match(loose, /leadingColumns\(line\)\.columns > 3/);
  assert.match(body, /listNeedsCmarkOrderedOne\(sourceText\)/);
  assert.match(swift, /v1\.88/);
  assert.match(swift, /static func lazyItemLine/);
  assert.match(swift, /marker\.number != 1/);
  assert.match(swiftLoose, /MarkdownList\.lazyItemLine\(line\)/);
  assert.match(swiftLoose, /leadingColumns\(line\)\.columns > 3/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  const roadmap = read(join(root, "ROADMAP.md"));
  const spec = read(join(root, "docs", "specs", "v0.1-chat-and-agents.md"));
  const ci = read(join(root, ".github", "workflows", "ci.yml"));
  const pkg = read(join(here, "..", "package.json"));
  assert.match(roadmap, /v1\.88 cmark-gfm list item edges/);
  assert.match(roadmap, /\/ v1\.88 /);
  assert.match(spec, /## 188\. v1\.88/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_list_edge\.py/);
  assert.match(pkg, /markdownListEdge\.test\.ts/);
  for (const path of [
    join(here, "..", "openapi.yaml"),
    join(root, "protocol", "openapi.yaml"),
    join(root, "runtime", "openapi.yaml"),
  ]) {
    const openapi = read(path);
    assert.match(openapi, /version: 0\.18\.0/);
    assert.doesNotMatch(openapi, /version: 0\.19/);
  }
});
