// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assistantBubbleWide } from "./assistantBubbles.ts";
import {
  TABLE_COPIED_ARIA,
  TABLE_COPIED_LABEL,
  TABLE_COPY_ARIA,
  TABLE_COPY_LABEL,
  TABLE_COPY_MS,
  containsMarkdownTable,
  splitMarkdownTables,
  tableClipboardText,
  tableCopyAnimates,
  tableCopyAriaLabel,
  tableCopyLabel,
  showTableCopy,
} from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const bubbles = readFileSync(join(here, "assistantBubbles.ts"), "utf8");
const src = readFileSync(join(here, "markdownTable.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownTable.swift"),
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

const PHRASE = "v1.31 markdown tables in completed assistant replies";

const SAMPLE = ["| City | Temp |", "| :--- | ---: |", "| Oslo | 12 |", "| Lima | 21 |"].join(
  "\n",
);

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

test("a completed pipe table keeps its markdown source and alignment", () => {
  const parts = splitMarkdownTables(`note\n\n${SAMPLE}\n\nafter`, true);
  assert.equal(parts.length, 3);
  assert.equal(parts[0]?.type, "markdown");
  assert.equal(parts[2]?.type, "markdown");
  assert.equal(parts[1]?.type, "table");
  if (parts[1]?.type !== "table") return;
  assert.equal(parts[1].table.source, SAMPLE);
  assert.deepEqual(parts[1].table.header, ["City", "Temp"]);
  assert.deepEqual(parts[1].table.align, ["left", "right"]);
  assert.deepEqual(parts[1].table.rows, [
    ["Oslo", "12"],
    ["Lima", "21"],
  ]);
  assert.equal(tableClipboardText(parts[1].table.source), SAMPLE);
  assert.equal(containsMarkdownTable(SAMPLE), true);
  assert.equal(TABLE_COPY_MS, 1500);
  assert.equal(TABLE_COPY_LABEL, "Copy");
  assert.equal(TABLE_COPIED_LABEL, "Copied");
  assert.equal(tableCopyLabel(false), "Copy");
  assert.equal(tableCopyLabel(true), "Copied");
  assert.equal(TABLE_COPY_ARIA, "Copy table");
  assert.equal(TABLE_COPIED_ARIA, "Copied");
  assert.equal(tableCopyAriaLabel(false), "Copy table");
  assert.equal(tableCopyAriaLabel(true), "Copied");
});

test("pipes without a delimiter, fences, and streaming stay plain text", () => {
  const prose = "the ratio is 1 | 2 and that is all";
  assert.deepEqual(splitMarkdownTables(prose, true), [
    { type: "markdown", text: prose },
  ]);
  assert.equal(containsMarkdownTable(prose), false);
  const fence = "```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```";
  const fenced = splitMarkdownTables(fence, true);
  assert.equal(fenced.length, 1);
  assert.equal(fenced[0]?.type, "markdown");
  const math = "$$\na | b\n--- | ---\n$$";
  assert.equal(splitMarkdownTables(math, true)[0]?.type, "markdown");
  const live = splitMarkdownTables(SAMPLE, false);
  assert.equal(live.length, 1);
  assert.equal(live[0]?.type, "markdown");
  assert.equal(live[0]?.type === "markdown" ? live[0].text : "", SAMPLE);
  assert.equal(showTableCopy(false), false);
  assert.equal(showTableCopy(true), true);
  assert.equal(tableCopyAnimates(false), false);
  assert.equal(tableCopyAnimates(true), false);
  const coded = splitMarkdownTables("| `a|b` | c |\n| --- | --- |\n| 1 | 2 |", true);
  assert.equal(coded[0]?.type, "markdown");
  const bare = splitMarkdownTables("name | score\n--- | ---\nAda | 10", true);
  assert.equal(bare[0]?.type, "table");
  if (bare[0]?.type === "table") {
    assert.deepEqual(bare[0].table.align, ["left", "left"]);
    assert.equal(bare[0].table.source.includes("|"), true);
  }
});

test("a wide table scrolls inside the bubble; streaming does not widen", () => {
  assert.equal(assistantBubbleWide(SAMPLE, true), true);
  assert.equal(assistantBubbleWide(SAMPLE, false), false);
  assert.equal(assistantBubbleWide("short hello", false), false);
  assert.equal(assistantBubbleWide("```js\nconst x = 1\n```", false), true);
  const scroll = block(".md-table-scroll");
  assert.match(scroll, /overflow-x:\s*auto/);
  assert.match(scroll, /overflow-y:\s*hidden/);
  assert.match(scroll, /max-width:\s*100%/);
  assert.match(scroll, /min-width:\s*0/);
  const table = block(".md-table-scroll table");
  assert.match(table, /width:\s*max-content/);
  assert.match(table, /min-width:\s*100%/);
  const cell = block(".md-table th,\n.md-table td");
  assert.match(cell, /white-space:\s*nowrap/);
  assert.match(block(".md-table"), /max-width:\s*100%/);
  assert.match(block(".md-table"), /overflow:\s*hidden/);
  const reduce = reducedMotionBlocks().find((part) => part.includes(".md-table"));
  assert.ok(reduce, "missing Reduce Motion rule for tables");
  assert.match(reduce, /transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  assert.match(bubbles, /containsMarkdownTable/);
  assert.match(app, /assistantBubbleWide\(part, completed\)/);
});

test("Copy sits on the table, copies markdown source, and OpenAPI stays 0.18.0", () => {
  assert.match(body, /splitMarkdownTables\(stable, completed\)/);
  assert.match(body, /showTableCopy\(completed\)/);
  assert.match(body, /tableClipboardText\(table\.source\)/);
  assert.match(body, /tableCopyLabel\(copied\)/);
  assert.match(body, /aria-label=\{tableCopyAriaLabel\(copied\)\}/);
  assert.match(body, /className="md-table-scroll"/);
  assert.match(body, /className="md-copy"/);
  assert.match(body, /TABLE_COPY_MS/);
  assert.match(body, /type="button"/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(src, /markdown source/);
  assert.match(markdown, /ScrollView\(\.horizontal/);
  assert.match(markdown, /MarkdownTableCopy\.clipboardText/);
  assert.match(markdown, /MarkdownTableCopy\.showsCopy\(completed: completed\)/);
  assert.match(swift, /static let copyAria = "Copy table"/);
  assert.match(swift, /return nil/);
  assert.match(markdown, /MarkdownTable\.split/);
  assert.match(markdown, /MarkdownTableBlock/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.31 /);
  assert.match(spec, /## 131\. v1\.31/);
  assert.match(spec, /markdown tables in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_table\.py/);
  assert.match(pkg, /markdownTable\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
