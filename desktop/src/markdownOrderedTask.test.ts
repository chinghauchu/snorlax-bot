// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { protectMarkdownEscapes } from "./markdownEscape.ts";
import { orderedListEnd } from "./markdownList.ts";
import {
  orderedTaskAnimates,
  parseListItemTask,
  peelOrderedTaskChildren,
  remarkOrderedTaskMarkers,
  stripOrderedTaskToken,
  ORDERED_TASK_CHECKED_TOKEN,
  ORDERED_TASK_UNCHECKED_TOKEN,
} from "./markdownOrderedTask.ts";
import { parseTaskLine, splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { taskGlyph, taskGlyphLabel } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownOrderedTask.ts"), "utf8");
const listSrc = readFileSync(join(here, "markdownList.ts"), "utf8");
const tasks = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownOrderedTask.swift"),
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
  "v1.59 GFM ordered task lists in completed assistant replies";

function html(text: string, completed = true): string {
  const source = completed ? protectMarkdownEscapes(text, true) : text;
  return renderToStaticMarkup(
    React.createElement(
      Markdown,
      {
        remarkPlugins: completed ? [remarkOrderedTaskMarkers] : [],
        components: {
          li: ({ children }: { children?: React.ReactNode }) => {
            const peeled = peelOrderedTaskChildren(children);
            if (peeled.checked == null) {
              return React.createElement("li", null, children);
            }
            return React.createElement(
              "li",
              {
                className: peeled.checked
                  ? "md-inline-task is-checked"
                  : "md-inline-task",
              },
              React.createElement(
                "span",
                {
                  className: "md-task-glyph",
                  role: "img",
                  "aria-label": taskGlyphLabel(peeled.checked),
                },
                taskGlyph(peeled.checked),
              ),
              peeled.children,
            );
          },
        },
      },
      source,
    ),
  );
}

test("a task marker at the start of an item is a checkbox; the rest stays text", () => {
  assert.deepEqual(parseListItemTask("[ ] todo"), { checked: false, text: "todo" });
  assert.deepEqual(parseListItemTask("[x] done"), { checked: true, text: "done" });
  assert.deepEqual(parseListItemTask("[X] done"), { checked: true, text: "done" });
  assert.deepEqual(parseListItemTask("[ ]"), { checked: false, text: "" });
  assert.deepEqual(parseListItemTask("[x]\nmore"), { checked: true, text: "more" });
  assert.equal(parseListItemTask("[x]done"), null);
  assert.equal(parseListItemTask("see [ ] later"), null);
  assert.equal(parseListItemTask("`[x] code`"), null);
  assert.equal(parseListItemTask("\\[ ] escaped"), null);
  assert.equal(parseListItemTask("    [ ] code"), null);
  assert.deepEqual(parseListItemTask("  [ ] padded"), { checked: false, text: "padded" });
  assert.equal(parseTaskLine("1. [ ] no"), null);
  assert.equal(parseTaskLine("- [x] done")?.checked, true);
  assert.equal(stripOrderedTaskToken(`${ORDERED_TASK_UNCHECKED_TOKEN}todo`)?.checked, false);
  assert.equal(stripOrderedTaskToken(`${ORDERED_TASK_CHECKED_TOKEN}todo`)?.rest, "todo");
  assert.equal(stripOrderedTaskToken("todo"), null);
  assert.equal(orderedTaskAnimates(false), false);
  assert.equal(orderedTaskAnimates(true), false);
});

test("ordered task markers render as read-only glyphs and keep the list", () => {
  const open = html("1. [ ] todo\n2. [x] done\n3. [X] also");
  assert.match(open, /<ol>/);
  assert.equal(open.match(/md-task-glyph/g)?.length, 3);
  assert.match(open, /aria-label="Unchecked"/);
  assert.match(open, /aria-label="Checked"/);
  assert.match(open, /md-inline-task is-checked/);
  assert.match(open, />todo</);
  assert.match(open, />done</);
  assert.doesNotMatch(open, /\[ \]/);
  assert.doesNotMatch(open, /\[x\]/);
  assert.doesNotMatch(open, /\[X\]/);
  assert.match(open, /☐/);
  assert.match(open, /☑/);

  const start = html("9. [ ] nine\n10. [x] ten");
  assert.match(start, /<ol start="9">/);
  assert.equal(start.match(/md-task-glyph/g)?.length, 2);

  const paren = html("1) [ ] paren\n2) [x] next");
  assert.match(paren, /<ol>/);
  assert.equal(paren.match(/md-task-glyph/g)?.length, 2);

  const mixed = html("1. [ ] open\n2. plain\n3. [x] shut");
  assert.match(mixed, /<ol>/);
  assert.equal(mixed.match(/<li/g)?.length, 3);
  assert.equal(mixed.match(/md-task-glyph/g)?.length, 2);
  assert.match(mixed, />plain</);

  const loose = html("1. [ ] a\n\n2. [x] b");
  assert.match(loose, /<p>/);
  assert.equal(loose.match(/md-task-glyph/g)?.length, 2);
  assert.match(loose, /is-checked/);
});

test("a marker that is not a task stays literal, including code and escapes", () => {
  const glued = html("1. [x]done");
  assert.match(glued, /\[x\]done/);
  assert.doesNotMatch(glued, /md-task-glyph/);

  const later = html("1. see [ ] later");
  assert.match(later, /\[ \]/);
  assert.doesNotMatch(later, /md-task-glyph/);

  const coded = html("1. `[x] kept`");
  assert.match(coded, /<code>/);
  assert.match(coded, /\[x\]/);
  assert.doesNotMatch(coded, /md-task-glyph/);

  const inside = html("1. [ ] see `[x]`");
  assert.match(inside, /md-task-glyph/);
  assert.match(inside, /<code>/);
  assert.match(inside, /\[x\]/);
  assert.doesNotMatch(inside, /\[ \]/);

  const escaped = html("1. \\[ ] escaped");
  assert.doesNotMatch(escaped, /md-task-glyph/);
  assert.match(escaped, /SBE00005B/);

  const fence = html("```\n1. [ ] no\n```\n2. [x] yes");
  assert.match(fence, /<code/);
  assert.match(fence, /1\. \[ \] no/);
  assert.match(fence, /md-task-glyph/);
  assert.equal(fence.match(/md-task-glyph/g)?.length, 1);

  const interrupt = html("The count is\n14. [ ] not a list");
  assert.doesNotMatch(interrupt, /md-task-glyph/);
  assert.match(interrupt, /\[ \]/);
  const does = html("The count is\n1. [ ] a list");
  assert.match(does, /md-task-glyph/);

  const streaming = html("1. [ ] todo", false);
  assert.match(streaming, /\[ \]/);
  assert.doesNotMatch(streaming, /md-task-glyph/);
});

test("nested tasks stay inside the ordered item", () => {
  const nested = html("1. [ ] parent\n   - [ ] child\n2. [x] next");
  assert.match(nested, /<ol>/);
  assert.match(nested, /<ul>/);
  assert.equal(nested.match(/md-task-glyph/g)?.length, 3);
  assert.match(nested, /parent/);
  assert.match(nested, /child/);

  const orderedChild = html("- parent\n  1. [ ] child\n  2. [x] more");
  assert.match(orderedChild, /<ul>/);
  assert.match(orderedChild, /<ol>/);
  assert.equal(orderedChild.match(/md-task-glyph/g)?.length, 2);

  const lines = "1. [ ] parent\n   - [ ] child\n2. [x] next".split("\n");
  assert.equal(orderedListEnd(lines, 0), 3);
  const kept = splitQuoteAndTasks("1. [ ] parent\n   - [ ] child\n2. [x] next", true);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.type, "markdown");
  if (kept[0]?.type === "markdown") {
    assert.match(kept[0].text, /1\. \[ \] parent/);
    assert.match(kept[0].text, /- \[ \] child/);
  }

  const bullet = splitQuoteAndTasks("- [ ] open\n- [x] done\n* [X] also", true);
  assert.equal(bullet[0]?.type, "tasks");
  const star = splitQuoteAndTasks("* [X] done", true);
  assert.equal(star[0]?.type, "tasks");
  if (star[0]?.type === "tasks") assert.equal(star[0].items[0]?.checked, true);
});

