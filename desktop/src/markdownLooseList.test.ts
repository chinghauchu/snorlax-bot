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
import {
  LOOSE_LIST_ITEM_SPACING_PX,
  TIGHT_LIST_ITEM_SPACING_PX,
  listIsLoose,
  listItemSpacing,
  looseListAnimates,
} from "./markdownLooseList.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownLooseList.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const bubbles = readFileSync(join(here, "assistantBubbles.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const tasks = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLooseList.swift"),
  "utf8",
);
const listSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownList.swift"),
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
  "v1.51 CommonMark loose and tight lists in completed assistant replies";

function render(text: string): string {
  return renderToStaticMarkup(React.createElement(Markdown, { children: text }));
}

/** True when a direct child of the outermost list's items is a paragraph. */
function outerListLoose(html: string): boolean {
  const open = html.match(/^<(ul|ol)(?: start="\d+")?>/);
  assert.ok(open, html);
  const close = `</${open[1]}>`;
  const inner = html.slice(open[0].length, html.lastIndexOf(close));
  let depth = 0;
  let i = 0;
  const items: string[] = [];
  while (i < inner.length) {
    if (inner.startsWith("<ul>", i) || inner.startsWith("<ol>", i) || inner.startsWith("<ol ", i)) {
      depth += 1;
      i += 4;
      continue;
    }
    if (inner.startsWith("</ul>", i) || inner.startsWith("</ol>", i)) {
      depth -= 1;
      i += 5;
      continue;
    }
    if (depth === 0 && inner.startsWith("<li>", i)) {
      let j = i + 4;
      let d = 1;
      while (j < inner.length && d > 0) {
        if (inner.startsWith("<li>", j)) {
          d += 1;
          j += 4;
          continue;
        }
        if (inner.startsWith("</li>", j)) {
          d -= 1;
          if (d === 0) break;
          j += 5;
          continue;
        }
        j += 1;
      }
      items.push(inner.slice(i + 4, j));
      i = j + 5;
      continue;
    }
    i += 1;
  }
  assert.ok(items.length > 0, html);
  return items.some((item) => /^\s*<p[\s>]/.test(item));
}

test("tight lists stay compact and loose lists use paragraph spacing", () => {
  assert.equal(looseListAnimates(false), false);
  assert.equal(looseListAnimates(true), false);
  assert.equal(TIGHT_LIST_ITEM_SPACING_PX, 4);
  assert.equal(LOOSE_LIST_ITEM_SPACING_PX, 8);
  assert.equal(listItemSpacing(false), 4);
  assert.equal(listItemSpacing(true), 8);

  const tight = ["- a\n- b", "* a\n* b", "+ a\n+ b", "1. a\n2. b", "9) nine\n10) ten", "- [ ] a\n- [ ] b"];
  for (const sample of tight) {
    assert.equal(listIsLoose(sample, true), false, sample);
    assert.equal(outerListLoose(render(sample)), false, sample);
  }

  const loose = [
    "- a\n\n- b",
    "- a\n- b\n\n- c",
    "* a\n\n* b",
    "1. a\n\n2. b",
    "1) a\n\n2) b",
    "3. three\n\n4. four",
    "- [ ] a\n\n- [x] b",
    "- a\n\n  b\n- c",
    "- [ ] a\n\n  still\n- [ ] b",
  ];
  for (const sample of loose) {
    assert.equal(listIsLoose(sample, true), true, sample);
    assert.equal(outerListLoose(render(sample)), true, sample);
  }

  assert.equal(listIsLoose("- a\n  b\n- c", true), false);
  assert.equal(outerListLoose(render("- a\n  b\n- c")), false);
  assert.equal(listIsLoose("- a\n\npara", true), false);
  assert.equal(listIsLoose("hello", true), false);
  assert.equal(listIsLoose("- a\n\n- b", false), false);
  assert.match(render("- a\n\n- b"), /<li>\s*<p>a<\/p>/);
  assert.match(render("- a\n- b"), /<li>a<\/li>/);
  assert.doesNotMatch(render("- a\n- b"), /<li>\s*<p>/);
});

test("nested lists keep their own looseness, and code blanks do not loosen", () => {
  assert.equal(listIsLoose("- a\n  - b\n\n  - c\n- d", true), false);
  assert.equal(outerListLoose(render("- a\n  - b\n\n  - c\n- d")), false);
  assert.match(render("- a\n  - b\n\n  - c\n- d"), /<li>\s*<p>b<\/p>/);
  assert.equal(listIsLoose("- b\n\n- c", true), true);

  assert.equal(listIsLoose("- a\n\n  - b\n- c", true), true);
  assert.equal(outerListLoose(render("- a\n\n  - b\n- c")), true);
  assert.equal(listIsLoose("- b", true), false);

  assert.equal(listIsLoose("- foo\n  - bar\n\n    baz\n- qux", true), false);
  assert.equal(outerListLoose(render("- foo\n  - bar\n\n    baz\n- qux")), false);
  assert.equal(listIsLoose("- a\n  - b\n\n  c\n- d", true), true);

  assert.equal(listIsLoose("- a\n  ```\n  x\n\n  y\n  ```\n- b", true), false);
  assert.equal(outerListLoose(render("- a\n  ```\n  x\n\n  y\n  ```\n- b")), false);
  assert.equal(listIsLoose("- a\n\n  ```\n  x\n  ```\n- b", true), true);
  assert.equal(listIsLoose("- a\n  $$\nx\n\ny\n  $$\n- b", true), false);
  assert.equal(listIsLoose("- a\n\n  $$\nx\n  $$\n- b", true), true);
  assert.equal(listIsLoose("- item\n      code\n\n      more\n- next", true), true);
  assert.equal(listIsLoose("- item\n\n      code\n\n      more\n- next", true), true);
  assert.equal(listIsLoose("- a\n - b\n  - c\n   - d", true), false);
  assert.equal(listIsLoose("- a\n    - b", true), false);
});

