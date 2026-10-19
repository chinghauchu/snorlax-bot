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
  listAnimates,
  listMarker,
  listMarkerLabel,
  splitMarkdownLists,
  type ListBlock,
} from "./markdownList.ts";

const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "markdownList.ts"), "utf8");
const swift = readFileSync(
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

const PHRASE =
  "v1.36 ordered list start numbers and nested lists in completed assistant replies";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function render(text: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      components: {
        ol: ({ start, children }) =>
          typeof start === "number"
            ? React.createElement("ol", { start }, children)
            : React.createElement("ol", null, children),
        li: ({ children }) => React.createElement("li", null, children),
      },
      children: text,
    }),
  );
}

function lists(blocks: ListBlock[]) {
  return blocks.filter((block) => block.type === "list");
}

test("desktop CommonMark keeps the start number and nests lists", () => {
  const continued = render("3. three\n4. four");
  assert.match(continued, /<ol start="3">/);
  assert.match(continued, /<li>three<\/li>/);
  assert.match(continued, /<li>four<\/li>/);
  assert.doesNotMatch(continued, /<ol>/);

  const interrupted = render("3. alpha\n\nparagraph\n\n4. beta");
  assert.match(interrupted, /<ol start="3">/);
  assert.match(interrupted, /<p>paragraph<\/p>/);
  assert.match(interrupted, /<ol start="4">/);

  const fenced = render("3. alpha\n```\ncode\n```\n4. beta");
  assert.match(fenced, /<ol start="3">/);
  assert.match(fenced, /<pre><code>code\n<\/code><\/pre>/);
  assert.match(fenced, /<ol start="4">/);

  const nested = render("- parent\n  - child\n    1. grand\n    2. next\n- sib");
  assert.match(nested, /<ul>\s*<li>parent\s*<ul>\s*<li>child\s*<ol>\s*<li>grand<\/li>\s*<li>next<\/li>/);
  assert.match(nested, /<li>sib<\/li>\s*<\/ul>/);
  assert.match(body, /<ol start=\{start\}>/);
  assert.match(body, /typeof start === "number"/);
  assert.match(block(".assistant-md ul"), /list-style:\s*disc outside/);
  assert.match(block(".assistant-md ul"), /padding-left:\s*1\.2em/);
  assert.match(block(".assistant-md ol"), /list-style:\s*decimal outside/);
  assert.match(css, /list-style-type:\s*circle/);
  assert.match(css, /list-style-type:\s*square/);
});

