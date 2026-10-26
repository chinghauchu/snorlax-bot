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
import { listIsLoose } from "./markdownLooseList.ts";
import { splitMarkdownLists, type ListBlock } from "./markdownList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownList.ts"), "utf8");
const loose = readFileSync(join(here, "markdownLooseList.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const looseSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLooseList.swift"),
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

const PHRASE = "v1.54 CommonMark list marker padding in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function items(blocks: ListBlock[]): string[] {
  const list = blocks.find((block) => block.type === "list");
  assert.ok(list && list.type === "list");
  return list.list.items;
}

test("desktop already keeps a wide marker gap and a blank first line", () => {
  assert.match(html("-   item\n    continued"), /<li>item\ncontinued<\/li>/);
  assert.match(html("-   item\n    - nested"), /<li>item\n<ul>\n<li>nested<\/li>/);
  assert.match(html("-    foo\n\n  bar"), /<li>foo<\/li>\n<\/ul>\n<p>bar<\/p>/);
  assert.match(html(" -    one\n\n     two"), /<li>one<\/li>[\s\S]*<pre><code> two\n<\/code><\/pre>/);
  assert.match(html(" -    one\n\n      two"), /<p>one<\/p>\n<p>two<\/p>/);
  assert.match(html("1.\n   text\n   more"), /<li>text\nmore<\/li>/);
  assert.match(html("1.\n  text"), /<li><\/li>\n<\/ol>\n<p>text<\/p>/);
  assert.match(html("-\n\n  foo"), /<li><\/li>\n<\/ul>\n<p>foo<\/p>/);
  assert.match(html("-   \n  foo"), /<li>foo<\/li>/);
  assert.match(
    html("1.     indented code\n\n   paragraph\n\n       more code"),
    /<pre><code>indented code\n<\/code><\/pre>\n<p>paragraph<\/p>\n<pre><code>more code\n<\/code><\/pre>/,
  );
  assert.match(
    html("1.      indented code\n\n   paragraph\n\n       more code"),
    /<pre><code> indented code\n<\/code><\/pre>/,
  );
  assert.match(html("-   foo\n\n        bar"), /<pre><code>bar\n<\/code><\/pre>/);
  assert.match(html("10.  wide\n    next"), /<ol start="10">\n<li>wide\nnext<\/li>/);
  assert.match(html("-    foo\n  - nested"), /<li>foo<\/li>\n<li>nested<\/li>/);
  assert.match(html("-\tfollow"), /<li>follow<\/li>/);
  assert.match(html("* * *"), /<hr\/>/);
  assert.match(html("***"), /<hr\/>/);
  assert.match(html("___"), /<hr\/>/);
  assert.match(html("- - -"), /<hr\/>/);
  const raw = html('press <kbd>Enter</kbd> and <br> and H<sub>2</sub>O x<sup>2</sup> <script>alert(1)</script>');
  assert.match(raw, /&lt;kbd&gt;Enter&lt;\/kbd&gt;/);
  assert.match(raw, /&lt;br&gt;/);
  assert.match(raw, /&lt;sub&gt;2&lt;\/sub&gt;/);
  assert.match(raw, /&lt;sup&gt;2&lt;\/sup&gt;/);
  assert.match(raw, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(raw, /<script|<kbd|<br|<sub|<sup/);
});

test("the iOS parser keeps the same padding and continuation", () => {
  assert.deepEqual(items(splitMarkdownLists("-   item", true)), ["item"]);
  assert.deepEqual(items(splitMarkdownLists("-   item\n    continued", true)), [
    "item\ncontinued",
  ]);
  assert.deepEqual(items(splitMarkdownLists("*   star\n    next", true)), ["star\nnext"]);
  assert.deepEqual(items(splitMarkdownLists("+   plus\n    - child", true)), ["plus\n- child"]);
  assert.deepEqual(items(splitMarkdownLists("9)  nine\n    ten", true)), ["nine\nten"]);
  assert.deepEqual(items(splitMarkdownLists("10.  wide\n    next", true)), ["wide\nnext"]);
  assert.deepEqual(items(splitMarkdownLists("-\tfollow\n\tmore", true)), ["follow\nmore"]);

  const wideNested = splitMarkdownLists("-   item\n    - nested", true);
  assert.deepEqual(items(wideNested), ["item\n- nested"]);
  assert.deepEqual(items(splitMarkdownLists("item\n- nested", true)), ["nested"]);

  const outside = splitMarkdownLists("-    foo\n\n  bar", true);
  assert.deepEqual(items(outside), ["foo"]);
  assert.equal(listIsLoose("-    foo\n\n  bar", true), false);
  assert.equal(outside.at(-1)?.type, "markdown");
  if (outside.at(-1)?.type === "markdown") assert.match(outside.at(-1).text, /bar/);

  const codeBeside = splitMarkdownLists(" -    one\n\n     two", true);
  assert.deepEqual(items(codeBeside), ["one"]);
  const beside = codeBeside.find((block) => block.type === "markdown");
  assert.ok(beside && beside.type === "markdown");
  const code = splitIndentedCode(beside.text, true).find((block) => block.type === "code");
  assert.ok(code && code.type === "code");
  assert.equal(code.source, " two");

  assert.deepEqual(items(splitMarkdownLists(" -    one\n\n      two", true)), ["one\n\ntwo"]);
  assert.equal(listIsLoose(" -    one\n\n      two", true), true);

  assert.deepEqual(items(splitMarkdownLists("1.\n   text\n   more", true)), ["text\nmore"]);
  assert.deepEqual(items(splitMarkdownLists("1.\n   text\nmore", true)), ["text\nmore"]);
  const short = splitMarkdownLists("1.\n  text", true);
  assert.deepEqual(items(short), [""]);
  assert.equal(short.at(-1)?.type, "markdown");
  assert.deepEqual(items(splitMarkdownLists("-\n foo", true)), [""]);
  assert.deepEqual(items(splitMarkdownLists("-\n  foo", true)), ["foo"]);
  assert.deepEqual(items(splitMarkdownLists("-\n\n  foo", true)), [""]);
  assert.equal(listIsLoose("-\n\n  foo", true), false);
  assert.deepEqual(items(splitMarkdownLists("-   \n  foo", true)), ["foo"]);
  assert.deepEqual(items(splitMarkdownLists("- foo\n-\n- bar", true)), ["foo", "", "bar"]);
  assert.equal(listIsLoose("- foo\n-\n- bar", true), false);

  assert.deepEqual(
    items(splitMarkdownLists("1.     indented code\n\n   paragraph\n\n       more code", true)),
    ["    indented code\n\nparagraph\n\n    more code"],
  );
  assert.deepEqual(
    items(splitMarkdownLists("1.      indented code\n\n   paragraph\n\n       more code", true)),
    ["     indented code\n\nparagraph\n\n    more code"],
  );
  assert.deepEqual(items(splitMarkdownLists("-   foo\n\n        bar", true)), [
    "foo\n\n    bar",
  ]);
  assert.equal(listIsLoose("-   foo\n\n        bar", true), true);
  assert.deepEqual(items(splitMarkdownLists("-    foo\n  bar", true)), ["foo\nbar"]);
  assert.deepEqual(items(splitMarkdownLists("-    foo\n  - nested", true)), ["foo", "nested"]);
  assert.deepEqual(items(splitMarkdownLists("-   foo  \n    bar", true)), ["foo  \nbar"]);

  const basic = splitMarkdownLists("- parent\n  - child", true);
  assert.deepEqual(items(basic), ["parent\n- child"]);
  assert.deepEqual(splitMarkdownLists("-   item\n    continued", false), [
    { type: "markdown", text: "-   item\n    continued" },
  ]);
});

test("desktop and iOS share the padding rule and do not grow the protocol", () => {
  assert.match(src, /export function listMarkerPadding/);
  assert.match(src, /spacesAfter >= 5 \|\| spacesAfter < 1 \|\| blank/);
  assert.match(src, /contentColumn: markerColumn \+ 1/);
  assert.match(src, /v1\.54/);
  assert.match(loose, /listMarkerPadding/);
  assert.match(loose, /sawContent/);
  assert.match(swift, /static func listMarkerPadding/);
  assert.match(swift, /spacesAfter >= 5 \|\| spacesAfter < 1 \|\| blank/);
  assert.match(swift, /markerColumn \+ 1/);
  assert.match(swift, /v1\.54/);
  assert.match(swift, /lazyItemLine/);
  assert.match(looseSwift, /MarkdownList\.listMarkerPadding/);
  assert.match(looseSwift, /sawContent/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.54 /);
  assert.match(spec, /## 154\. v1\.54/);
  assert.match(spec, /list marker padding in completed assistant replies/i);
  assert.match(pkg, /markdownListPadding\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_list_padding\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
