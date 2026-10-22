// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { listMarker } from "./markdownList.ts";
import { splitMarkdownLists } from "./markdownList.ts";
import { listBlockSpacing } from "./markdownLooseList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownLooseList.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLooseList.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
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
  "v1.63 CommonMark tight list block spacing in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

/** iOS parses each item again. This walks that same recursion. */
function nestedDepth(text: string): number {
  let depth = 0;
  let rest = text;
  for (;;) {
    const blocks = splitMarkdownLists(rest, true);
    const list = blocks.find((part) => part.type === "list");
    if (!list || list.type !== "list") return depth;
    depth += 1;
    const child = list.list.items[0] ?? "";
    if (!child.includes("\n") && !child.startsWith("- ") && !/^\d+[.)] /.test(child)) {
      return depth;
    }
    rest = child;
    if (depth > 12) return depth;
  }
}

test("lists nested 4+ levels already match desktop markers", () => {
  const bullets = Array.from({ length: 6 }, (_, i) => `${"  ".repeat(i)}- L${i + 1}`).join("\n");
  const html = render(bullets);
  assert.match(
    html,
    /<ul>\s*<li>L1\s*<ul>\s*<li>L2\s*<ul>\s*<li>L3\s*<ul>\s*<li>L4\s*<ul>\s*<li>L5\s*<ul>\s*<li>L6<\/li>/,
  );
  assert.doesNotMatch(html, /<p>/);
  assert.equal(nestedDepth(bullets), 6);

  const ordered = Array.from({ length: 5 }, (_, i) => `${"   ".repeat(i)}1. N${i + 1}`).join("\n");
  const ol = render(ordered);
  assert.match(
    ol,
    /<ol>\s*<li>N1\s*<ol>\s*<li>N2\s*<ol>\s*<li>N3\s*<ol>\s*<li>N4\s*<ol>\s*<li>N5<\/li>/,
  );
  assert.equal(nestedDepth(ordered), 5);

  assert.equal(listMarker(false, 1, 0, 0), "•");
  assert.equal(listMarker(false, 1, 0, 1), "◦");
  assert.equal(listMarker(false, 1, 0, 2), "▪");
  assert.equal(listMarker(false, 1, 0, 3), "▪");
  assert.equal(listMarker(false, 1, 0, 4), "▪");
  assert.equal(listMarker(true, 9, 1, 4), "10.");
  assert.match(block(".assistant-md ul"), /list-style:\s*disc outside/);
  assert.match(block(".assistant-md ul"), /padding-left:\s*1\.2em/);
  assert.match(block(".assistant-md ol"), /list-style:\s*decimal outside/);
  assert.match(block(".assistant-md ol"), /padding-left:\s*1\.2em/);
  assert.match(css, /\.assistant-md ul ul ul[\s\S]*list-style-type:\s*square/);
  assert.doesNotMatch(css, /lower-alpha|lower-roman/);
  assert.match(listSwift, /if depth <= 0 \{ return "•" \}/);
  assert.match(listSwift, /if depth == 1 \{ return "◦" \}/);
  assert.match(listSwift, /return "▪"/);
});

test("a tight nested list is flush and a loose one keeps the paragraph gap", () => {
  assert.equal(listBlockSpacing(false), 0);
  assert.equal(listBlockSpacing(true), 8);
  assert.equal(listBlockSpacing(null), 8);

  const tight = render("- parent\n  - child");
  assert.match(tight, /<li>parent\s*<ul>\s*<li>child<\/li>/);
  assert.doesNotMatch(tight, /<p>/);

  const looseNested = render("- parent\n\n  - child");
  assert.match(looseNested, /<li>\s*<p>parent<\/p>\s*<ul>\s*<li>child<\/li>/);

  const looseSibling = render("- a\n\n- b\n  - c");
  assert.match(looseSibling, /<li>\s*<p>b<\/p>\s*<ul>\s*<li>c<\/li>/);

  const childLoose = render("- a\n  - b\n\n  - c\n- d");
  assert.match(childLoose, /<li>a\s*<ul>\s*<li>\s*<p>b<\/p>/);
  assert.doesNotMatch(childLoose, /<li>\s*<p>a<\/p>/);

  const deepTight = Array.from({ length: 4 }, (_, i) => `${"  ".repeat(i)}- L${i + 1}`).join("\n");
  assert.doesNotMatch(render(deepTight), /<p>/);
});

test("iOS uses that gap, and a task row counts as one list level", () => {
  assert.match(src, /export function listBlockSpacing/);
  assert.match(src, /if \(listLoose === false\) return 0/);
  assert.match(swift, /static func blockSpacing\(listLoose: Bool\?\)/);
  assert.match(swift, /listLoose == false \? 0 : looseSpacing/);
  assert.match(swift, /var markdownListLoose: Bool\?/);
  assert.match(markdown, /MarkdownLooseList\.blockSpacing\(listLoose: listLoose\)/);
  assert.match(markdown, /\.environment\(\\\.markdownListLoose, loose\)/);
  assert.match(markdown, /\.environment\(\\\.markdownListLoose, nil as Bool\?\)/);
  const task = markdown.split("struct MarkdownTaskRow", 2)[1]?.split("struct MarkdownSetextPieces", 2)[0] ?? "";
  assert.match(task, /\.environment\(\\\.markdownListDepth, depth \+ 1\)/);
  assert.match(task, /\.environment\(\\\.markdownListLoose, loose\)/);
  assert.match(
    css,
    /\.assistant-md \.md-task-list\[data-loose="true"\] \.md-task-body \{\s*display:\s*flex;\s*flex-direction:\s*column;\s*gap:\s*8px;/,
  );
  assert.doesNotMatch(block(".assistant-md .md-task-body"), /gap:/);
  assert.match(body, /data-loose=\{block\.loose \? "true" : "false"\}/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(swift, /if !completed \|\| text\.isEmpty \{ return false \}/);
});

test("docs stay on OpenAPI 0.18.0", () => {
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.63 /);
  assert.match(spec, /## 163\. v1\.63/);
  assert.match(spec, /tight list block spacing in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_list_block_spacing\.py/);
  assert.match(pkg, /markdownListBlockSpacing\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
