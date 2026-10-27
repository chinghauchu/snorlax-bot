// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { remarkHardBreaks } from "./markdownHardBreak.ts";
import { listIsLoose } from "./markdownLooseList.ts";
import {
  listNeedsCmarkOrderedItemStart,
  listNeedsCmarkOrderedOne,
  markdownListLineRanges,
  splitMarkdownLists,
} from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const lists = read(join(here, "markdownList.ts"));
const body = read(join(here, "MarkdownBody.tsx"));
const app = read(join(here, "App.tsx"));
const swift = read(join(root, "ios", "SnorlaxBot", "MarkdownList.swift"));
const markdownSwift = read(join(root, "ios", "SnorlaxBot", "AssistantMarkdown.swift"));
const roadmap = read(join(root, "ROADMAP.md"));
const spec = read(join(root, "docs", "specs", "v0.1-chat-and-agents.md"));
const ci = read(join(root, ".github", "workflows", "ci.yml"));
const pkg = read(join(here, "..", "package.json"));
const openapi = read(join(here, "..", "openapi.yaml"));
const protocol = read(join(root, "protocol", "openapi.yaml"));
const runtimeOpenapi = read(join(root, "runtime", "openapi.yaml"));

const PHRASE =
  "v2.01 cmark-gfm nested ordered list start numbers in completed assistant replies";

function norm(html: string): string {
  return html
    .replace(/ class="[^"]*"/g, "")
    .replace(/<br\s*\/?>/g, "<br />")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, "")
    .replace(/start="1"/g, "");
}

function micromark(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: text,
    }),
  );
}

/** Same list opt-in a completed reply uses, then react-markdown. */
function render(text: string): string {
  const blocks = splitQuoteAndTasks(text, true);
  if (!(blocks.length === 1 && blocks[0]?.type === "markdown")) {
    return blocks
      .map((block) => {
        if (block.type === "quote") return `<blockquote>${render(block.text)}</blockquote>`;
        if (block.type === "markdown") return render(block.text);
        return "";
      })
      .join("");
  }
  const plain = blocks[0].text;
  if (
    listNeedsCmarkOrderedItemStart(plain) ||
    listNeedsCmarkOrderedOne(plain)
  ) {
    return renderLists(plain);
  }
  return micromark(plain);
}

function renderLists(text: string): string {
  const blocks = splitMarkdownLists(text, true);
  if (blocks.length === 1 && blocks[0]?.type === "markdown") return micromark(blocks[0].text);
  const ranges = markdownListLineRanges(text, true);
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let listN = 0;
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "markdown") {
      out.push(render(block.text));
      continue;
    }
    const range = ranges[listN] ?? null;
    listN += 1;
    const slice = range == null ? "" : lines.slice(range.start, range.end).join("\n");
    const loose = slice ? listIsLoose(slice, true) : false;
    const tag = block.list.ordered ? "ol" : "ul";
    const start =
      block.list.ordered && block.list.start !== 1 ? ` start="${block.list.start}"` : "";
    const items = block.list.items
      .map((item) => {
        const inner = item ? renderItem(item, !loose) : "";
        return `<li>${inner}</li>`;
      })
      .join("");
    out.push(`<${tag}${start}>${items}</${tag}>`);
  }
  return out.join("");
}

function renderItem(item: string, unwrap: boolean): string {
  const html = render(item);
  return unwrap ? html.replace(/<\/?p>/g, "") : html;
}

function assertHtml(markdown: string, html: string): void {
  assert.equal(norm(render(markdown)), norm(html), JSON.stringify(markdown));
}

