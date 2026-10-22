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
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import {
  DUNDER_WORD_LIST,
  intrawordUnderscoreAnimates,
  protectIntrawordUnderscores,
} from "./markdownUnderscore.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownUnderscore.ts"), "utf8");
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownUnderscore.swift"),
  "utf8",
);
const escapeSwift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownEscape.swift"),
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
  "v1.67 CommonMark intraword underscores stay literal in completed assistant replies";

function render(source: string, completed = true): string {
  const prepared = protectMarkdownEscapes(source, completed);
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkStrikethrough],
      children: prepared,
    }),
  );
  return restoreMarkdownEscapes(html);
}

test("intraword underscores stay literal and boundary emphasis still renders", () => {
  for (const word of [
    "snake_case_name",
    "foo_bar_baz",
    "foo__bar__baz",
    "foo__init__bar",
    "5_6_78",
    "a_b",
    "pre_emphasis_post",
  ]) {
    assert.equal(protectIntrawordUnderscores(word), word);
    assert.equal(render(word), `<p>${word}</p>`);
    assert.doesNotMatch(render(word), /<em>|<strong>/);
  }
  assert.match(render("_emphasis_"), /<em>emphasis<\/em>/);
  assert.doesNotMatch(render("_emphasis_"), /<em>_emphasis_<\/em>/);
  assert.equal(protectIntrawordUnderscores("__strong__"), "__strong__");
  assert.match(render("__strong__"), /<strong>strong<\/strong>/);
  assert.match(render("foo*bar*baz"), /foo<em>bar<\/em>baz/);
  assert.match(render("*foo*bar"), /<em>foo<\/em>bar/);
  assert.equal(protectIntrawordUnderscores("___bold italic___"), "___bold italic___");
  const triple = render("___bold italic___");
  assert.match(triple, /<em>/);
  assert.match(triple, /<strong>/);
  assert.match(triple, /bold italic/);
});

test("python dunder identifiers stay literal", () => {
  for (const sample of [
    "__init__",
    "__name__",
    "__main__",
    "__file__",
    "call __init__ now",
    "obj.__init__(self)",
    "def __init__(self):",
    "__init__.py",
    "__init_subclass__",
    "__foo_bar__",
    "use __init__ and __strong__",
  ]) {
    const stashed = protectIntrawordUnderscores(sample);
    assert.notEqual(stashed, sample);
    assert.match(stashed, /§§SBE(?:[0-9A-F]{6})+§§/);
    assert.equal(restoreMarkdownEscapes(stashed), sample);
    const html = render(sample);
    assert.doesNotMatch(html, /§§SBE/);
    assert.match(html, /__init__|__name__|__main__|__file__|__init_subclass__|__foo_bar__/);
  }
  const mixed = render("use __init__ and __strong__");
  assert.match(mixed, /__init__/);
  assert.match(mixed, /<strong>strong<\/strong>/);
  assert.doesNotMatch(mixed, /<strong>init<\/strong>/);
  const explicit = render("*__init__*");
  assert.match(explicit, /<em>__init__<\/em>/);
  assert.doesNotMatch(explicit, /<strong>init<\/strong>/);
});

test("code, links, urls, and streaming stay source", () => {
  const fence = "```\n__init__\nsnake_case_name\n```";
  assert.equal(protectIntrawordUnderscores(fence), fence);
  assert.doesNotMatch(protectMarkdownEscapes(fence), /§§SBE/);
  assert.match(render(fence), /__init__/);
  assert.match(render(fence), /snake_case_name/);

  const inline = "see `__init__` and `snake_case_name`";
  assert.equal(protectIntrawordUnderscores(inline), inline);
  assert.doesNotMatch(protectMarkdownEscapes(inline), /§§SBE/);
  assert.match(render(inline), /<code>__init__<\/code>/);
  assert.match(render(inline), /<code>snake_case_name<\/code>/);

  const indented = "\n    __init__\n";
  assert.equal(protectIntrawordUnderscores(indented), indented);

  const url = "https://example.com/__init__.py";
  assert.equal(protectIntrawordUnderscores(url), url);
  const www = "www.example.com/__init__";
  assert.equal(protectIntrawordUnderscores(www), www);
  const dest = "[docs](https://example.com/__init__)";
  assert.equal(protectIntrawordUnderscores(dest), dest);
  const mail = "dev__init__@example.com";
  assert.equal(protectIntrawordUnderscores(mail), mail);

  const mailDunder = "write __init__@example.com today";
  assert.equal(protectIntrawordUnderscores(mailDunder), mailDunder);

  assert.equal(protectIntrawordUnderscores("__init__", false), "__init__");
  assert.equal(protectMarkdownEscapes("__init__", false), "__init__");
  assert.equal(protectMarkdownEscapes("snake_case_name", false), "snake_case_name");
});

test("both platforms share the name list and the call site stays put", () => {
  const words = DUNDER_WORD_LIST.split(" ");
  assert.deepEqual([...words].sort(), words);
  assert.ok(words.includes("init"));
  assert.ok(words.includes("init_subclass") === false);
  assert.ok(!words.includes("strong"));
  const swiftList = swift.match(/static let wordList =\n\s+"([^"]+)"/);
  assert.ok(swiftList);
  assert.equal(swiftList[1], DUNDER_WORD_LIST);
  assert.match(escapeSrc, /protectIntrawordUnderscores\(text, true\)/);
  assert.match(escapeSwift, /if !completed \|\| text.isEmpty \{ return text \}/);
  assert.match(escapeSwift, /MarkdownUnderscore\.protect\(text, completed: true\)/);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 4);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /protectIntrawordUnderscores\(reply\.content/);
  assert.doesNotMatch(app, /protectMarkdownEscapes\(reply\.content/);
  assert.equal(intrawordUnderscoreAnimates(false), false);
  assert.equal(intrawordUnderscoreAnimates(true), false);
  assert.match(src, /markdown source/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v1.67 "));
  assert.match(spec, /## 167\. v1\.67/);
  assert.match(ci, /test_ios_markdown_underscore\.py/);
  assert.match(pkg, /markdownUnderscore\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