test("the iOS parser keeps start numbers and nested markers", () => {
  assert.equal(listAnimates(false), false);
  assert.equal(listAnimates(true), false);
  assert.equal(listMarker(true, 3, 0, 0), "3.");
  assert.equal(listMarker(true, 3, 1, 0), "4.");
  assert.equal(listMarker(true, 10, 1, 2), "11.");
  assert.equal(listMarker(false, 1, 0, 0), "•");
  assert.equal(listMarker(false, 1, 0, 1), "◦");
  assert.equal(listMarker(false, 1, 0, 2), "▪");
  assert.equal(listMarkerLabel(false, 1, 0, 0), "Bullet");
  assert.equal(listMarkerLabel(true, 4, 0, 0), "4.");

  const same = splitMarkdownLists("3. three\n4. four", true);
  assert.equal(lists(same).length, 1);
  if (same[0]?.type === "list") {
    assert.equal(same[0].list.ordered, true);
    assert.equal(same[0].list.start, 3);
    assert.deepEqual(same[0].list.items, ["three", "four"]);
  }

  const paragraph = splitMarkdownLists("3. three\n\nparagraph\n\n4. four", true);
  assert.deepEqual(
    paragraph.map((part) => part.type),
    ["list", "markdown", "list"],
  );
  if (paragraph[0]?.type === "list" && paragraph[2]?.type === "list") {
    assert.equal(paragraph[0].list.start, 3);
    assert.equal(paragraph[2].list.start, 4);
  }
  if (paragraph[1]?.type === "markdown") {
    assert.match(paragraph[1].text, /paragraph/);
  }

  const fence = splitMarkdownLists("3. alpha\n```\n- not a list\n```\n4. beta", true);
  assert.deepEqual(
    fence.map((part) => part.type),
    ["list", "markdown", "list"],
  );
  if (fence[0]?.type === "list" && fence[2]?.type === "list") {
    assert.equal(fence[0].list.start, 3);
    assert.deepEqual(fence[0].list.items, ["alpha"]);
    assert.equal(fence[2].list.start, 4);
  }
  if (fence[1]?.type === "markdown") {
    assert.match(fence[1].text, /- not a list/);
  }

  const paren = splitMarkdownLists("9) nine\n10) ten", true);
  if (paren[0]?.type === "list") {
    assert.equal(paren[0].list.start, 9);
    assert.equal(paren[0].list.delimiter, ")");
    assert.deepEqual(paren[0].list.items, ["nine", "ten"]);
  }
  const mixed = splitMarkdownLists("2) two\n3. three", true);
  assert.equal(lists(mixed).length, 2);
  if (mixed[0]?.type === "list" && mixed[1]?.type === "list") {
    assert.equal(mixed[0].list.start, 2);
    assert.equal(mixed[1].list.start, 3);
    assert.equal(mixed[1].list.delimiter, ".");
  }

  const nested = splitMarkdownLists(
    "- parent\n  - child\n    1. grand\n    2. next\n- sib",
    true,
  );
  assert.equal(nested.length, 1);
  if (nested[0]?.type === "list") {
    assert.equal(nested[0].list.ordered, false);
    assert.equal(nested[0].list.items[1], "sib");
    const inner = splitMarkdownLists(nested[0].list.items[0] ?? "", true);
    const child = inner.find((part) => part.type === "list");
    assert.ok(child && child.type === "list");
    if (child?.type === "list") {
      assert.equal(child.list.items.length, 1);
      const grand = splitMarkdownLists(child.list.items[0] ?? "", true).find(
        (part) => part.type === "list",
      );
      assert.ok(grand && grand.type === "list");
      if (grand?.type === "list") {
        assert.equal(grand.list.ordered, true);
        assert.equal(grand.list.start, 1);
        assert.deepEqual(grand.list.items, ["grand", "next"]);
      }
    }
  }

  const tabbed = splitMarkdownLists("- parent\n\t- tab child", true);
  if (tabbed[0]?.type === "list") {
    const inner = splitMarkdownLists(tabbed[0].list.items[0] ?? "", true);
    const child = inner.find((part) => part.type === "list");
    assert.ok(child && child.type === "list");
    if (child?.type === "list") {
      assert.deepEqual(child.list.items, ["tab child"]);
    }
  }

  const loose = splitMarkdownLists("- item\n\n  - nested", true);
  if (loose[0]?.type === "list") {
    const inner = splitMarkdownLists(loose[0].list.items[0] ?? "", true);
    const child = inner.find((part) => part.type === "list");
    assert.ok(child && child.type === "list");
    if (child?.type === "list") assert.deepEqual(child.list.items, ["nested"]);
  }

  assert.deepEqual(splitMarkdownLists("3. three\n4. four", false), [
    { type: "markdown", text: "3. three\n4. four" },
  ]);
  assert.deepEqual(splitMarkdownLists("", true), []);
  const plain = splitMarkdownLists("hello", true);
  assert.equal(plain.length, 1);
  assert.equal(plain[0]?.type, "markdown");
  const wide = splitMarkdownLists("1234567890. no\n3. yes", true);
  assert.equal(wide[0]?.type, "markdown");
  if (wide[1]?.type === "list") assert.equal(wide[1].list.start, 3);

  const math = splitMarkdownLists("$$\n1. not\n$$\n2. yes", true);
  assert.equal(math[0]?.type, "markdown");
  if (math[1]?.type === "list") assert.equal(math[1].list.start, 2);
});

test("completed replies wire the markers; copy stays source", () => {
  assert.match(markdown, /MarkdownList\.split\(source, completed: completed\)/);
  assert.match(markdown, /MarkdownList\.marker\(/);
  assert.match(markdown, /MarkdownList\.markerLabel\(/);
  assert.match(markdown, /MarkdownList\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(markdown, /markdownListDepth/);
  assert.match(markdown, /HStack\(alignment: \.top, spacing: 8\)/);
  assert.match(markdown, /\.environment\(\\\.markdownListDepth, depth \+ 1\)/);
  const listView = markdown.split("struct MarkdownListBlock", 1)[1]?.split("struct MarkdownRule", 1)[0] ?? "";
  assert.doesNotMatch(listView, /withAnimation/);
  assert.match(swift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.match(swift, /static func marker\(ordered: Bool, start: Int, index: Int, depth: Int\)/);
  assert.match(swift, /start \+ index/);
  assert.match(swift, /return "•"/);
  assert.match(swift, /return "◦"/);
  assert.match(swift, /return "▪"/);
  assert.match(swift, /return "Bullet"/);
  assert.match(swift, /return nil/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(src, /export function splitMarkdownLists/);
  assert.match(src, /export function listAnimates/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(body, /tableClipboardText\(table\.source\)/);
  assert.match(body, /codeBlockClipboardText\(source\)/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.36 /);
  assert.match(spec, /## 136\. v1\.36/);
  assert.match(spec, /ordered list start numbers and nested lists in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_list\.py/);
  assert.match(pkg, /markdownList\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