test("an interrupting item's first block keeps any ordered start", () => {
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("- foo\n  - 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 2. bar\n  3. baz"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 0. item"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 003. item"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 2) item"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 01. item"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 10. item"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 123456789. big"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- - 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n1. - 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 1. 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- > 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n* 2. bar\n+ 3. baz"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("alpha\n\nbeta\n- 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n   - 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("- foo\n  - bar\n    - 2. baz"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 2.\n  bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 2. bar\n\n  baz"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("1. foo\n   - 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n1) 2. bar"), true);
  assert.equal(listNeedsCmarkOrderedItemStart("> foo\n> - 2. bar"), false);
  const quoted = splitQuoteAndTasks("> foo\n> - 2. bar", true);
  assert.equal(quoted[0]?.type, "quote");
  assert.equal(
    listNeedsCmarkOrderedItemStart(quoted[0]?.type === "quote" ? quoted[0].text : ""),
    true,
  );

  assertHtml(
    "foo\n- 2. bar",
    '<p>foo</p><ul><li><ol start="2"><li>bar</li></ol></li></ul>',
  );
  assertHtml(
    "- foo\n  - 2. bar",
    '<ul><li>foo<ul><li><ol start="2"><li>bar</li></ol></li></ul></li></ul>',
  );
  assertHtml(
    "foo\n- 2. bar\n  3. baz",
    '<p>foo</p><ul><li><ol start="2"><li>bar</li><li>baz</li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- 0. item",
    '<p>foo</p><ul><li><ol start="0"><li>item</li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- 003. item\n  4. next",
    '<p>foo</p><ul><li><ol start="3"><li>item</li><li>next</li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- 2) item\n  3) next",
    '<p>foo</p><ul><li><ol start="2"><li>item</li><li>next</li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- 01. item\n  02. next",
    "<p>foo</p><ul><li><ol><li>item</li><li>next</li></ol></li></ul>",
  );
  assertHtml(
    "foo\n- 10. item",
    '<p>foo</p><ul><li><ol start="10"><li>item</li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- 123456789. big",
    '<p>foo</p><ul><li><ol start="123456789"><li>big</li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- - 2. bar",
    '<p>foo</p><ul><li><ul><li><ol start="2"><li>bar</li></ol></li></ul></li></ul>',
  );
  assertHtml(
    "foo\n- 1. 2. bar",
    '<p>foo</p><ul><li><ol><li><ol start="2"><li>bar</li></ol></li></ol></li></ul>',
  );
  assertHtml(
    "foo\n1) 2. bar",
    '<p>foo</p><ol><li><ol start="2"><li>bar</li></ol></li></ol>',
  );
  assertHtml(
    "foo\n- 2.\n  bar",
    '<p>foo</p><ul><li><ol start="2"><li></li></ol>bar</li></ul>',
  );
  assertHtml(
    "foo\n- 2. bar\n\n  baz",
    '<p>foo</p><ul><li><ol start="2"><li>bar</li></ol><p>baz</p></li></ul>',
  );
  assertHtml(
    "foo\n- 2. **bar**",
    '<p>foo</p><ul><li><ol start="2"><li><strong>bar</strong></li></ol></li></ul>',
  );
  assertHtml(
    "foo\n- 2. bar\n  baz",
    '<p>foo</p><ul><li><ol start="2"><li>bar baz</li></ol></li></ul>',
  );
  assertHtml(
    "- foo\n  - 2. bar\n    3) baz",
    '<ul><li>foo<ul><li><ol start="2"><li>bar</li></ol><ol start="3"><li>baz</li></ol></li></ul></li></ul>',
  );
  assertHtml(
    "> foo\n> - 2. bar",
    '<blockquote><p>foo</p><ul><li><ol start="2"><li>bar</li></ol></li></ul></blockquote>',
  );
  assertHtml(
    "foo\n- > 2. bar",
    '<p>foo</p><ul><li><blockquote><ol start="2"><li>bar</li></ol></blockquote></li></ul>',
  );
  assertHtml(
    "1. foo\n   - 2. bar",
    '<ol><li>foo<ul><li><ol start="2"><li>bar</li></ol></li></ul></li></ol>',
  );
  assertHtml(
    "Foo\n01. bar",
    "<p>Foo</p><ol><li>bar</li></ol>",
  );
});

