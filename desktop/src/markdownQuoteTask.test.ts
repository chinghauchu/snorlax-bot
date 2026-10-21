// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  TASK_CHECKED_GLYPH,
  TASK_CHECKED_LABEL,
  TASK_UNCHECKED_GLYPH,
  TASK_UNCHECKED_LABEL,
  parseTaskLine,
  quoteTaskAnimates,
  splitQuoteAndTasks,
  stripQuoteMarker,
  taskGlyph,
  taskGlyphLabel,
} from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "markdownQuoteTask.ts"), "utf8");
const swift = readFileSync(
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

const PHRASE = "v1.32 blockquotes and task lists in completed assistant replies";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function reducedMotionBlocks(): string[] {
  const needle = "@media (prefers-reduced-motion: reduce)";
  const out: string[] = [];
  let from = 0;
  while (true) {
    const idx = css.indexOf(needle, from);
    if (idx < 0) break;
    const start = css.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push(css.slice(idx, end + 1));
    from = end + 1;
  }
  return out;
}

test("a completed quote drops one marker, including a nested quote", () => {
  assert.equal(stripQuoteMarker("> quoted text"), "quoted text");
  assert.equal(stripQuoteMarker(">quoted"), "quoted");
  assert.equal(stripQuoteMarker("   > indented"), "indented");
  assert.equal(stripQuoteMarker(">> nested"), "> nested");
  assert.equal(stripQuoteMarker("    > code"), null);
  const parts = splitQuoteAndTasks("> quoted text\n>> nested", true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "quote");
  if (parts[0]?.type !== "quote") return;
  assert.equal(parts[0].text, "quoted text\n> nested");
  const inner = splitQuoteAndTasks(parts[0].text, true);
  assert.equal(inner[0]?.type, "markdown");
  assert.equal(inner[1]?.type, "quote");
  if (inner[1]?.type === "quote") assert.equal(inner[1].text, "nested");
});

test("task markers become read-only glyphs; checked is distinct", () => {
  assert.equal(parseTaskLine("- [ ] open")?.checked, false);
  assert.equal(parseTaskLine("- [ ] open")?.text, "open");
  assert.equal(parseTaskLine("- [x] done")?.checked, true);
  assert.equal(parseTaskLine("- [X] done")?.text, "done");
  assert.equal(parseTaskLine("* [ ] star")?.text, "star");
  assert.equal(parseTaskLine("+ [x] plus")?.checked, true);
  assert.deepEqual(parseTaskLine("- [ ]"), { checked: false, text: "" });
  assert.equal(parseTaskLine("- [x]done"), null);
  assert.equal(parseTaskLine("- plain"), null);
  assert.equal(parseTaskLine("1. [ ] no"), null);
  assert.equal(taskGlyph(false), TASK_UNCHECKED_GLYPH);
  assert.equal(taskGlyph(true), TASK_CHECKED_GLYPH);
  assert.equal(TASK_UNCHECKED_GLYPH, "☐");
  assert.equal(TASK_CHECKED_GLYPH, "☑");
  assert.equal(taskGlyphLabel(false), TASK_UNCHECKED_LABEL);
  assert.equal(taskGlyphLabel(true), TASK_CHECKED_LABEL);
  const parts = splitQuoteAndTasks("- [ ] open\n- [x] done\n- [X] also", true);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "tasks");
  if (parts[0]?.type !== "tasks") return;
  assert.deepEqual(parts[0].items, [
    { checked: false, text: "open" },
    { checked: true, text: "done" },
    { checked: true, text: "also" },
  ]);
});