test("streaming stays plain and copy keeps markdown source", () => {
  assert.match(src, /export function parseListItemTask/);
  assert.match(src, /export function remarkOrderedTaskMarkers/);
  assert.match(src, /export function orderedTaskAnimates/);
  assert.match(src, /return false/);
  assert.match(src, /v1\.59/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane/);
  assert.match(listSrc, /export function orderedListEnd/);
  assert.match(tasks, /orderedListEnd/);
  assert.match(tasks, /v1\.59/);
  assert.match(body, /remarkOrderedTaskMarkers, remarkHardBreaks, remarkStrikethrough/);
  assert.match(body, /peelOrderedTaskChildren/);
  assert.match(body, /withOrderedTaskGlyph/);
  assert.match(body, /md-inline-task is-checked/);
  assert.match(body, /taskGlyph\(peeled\.checked\)/);
  assert.match(body, /taskGlyphLabel\(peeled\.checked\)/);
  assert.match(body, /orderedTaskAnimates\(false\)/);
  assert.match(css, /li\.md-inline-task\.is-checked/);
  assert.match(css, /animation:\s*none/);
  assert.match(swift, /static func parseItem/);
  assert.match(swift, /static func animation/);
  assert.match(swift, /return nil/);
  assert.match(swift, /v1\.59/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /Toggle/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(listSwift, /static func orderedListEnd/);
  assert.match(listSwift, /marker\.ordered/);
  assert.match(taskSwift, /MarkdownList\.orderedListEnd/);
  assert.match(taskSwift, /v1\.59/);
  assert.match(markdown, /MarkdownOrderedTask\.parseItem\(item\)/);
  assert.match(markdown, /MarkdownQuoteTask\.glyph\(checked: task\.checked\)/);
  assert.match(markdown, /MarkdownQuoteTask\.glyphLabel\(checked: task\.checked\)/);
  assert.match(markdown, /MarkdownOrderedTask\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(listSwift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.59 /);
  assert.match(spec, /## 159\. v1\.59/);
  assert.match(spec, /GFM ordered task lists in completed assistant replies/);
  assert.match(ci, /test_ios_markdown_ordered_task\.py/);
  assert.match(pkg, /markdownOrderedTask\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.equal(body.split("remarkHardBreaks, remarkStrikethrough").length, 4);
});