test("a paragraph continuation and a chunk-start marker stay as they were", () => {
  for (const sample of [
    "foo\n- 1. bar",
    "Foo\n2. bar",
    "Foo\n9. bar",
    "Foo\n0. bar",
    "- foo\n  2. bar",
    "foo\n- ok\n- 2. next",
    "- 2. foo",
    "1. - 2. foo",
    "foo\n\n- 2. bar",
    "- foo\n\n  - 2. bar",
    "```\nfoo\n- 2. bar\n```",
    "foo\n- 2.bar",
    "foo\n- 1234567890. bar",
    "foo\n- x 2. bar",
    "Foo\n01. bar",
    "- foo\n  01. bar",
    "foo\n- [ ] 2. bar",
    "foo\n    - 2. bar",
  ]) {
    const expect =
      sample.startsWith("Foo\n01.") || sample.startsWith("- foo\n  01.");
    assert.equal(listNeedsCmarkOrderedItemStart(sample), false, JSON.stringify(sample));
    if (sample.startsWith("Foo\n01.")) {
      assert.equal(listNeedsCmarkOrderedOne(sample), expect);
    }
  }

  assertHtml("Foo\n2. bar", "<p>Foo\n2. bar</p>");
  assertHtml("- foo\n  2. bar", "<ul><li>foo\n2. bar</li></ul>");
  assertHtml(
    "foo\n- ok\n- 2. next",
    '<p>foo</p><ul><li>ok</li><li><ol start="2"><li>next</li></ol></li></ul>',
  );
  assertHtml(
    "- 2. foo",
    '<ul><li><ol start="2"><li>foo</li></ol></li></ul>',
  );
  assertHtml(
    "1. - 2. foo",
    '<ol><li><ul><li><ol start="2"><li>foo</li></ol></li></ul></li></ol>',
  );
  assertHtml(
    "foo\n- 1. bar",
    "<p>foo</p><ul><li><ol><li>bar</li></ol></li></ul>",
  );
  assertHtml("foo\n\n- 2. bar", '<p>foo</p><ul><li><ol start="2"><li>bar</li></ol></li></ul>');
  assertHtml(
    "```\nfoo\n- 2. bar\n```",
    "<pre><code>foo\n- 2. bar\n</code></pre>",
  );
  assertHtml("foo\n- 2.bar", "<p>foo</p><ul><li>2.bar</li></ul>");
  assertHtml("foo\n- 1234567890. bar", "<p>foo</p><ul><li>1234567890. bar</li></ul>");
  assert.equal(listNeedsCmarkOrderedItemStart("foo\n- 2. bar"), true);
  assert.equal(splitMarkdownLists("foo\n- 2. bar", false)[0]?.type, "markdown");
});

test("both clients share the rule and the reply path", () => {
  assert.match(lists, /export function listNeedsCmarkOrderedItemStart/);
  assert.match(lists, /first block of a list item is not a paragraph/);
  assert.match(lists, /markdown source|Re-parsing/);
  assert.match(body, /listNeedsCmarkOrderedItemStart\(sourceText\)/);
  const parsed = body.slice(
    body.indexOf("function MarkdownParsed"),
    body.indexOf("function textHasTableInList"),
  );
  assert.match(parsed, /completed &&/);
  assert.match(parsed, /listNeedsCmarkOrderedItemStart\(sourceText\)/);
  assert.match(swift, /v2\.01: the first block of a list item is not a paragraph/);
  assert.match(swift, /AssistantMarkdown/);
  assert.match(markdownSwift, /MarkdownList\.split\(source, completed: completed\)/);
  assert.match(markdownSwift, /AssistantMarkdown\(\s*text: item/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(lists, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v2.01 "));
  assert.match(spec, /## 201\. v2\.01/);
  assert.match(ci, /test_ios_markdown_ordered_start\.py/);
  assert.match(pkg, /markdownOrderedStart\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