test("task lists record looseness and nested tasks stay independent", () => {
  const tight = splitQuoteAndTasks("- [ ] open\n- [x] done", true);
  assert.equal(tight[0]?.type, "tasks");
  if (tight[0]?.type === "tasks") {
    assert.equal(tight[0].loose, false);
    assert.deepEqual(
      tight[0].items.map((item) => item.text),
      ["open", "done"],
    );
  }

  const loose = splitQuoteAndTasks("- [ ] open\n\n- [x] next", true);
  assert.equal(loose[0]?.type, "tasks");
  if (loose[0]?.type === "tasks") assert.equal(loose[0].loose, true);

  const blocks = splitQuoteAndTasks("- [ ] open\n\n  still open\n\n- [x] next", true);
  assert.equal(blocks.length, 1);
  if (blocks[0]?.type === "tasks") {
    assert.equal(blocks[0].loose, true);
    assert.deepEqual(blocks[0].items, [
      { checked: false, text: "open\n\nstill open" },
      { checked: true, text: "next" },
    ]);
  }

  const nested = splitQuoteAndTasks(
    "- [ ] parent\n  - [ ] child\n\n  - [ ] child2\n- [ ] sib",
    true,
  );
  assert.equal(nested[0]?.type, "tasks");
  if (nested[0]?.type === "tasks") {
    assert.equal(nested[0].loose, false);
    const inner = splitQuoteAndTasks(nested[0].items[0]?.text ?? "", true);
    const child = inner.find((part) => part.type === "tasks");
    assert.ok(child && child.type === "tasks");
    if (child?.type === "tasks") {
      assert.equal(child.loose, true);
      assert.deepEqual(
        child.items.map((item) => item.checked),
        [false, false],
      );
    }
  }

  assert.equal(splitQuoteAndTasks("- [ ] open\n- [x] done", false)[0]?.type, "markdown");
});

test("a blank inside a list stays one bubble; other blanks still split", () => {
  assert.deepEqual(splitAssistantBubbles("- a\n\n- b", true), ["- a\n\n- b"]);
  assert.deepEqual(splitAssistantBubbles("1. a\n\n2. b", true), ["1. a\n\n2. b"]);
  assert.deepEqual(splitAssistantBubbles("- [ ] a\n\n- [ ] b", true), ["- [ ] a\n\n- [ ] b"]);
  assert.deepEqual(splitAssistantBubbles("- a\n\n  b", true), ["- a\n\n  b"]);
  assert.deepEqual(splitAssistantBubbles("para\n\n- a\n\n- b", true), ["para", "- a\n\n- b"]);
  assert.deepEqual(splitAssistantBubbles("- a\n\npara", true), ["- a", "para"]);
  assert.deepEqual(splitAssistantBubbles("Hello\n\nThere", true), ["Hello", "There"]);
  assert.deepEqual(splitAssistantBubbles("    a\n\n    b", true), ["    a\n\n    b"]);
  assert.deepEqual(splitAssistantBubbles("```\n- a\n\n- b\n```", true), ["```\n- a\n\n- b\n```"]);
  const live = "- a\n\n- b";
  assert.deepEqual(splitAssistantBubbles(live, false), [live]);
  assert.match(bubbles, /markdownListEnd/);
  assert.match(markdown, /MarkdownList\.listEnd/);
});

test("renderers use the gap and copy keeps markdown source", () => {
  assert.match(css, /\.assistant-md li > p:last-child \{\s*margin-bottom: 8px;/);
  assert.match(css, /\.assistant-md li:last-child > p:last-child \{\s*margin-bottom: 0;/);
  assert.match(css, /\.assistant-md \.md-task-list\[data-loose="true"\] \.md-task-item \{\s*margin-bottom: 8px;/);
  assert.match(body, /className="md-task-list"/);
  assert.match(body, /data-loose=\{block\.loose \? "true" : "false"\}/);
  assert.match(tasks, /loose: listIsLoose\(/);
  assert.match(markdown, /MarkdownLooseList\.itemSpacing\(loose: group\.loose\)/);
  assert.match(markdown, /MarkdownLooseList\.itemSpacing\(loose: loose\)/);
  assert.match(markdown, /MarkdownLooseList\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(listSwift, /MarkdownLooseList\.isLoose/);
  assert.match(listSwift, /static func listEnd/);
  assert.match(taskSwift, /MarkdownLooseList\.isLoose/);
  assert.match(swift, /static func isLoose\(_ text: String, completed: Bool\)/);
  assert.match(swift, /static func itemSpacing\(loose: Bool\)/);
  assert.match(swift, /itemDirectlyLoose/);
  assert.match(swift, /MarkdownList\.listEnd/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(src, /export function listIsLoose/);
  assert.match(src, /markdown source/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /listIsLoose\(reply\.content/);
  assert.equal(body.split("data-loose=").length, 2);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.51 /);
  assert.match(spec, /## 151\. v1\.51/);
  assert.match(spec, /loose and tight lists in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_loose_list\.py/);
  assert.match(pkg, /markdownLooseList\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