test("v1.49 indented continuation and nested tasks stay in the item", () => {
  const continued = splitQuoteAndTasks("- [ ] open\n  the organic one\n- [x] done", true);
  assert.equal(continued.length, 1);
  assert.equal(continued[0]?.type, "tasks");
  if (continued[0]?.type !== "tasks") return;
  assert.deepEqual(continued[0].items, [
    { checked: false, text: "open\nthe organic one" },
    { checked: true, text: "done" },
  ]);

  const nested = splitQuoteAndTasks(
    "- [ ] parent\n  - [ ] child\n  - [x] also\n- [ ] sib",
    true,
  );
  assert.equal(nested.length, 1);
  if (nested[0]?.type !== "tasks") return;
  assert.equal(nested[0].items.length, 2);
  assert.equal(nested[0].items[1]?.text, "sib");
  const inner = splitQuoteAndTasks(nested[0].items[0]?.text ?? "", true);
  assert.equal(inner[0]?.type, "markdown");
  assert.equal(inner[1]?.type, "tasks");
  if (inner[1]?.type === "tasks") {
    assert.deepEqual(inner[1].items, [
      { checked: false, text: "child" },
      { checked: true, text: "also" },
    ]);
  }

  const starred = splitQuoteAndTasks("* [ ] a\n  more\n+ [x] b", true);
  if (starred[0]?.type === "tasks") {
    assert.equal(starred[0].items[0]?.text, "a\nmore");
    assert.equal(starred[0].items[1]?.checked, true);
  }

  const margin = splitQuoteAndTasks("- [ ] open\nmore\n- [x] later", true);
  assert.equal(margin[0]?.type, "tasks");
  assert.equal(margin[1]?.type, "markdown");
  assert.equal(margin[2]?.type, "tasks");
  if (margin[0]?.type === "tasks") assert.equal(margin[0].items[0]?.text, "open");
  if (margin[1]?.type === "markdown") assert.equal(margin[1].text, "more");

  const loose = splitQuoteAndTasks("- [ ] open\n\n  still open\n\n- [x] next", true);
  assert.equal(loose.length, 1);
  if (loose[0]?.type === "tasks") {
    assert.deepEqual(loose[0].items, [
      { checked: false, text: "open\n\nstill open" },
      { checked: true, text: "next" },
    ]);
  }

  const fenced = splitQuoteAndTasks("- [ ] a\n  ```\n  line\n  ```\n- [x] b", true);
  assert.equal(fenced.length, 1);
  if (fenced[0]?.type === "tasks") {
    assert.match(fenced[0].items[0]?.text ?? "", /```\nline\n```/);
    assert.equal(fenced[0].items[1]?.text, "b");
  }
  const marginFence = splitQuoteAndTasks("- [ ] a\n```\ncode\n```\n- [x] b", true);
  assert.deepEqual(
    marginFence.map((part) => part.type),
    ["tasks", "markdown", "tasks"],
  );
  if (marginFence[1]?.type === "markdown") assert.match(marginFence[1].text, /code/);

  const math = splitQuoteAndTasks("- [ ] a\n  $$\nx\n  $$\n- [ ] b", true);
  assert.equal(math.length, 1);
  if (math[0]?.type === "tasks") assert.match(math[0].items[0]?.text ?? "", /\$\$/);

  const quoted = splitQuoteAndTasks("> - [ ] parent\n>   - [ ] child", true);
  assert.equal(quoted[0]?.type, "quote");
  if (quoted[0]?.type === "quote") {
    const inside = splitQuoteAndTasks(quoted[0].text, true);
    assert.equal(inside[0]?.type, "tasks");
    if (inside[0]?.type === "tasks") {
      const nestedTask = splitQuoteAndTasks(inside[0].items[0]?.text ?? "", true);
      assert.equal(nestedTask.some((part) => part.type === "tasks"), true);
    }
  }

  const live = "- [ ] open\n  more\n  - [ ] child";
  assert.deepEqual(splitQuoteAndTasks(live, false), [{ type: "markdown", text: live }]);
});

test("quotes can hold task lists; fences, math, and streaming stay raw", () => {
  const mixed = "Hello\n\n> quoted text\n>> nested\n\n- [ ] open\n- [x] done";
  const parts = splitQuoteAndTasks(mixed, true);
  assert.equal(parts[0]?.type, "markdown");
  assert.equal(parts[1]?.type, "quote");
  assert.equal(parts[2]?.type, "tasks");
  if (parts[1]?.type === "quote") {
    const inner = splitQuoteAndTasks(parts[1].text, true);
    assert.equal(inner.some((block) => block.type === "quote"), true);
  }
  const quotedTasks = splitQuoteAndTasks("> - [ ] a\n> - [x] b", true);
  assert.equal(quotedTasks.length, 1);
  assert.equal(quotedTasks[0]?.type, "quote");
  if (quotedTasks[0]?.type === "quote") {
    const inner = splitQuoteAndTasks(quotedTasks[0].text, true);
    assert.equal(inner.length, 1);
    assert.equal(inner[0]?.type, "tasks");
    if (inner[0]?.type === "tasks") {
      assert.equal(inner[0].items[0]?.checked, false);
      assert.equal(inner[0].items[1]?.checked, true);
    }
  }
  const fence = "```\n> quoted text\n- [ ] open\n```";
  const fenced = splitQuoteAndTasks(fence, true);
  assert.equal(fenced.length, 1);
  assert.equal(fenced[0]?.type, "markdown");
  const math = "$$\n> quoted text\n- [x] done\n$$";
  assert.equal(splitQuoteAndTasks(math, true)[0]?.type, "markdown");
  const live = splitQuoteAndTasks("> quoted text\n- [ ] open", false);
  assert.equal(live.length, 1);
  assert.equal(live[0]?.type, "markdown");
  assert.equal(
    live[0]?.type === "markdown" ? live[0].text : "",
    "> quoted text\n- [ ] open",
  );
  assert.equal(quoteTaskAnimates(false), false);
  assert.equal(quoteTaskAnimates(true), false);
});

