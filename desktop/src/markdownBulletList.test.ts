// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitAssistantBubbles } from "./assistantBubbles.ts";
import { listIsLoose } from "./markdownLooseList.ts";
import { splitMarkdownLists, type ListBlock } from "./markdownList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownList.ts"), "utf8");
const loose = readFileSync(join(here, "markdownLooseList.ts"), "utf8");
const tasks = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
  "utf8",
);
const looseSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLooseList.swift"),
  "utf8",
);
const taskSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownQuoteTask.swift"),
  "utf8",
);
const markdown = readFileSync(
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
  "v1.57 CommonMark bullet list markers in completed assistant replies";

function html(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function lists(blocks: ListBlock[]) {
  return blocks.filter((block) => block.type === "list");
}

function items(blocks: ListBlock[]): string[] {
  return lists(blocks).flatMap((block) =>
    block.type === "list" ? block.list.items : [],
  );
}

test("react-markdown starts a new list when the bullet character changes", () => {
  const mixed = html("- a\n* b");
  assert.match(mixed, /<ul>\s*<li>a<\/li>\s*<\/ul>\s*<ul>\s*<li>b<\/li>\s*<\/ul>/);
  assert.equal(mixed.match(/<ul>/g)?.length, 2);
  const three = html("- a\n+ b\n- c");
  assert.equal(three.match(/<ul>/g)?.length, 3);
  assert.match(three, /<li>a<\/li>/);
  assert.match(three, /<li>b<\/li>/);
  assert.match(three, /<li>c<\/li>/);
  const sameStar = html("* a\n* b\n- c");
  assert.match(sameStar, /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>\s*<ul>\s*<li>c<\/li>\s*<\/ul>/);
  assert.match(html("+ a\n+ b"), /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  assert.equal(html("+ a\n+ b").match(/<ul>/g)?.length, 1);
  assert.match(html("- a\n- b"), /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  const nested = html("- parent\n  * child");
  assert.match(nested, /<li>parent\s*<ul>\s*<li>child<\/li>\s*<\/ul>/);
  assert.equal(nested.match(/<ul>/g)?.length, 2);
  const loose = html("- a\n\n- b");
  assert.equal(loose.match(/<ul>/g)?.length, 1);
  assert.match(loose, /<p>a<\/p>/);
  assert.match(loose, /<p>b<\/p>/);
  const apart = html("- a\n\n* b");
  assert.match(apart, /<ul>\s*<li>a<\/li>\s*<\/ul>\s*<ul>\s*<li>b<\/li>\s*<\/ul>/);
  assert.doesNotMatch(apart, /<p>/);
  const wide = html("-    foo\n  * bar");
  assert.match(wide, /<ul>\s*<li>foo<\/li>\s*<\/ul>\s*<ul>\s*<li>bar<\/li>\s*<\/ul>/);
  assert.match(html("1. a\n2) b"), /<ol>\s*<li>a<\/li>\s*<\/ol>\s*<ol start="2">\s*<li>b<\/li>\s*<\/ol>/);
  assert.match(html("* * *"), /<hr\/>/);
  assert.doesNotMatch(html("* * *"), /<ul>/);
});

test("the iOS list split follows that same bullet rule", () => {
  assert.equal(lists(splitMarkdownLists("- a\n* b", true)).length, 2);
  assert.deepEqual(items(splitMarkdownLists("- a\n* b", true)), ["a", "b"]);
  assert.equal(lists(splitMarkdownLists("- a\n+ b\n- c", true)).length, 3);
  assert.deepEqual(items(splitMarkdownLists("* a\n* b\n- c", true)), ["a", "b", "c"]);
  assert.equal(lists(splitMarkdownLists("* a\n* b", true)).length, 1);
  assert.deepEqual(items(splitMarkdownLists("+ a\n+ b", true)), ["a", "b"]);
  assert.deepEqual(items(splitMarkdownLists("- a\n- b", true)), ["a", "b"]);

  const nested = splitMarkdownLists("- parent\n  * child", true);
  assert.equal(lists(nested).length, 1);
  assert.deepEqual(items(nested), ["parent\n* child"]);
  const inner = splitMarkdownLists(items(nested)[0] ?? "", true);
  assert.deepEqual(items(inner), ["child"]);

  assert.deepEqual(items(splitMarkdownLists("+   plus\n    - child", true)), [
    "plus\n- child",
  ]);
  assert.deepEqual(items(splitMarkdownLists("-    foo\n  - bar", true)), ["foo", "bar"]);
  assert.deepEqual(items(splitMarkdownLists("-    foo\n  * bar", true)), ["foo", "bar"]);
  assert.equal(lists(splitMarkdownLists("-    foo\n  * bar", true)).length, 2);

  const apart = splitMarkdownLists("- a\n\n* b", true);
  assert.equal(lists(apart).length, 2);
  assert.deepEqual(items(apart), ["a", "b"]);
  assert.equal(listIsLoose("- a", true), false);
  assert.equal(listIsLoose("- a\n\n- b", true), true);
  assert.deepEqual(splitAssistantBubbles("- a\n\n* b", true), ["- a", "* b"]);
  assert.deepEqual(splitAssistantBubbles("- a\n\n- b", true), ["- a\n\n- b"]);
  assert.deepEqual(splitAssistantBubbles("- a\n* b", true), ["- a\n* b"]);
  assert.equal(lists(splitMarkdownLists("```\n- a\n* b\n```", true)).length, 0);
  assert.equal(lists(splitMarkdownLists("    - a\n    * b", true)).length, 0);
  assert.deepEqual(splitMarkdownLists("- a\n* b", false), [
    { type: "markdown", text: "- a\n* b" },
  ]);

  const tasks = splitQuoteAndTasks("- [ ] a\n\n* [ ] b", true);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.type, "tasks");
  if (tasks[0]?.type === "tasks") {
    assert.equal(tasks[0].items.length, 2);
    assert.equal(tasks[0].loose, true);
  }
});

test("streaming stays plain and copy keeps markdown source", () => {
  assert.match(src, /marker\.bullet === first\.bullet/);
  assert.match(src, /v1\.57/);
  assert.match(swift, /marker\.bullet == first\.bullet/);
  assert.match(swift, /bullet: bullet/);
  assert.match(swift, /v1\.57/);
  assert.match(swift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.doesNotMatch(loose, /marker\.bullet/);
  assert.doesNotMatch(looseSwift, /marker\.bullet/);
  assert.match(tasks, /loose: listIsLoose\(/);
  assert.match(taskSwift, /MarkdownLooseList\.isLoose/);
  assert.doesNotMatch(taskSwift, /marker\.bullet/);
  assert.match(markdown, /MarkdownList\.split\(source, completed: completed\)/);
  assert.match(body, /react-markdown/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.57 /);
  assert.match(spec, /## 157\. v1\.57/);
  assert.match(spec, /CommonMark bullet list markers in completed assistant replies/);
  assert.match(ci, /test_ios_markdown_bullet_list\.py/);
  assert.match(pkg, /markdownBulletList\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane/);
  assert.doesNotMatch(swift, /computerPane/);
});
