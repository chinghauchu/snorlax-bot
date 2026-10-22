// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractFootnotes } from "./markdownFootnote.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { splitMarkdownTables, tableClipboardText } from "./markdownTable.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownTable.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownTable.swift"),
  "utf8",
);
const footnote = readFileSync(join(here, "markdownFootnote.ts"), "utf8");
const footnoteSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownFootnote.swift"),
  "utf8",
);
const reference = readFileSync(join(here, "markdownReferenceLink.ts"), "utf8");
const referenceSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownReferenceLink.swift"),
  "utf8",
);
const app = readFileSync(join(here, "App.tsx"), "utf8");
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
  "v1.66 GFM pipe-less table rows continue the table in completed assistant replies";

function tableOf(source: string) {
  const parts = splitMarkdownTables(source, true);
  const table = parts.find((part) => part.type === "table");
  assert.ok(table && table.type === "table");
  if (!table || table.type !== "table") throw new Error("expected a table");
  return { parts, table: table.table };
}

function markdownText(source: string): string {
  return splitMarkdownTables(source, true)
    .filter((part) => part.type === "markdown")
    .map((part) => (part.type === "markdown" ? part.text : ""))
    .join("\n");
}

test("a pipe-less line is one cell, and a blank line ends the table", () => {
  const gfm = ["| abc | def |", "| --- | --- |", "| bar | baz |", "bar", "", "bar"].join("\n");
  const { parts, table } = tableOf(gfm);
  assert.deepEqual(table.header, ["abc", "def"]);
  assert.deepEqual(table.align, ["left", "left"]);
  assert.deepEqual(table.rows, [
    ["bar", "baz"],
    ["bar", ""],
  ]);
  assert.equal(tableClipboardText(table.source), ["| abc | def |", "| --- | --- |", "| bar | baz |", "bar"].join("\n"));
  assert.equal(parts.filter((part) => part.type === "table").length, 1);
  assert.equal(markdownText(gfm).trim(), "bar");

  const aligned = ["| L | R |", "| :--- | ---: |", "plain"].join("\n");
  const shaped = tableOf(aligned).table;
  assert.deepEqual(shaped.align, ["left", "right"]);
  assert.deepEqual(shaped.rows, [["plain", ""]]);
  assert.equal(shaped.rows[0]?.length, 2);

  const spaced = tableOf("| a | b |\n| --- | --- |\n   bar baz").table;
  assert.deepEqual(spaced.rows, [["bar baz", ""]]);
  const escaped = tableOf("| a | b |\n| --- | --- |\nfoo \\| bar").table;
  assert.deepEqual(escaped.rows, [["foo \\| bar", ""]]);
  const hash = tableOf("| a | b |\n| --- | --- |\n#foo").table;
  assert.deepEqual(hash.rows, [["#foo", ""]]);
  const equals = tableOf("| a | b |\n| --- | --- |\n===").table;
  assert.deepEqual(equals.rows, [["===", ""]]);
  const star = tableOf("| a | b |\n| --- | --- |\n*foo").table;
  assert.deepEqual(star.rows, [["*foo", ""]]);
  const digits = tableOf("| a | b |\n| --- | --- |\n1234567890. item").table;
  assert.deepEqual(digits.rows, [["1234567890. item", ""]]);
  const span = tableOf("| a | b |\n| --- | --- |\n<span>x</span>").table;
  assert.deepEqual(span.rows, [["<span>x</span>", ""]]);
});

test("a block start still ends the table, and a pipe-less header does not start one", () => {
  const endings = [
    "# heading",
    "---",
    "   ---",
    "> quote",
    "- item",
    "1. item",
    "2) item",
    "-",
    "1.",
    "```",
    "~~~",
    "<div>",
    "<span>",
    "<!-- c -->",
    "    code",
    "$$",
  ];
  for (const line of endings) {
    const source = ["| a | b |", "| --- | --- |", "| row |", line].join("\n");
    const { table } = tableOf(source);
    assert.deepEqual(table.rows, [["row", ""]], line);
    assert.equal(table.source.split("\n").includes(line), false, line);
    assert.match(markdownText(source), new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const setext = splitMarkdownTables("foo\n---\nbar", true);
  assert.equal(setext.length, 1);
  assert.equal(setext[0]?.type, "markdown");

  const bareHeader = splitMarkdownTables("foo\n| --- |\nbar", true);
  assert.equal(bareHeader[0]?.type, "markdown");

  const live = "| a | b |\n| --- | --- |\nbar";
  const streaming = splitMarkdownTables(live, false);
  assert.equal(streaming.length, 1);
  assert.equal(streaming[0]?.type, "markdown");
  if (streaming[0]?.type === "markdown") assert.equal(streaming[0].text, live);
});

test("a pipe-less definition stays in the table", () => {
  const linked = [
    "| a | b |",
    "| --- | --- |",
    "[ref]: https://example.com/in",
    "",
    "See [ref]",
    "",
    "[ref]: https://example.com/out",
  ].join("\n");
  const resolved = resolveReferenceLinks(linked, true);
  assert.match(resolved, /https:\/\/example\.com\/in/);
  assert.doesNotMatch(resolved, /\[ref\]: https:\/\/example\.com\/out/);
  assert.match(resolved, /See \[ref\]\(https:\/\/example\.com\/out\)/);
  const { table } = tableOf(resolved);
  assert.equal(table.rows.length, 1);
  assert.match(table.rows[0]?.[0] ?? "", /example\.com\/in/);
  assert.equal(table.rows[0]?.[1], "");

  const noted = [
    "See [^1].",
    "",
    "| a | b |",
    "| --- | --- |",
    "[^1]: inside",
    "",
    "[^1]: outside",
  ].join("\n");
  const extracted = extractFootnotes(noted, true);
  assert.equal(extracted.notes.length, 1);
  assert.match(extracted.notes[0]?.text ?? "", /outside/);
  assert.match(extracted.text, /\[\^1\]: inside/);
  assert.deepEqual(tableOf(extracted.text).table.rows, [["[^1]: inside", ""]]);
});

test("desktop and iOS continue a pipe-less row, and OpenAPI stays 0.18.0", () => {
  assert.match(src, /v1\.66/);
  assert.match(src, /export function markdownTableEnd/);
  assert.match(src, /splitRow\(line, true\)/);
  assert.match(src, /if \(pipes === 0\)/);
  assert.match(src, /function interruptsTable/);
  assert.match(swift, /v1\.66/);
  assert.match(swift, /static func lineEnd/);
  assert.match(swift, /splitRow\(line, pipeLess: true\)/);
  assert.match(swift, /if pipes == 0/);
  assert.match(swift, /private static func interruptsTable/);
  assert.match(reference, /markdownTableEnd/);
  assert.match(referenceSwift, /MarkdownTable\.lineEnd/);
  assert.match(footnote, /markdownTableEnd/);
  assert.match(footnoteSwift, /MarkdownTable\.lineEnd/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.66 /);
  assert.match(spec, /## 166\. v1\.66/);
  assert.match(spec, /GFM pipe-less table rows continue the table in completed assistant replies/);
  assert.match(pkg, /markdownTableRow\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_table_row\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
});