test("completed replies style the rule and glyphs; copy still uses markdown source", () => {
  assert.match(body, /splitQuoteAndTasks\(protectLazySetext\(text, completed\), completed\)/);
  assert.match(body, /className="md-quote"/);
  assert.match(body, /className="md-task-list"/);
  assert.match(body, /className=\{[^}]*md-task-item is-checked/);
  assert.match(body, /taskGlyph\(item\.checked\)/);
  assert.match(body, /taskGlyphLabel\(item\.checked\)/);
  assert.match(body, /role="img"/);
  assert.match(body, /quoteTaskAnimates\(false\)/);
  assert.doesNotMatch(body, /type="checkbox"/);
  const quoteCss = block(".assistant-md blockquote.md-quote");
  assert.match(quoteCss, /padding-left:\s*10px/);
  assert.match(quoteCss, /border-left:\s*2px solid var\(--border\)/);
  assert.match(quoteCss, /color:\s*var\(--text-muted\)/);
  assert.match(block(".assistant-md .md-task-list"), /list-style:\s*none/);
  assert.match(block(".assistant-md .md-task-item.is-checked"), /color:\s*var\(--text-muted\)/);
  assert.match(block(".assistant-md .md-task-glyph"), /pointer-events:\s*none/);
  const reduce = reducedMotionBlocks().find((part) => part.includes(".md-quote"));
  assert.ok(reduce, "missing Reduce Motion rule for quotes");
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(body, /tableClipboardText\(table\.source\)/);
  assert.match(body, /codeBlockClipboardText\(source\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /static let uncheckedGlyph = "☐"/);
  assert.match(swift, /static let checkedGlyph = "☑"/);
  assert.match(swift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.match(swift, /return nil/);
  assert.match(markdown, /MarkdownSetext\.protectLazy\(source, completed: completed\)/);
  assert.match(markdown, /MarkdownQuoteTask\.split\(/);
  assert.match(markdown, /className="md-quote"|MarkdownQuoteBlock/);
  assert.match(markdown, /Rectangle\(\)/);
  assert.match(markdown, /\.frame\(width: 2\)/);
  assert.match(markdown, /\.padding\(\.leading, 10\)/);
  assert.match(markdown, /\.foregroundStyle\(\.secondary\)/);
  assert.match(markdown, /MarkdownQuoteTask\.glyph\(checked: item\.checked\)/);
  assert.match(markdown, /MarkdownQuoteTask\.animation\(reduceMotion: reduceMotion\)/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /Toggle/);
  assert.match(markdown, /byCharWrapping/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.32 /);
  assert.match(roadmap, /\/ v1\.49 /);
  assert.match(
    roadmap,
    /v1\.49 GFM task items keep indented continuation in completed assistant replies/,
  );
  assert.match(spec, /## 132\. v1\.32/);
  assert.match(spec, /## 149\. v1\.49/);
  assert.match(spec, /blockquotes and task lists in completed assistant replies/i);
  assert.match(spec, /task items keep indented continuation in completed assistant replies/i);
  assert.match(src, /function readTaskItem/);
  assert.match(src, /function parseTaskMarker/);
  assert.match(swift, /private static func readTaskItem/);
  assert.match(swift, /private static func parseTaskMarker/);
  assert.match(swift, /v1\.49/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_quote_task\.py/);
  assert.match(pkg, /markdownQuoteTask\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
