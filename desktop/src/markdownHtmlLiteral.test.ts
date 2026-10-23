// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { restoreMarkdownEscapes, protectMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import {
  htmlLiteralAnimates,
  literalizeRawHtml,
} from "./markdownHtmlLiteral.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownHtmlLiteral.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownHtmlLiteral.swift"),
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

const PHRASE = "v1.60 raw HTML stays literal text in completed assistant replies";

const TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "blockquote",
  "em",
  "strong",
  "del",
  "a",
  "code",
  "pre",
  "td",
  "th",
  "span",
];

function restoreTree(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") return restoreMarkdownEscapes(child);
    if (!React.isValidElement(child)) return child;
    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;
    return React.cloneElement(child, {}, restoreTree(props.children));
  });
}

function omitNode(tag: string) {
  return (props: Record<string, unknown>) => {
    const { children, node: _node, ...rest } = props;
    return React.createElement(tag, rest, restoreTree(children as ReactNode));
  };
}

const components = Object.fromEntries(TAGS.map((tag) => [tag, omitNode(tag)]));

function render(source: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      components,
      children: source,
    }),
  );
}

function pipeline(text: string, completed = true): string {
  return promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(text, completed), completed),
      completed,
    ),
    completed,
  );
}

function shown(text: string, completed = true): string {
  return render(pipeline(text, completed));
}

test("inline tags round-trip and type 1–6 blocks stay raw", () => {
  const unchanged = [
    "foo\n<div>\n9. not\n</div>\n9. yes",
    "foo\n<!-- c -->\n9. bar",
    "foo\n<script>\n9. not\n\n9. still\n</script>\n9. yes",
    "foo\n<style>\n9. not\n</style>\n9. yes",
    "```\n<br>\n```",
    "para\n\n    <br>\n",
    "`<br>`",
    "<https://example.com>",
    "<foo@bar>",
    "[a](http://ex.com/<foo>)",
    "[a](<http://ex.com>)",
    "a < b",
    "a<b",
    "<3>",
    "<__>",
    "<33>",
    "< a>",
    '<a h*#ref="hi">',
    '</a href="foo">',
    "<!doctype html>",
    "<?php ok ?>",
    "<![CDATA[a]]>",
    "<!A>",
    "<!DOCTYPE html>",
    "## Title ##",
    "# Title #####",
    "# C#",
    "# foo#",
    "***bold italic***",
    "___bold italic___",
    "Title\n===",
    "Title\n---",
    "foo\n\n---",
    "",
    "no angles",
  ];
  for (const sample of unchanged) {
    assert.equal(literalizeRawHtml(sample), sample, sample);
  }

  const stashed = [
    "x<y>",
    '<span class="x">t</span>',
    "foo <!-- c --> bar",
    "foo <!-- **x** --> bar",
    "foo <!--> foo -->",
    "<not a>",
    "see <!DOCTYPE html> now",
    "see <?php ok ?> now",
    "see <![CDATA[a]]> now",
    "see <!A> now",
    'see <span class="*not*">**y**</span>',
    "<br class=\"a>b\">",
  ];
  for (const sample of stashed) {
    const next = literalizeRawHtml(sample);
    assert.notEqual(next, sample, sample);
    assert.equal(next.includes("<"), false, sample);
    assert.match(next, /§§SBE/);
    assert.equal(restoreMarkdownEscapes(next), sample);
  }
  assert.equal(literalizeRawHtml("use <br> and <3>").includes("<3>"), true);
  assert.equal(literalizeRawHtml('<span class="x">t</span>').split("§§SBE").length, 3);
  const streaming = "use <br> now";
  assert.equal(literalizeRawHtml(streaming, false), streaming);
  assert.equal(htmlLiteralAnimates(false), false);
  assert.equal(htmlLiteralAnimates(true), false);
});

test("completed replies show the same characters desktop already showed", () => {
  const same = [
    "x<y>",
    '<span class="x">t</span>',
    "foo <!-- c --> bar",
    "foo <!-- **x** --> bar",
    "foo <!--> foo -->",
    'see <span class="*not*">**y**</span>',
    "foo\n<div>\n9. not\n</div>\n9. yes",
    "foo\n<!-- c -->\n9. bar",
    "foo\n<script>\n9. not\n\n9. still\n</script>\n9. yes",
    "foo\n<style>\n9. not\n</style>\n9. yes",
    "## Title ##",
    "# Title #####",
    "# C#",
    "# foo#",
    "# foo \\#",
    "### foo \\###",
    "***bold italic***",
    "___bold italic___",
    "snake_case_name",
    "Title\n===",
    "Title\n---",
    "foo\n\n---",
    "<https://example.com>",
    "<foo@bar>",
    "[a](http://ex.com/<foo>)",
    "[a](<http://ex.com>)",
    "```\n<br>\n```",
    "`<br>`",
    "para\n\n    <br>\n",
    "<3> hearts",
    "a < b and a<b",
    "see <?php ok ?> now",
    "see <![CDATA[a]]> now",
    "see <!A> now",
    "see <!DOCTYPE html> now",
    "<!DOCTYPE html>",
    "<?php ok ?>",
  ];
  for (const sample of same) {
    assert.equal(shown(sample), render(sample), sample);
  }
  assert.match(shown("foo\n\n<br>\n\nbar"), /<p>foo<\/p>/);
  assert.match(shown("foo\n\n<br>\n\nbar"), /<p>bar<\/p>/);
  assert.doesNotMatch(shown("```\n<br>\n```"), /SBE/);
  assert.doesNotMatch(shown("`<br>`"), /SBE/);
  assert.match(shown("[a](http://ex.com/<foo>)"), /href="http:\/\/ex.com\/%3Cfoo%3E"/);
  assert.match(shown("[a](<http://ex.com>)"), /href="http:\/\/ex.com"/);
  assert.match(shown("<https://example.com>"), /href="https:\/\/example.com"/);
  assert.doesNotMatch(shown('see <span class="*not*">x</span>'), /<em>/);
  assert.match(shown('see <span class="x">**y**</span>'), /<strong>y<\/strong>/);
  assert.equal(pipeline("use <br>", false), "use <br>");
});

test("streaming stays plain and copy keeps markdown source", () => {
  assert.match(src, /v1\.60/);
  assert.match(src, /export function literalizeRawHtml/);
  assert.match(src, /export function htmlLiteralAnimates/);
  assert.match(src, /markdown source/);
  assert.match(src, /if \(!completed \|\| !text \|\| !text\.includes\("<"\)\) return text/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane/);
  assert.equal(body.split("literalizeRawHtml(").length, 4);
  assert.equal(body.split("protectMarkdownEscapes(mathText, completed)").length, 4);
  const protectAt = body.indexOf("protectMarkdownEscapes(mathText, completed)");
  const literalAt = body.indexOf("literalizeRawHtml(");
  const hardAt = body.indexOf("applyHardLineBreaks(");
  assert.ok(hardAt >= 0 && literalAt > hardAt && protectAt > literalAt);
  assert.match(swift, /v1\.60/);
  assert.match(swift, /static func literalize/);
  assert.match(swift, /static func animation/);
  assert.match(swift, /return nil/);
  assert.match(swift, /MarkdownEscape\.opaqueSpans/);
  assert.match(swift, /MarkdownList\.htmlBlockInterrupts/);
  assert.match(swift, /MarkdownList\.htmlUntilBlockEnd/);
  assert.match(swift, /§§SBE/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(markdown, /MarkdownHtmlLiteral\.literalize\(/);
  assert.match(markdown, /MarkdownEscape\.protect\(src, completed: completed\)/);
  assert.match(markdown, /MarkdownHardBreak\.apply\(escaped, completed: completed\)/);
  const escapeAt = markdown.indexOf("MarkdownEscape.protect(src, completed: completed)");
  const hardCall = markdown.indexOf("MarkdownHardBreak.apply(escaped, completed: completed)");
  assert.ok(escapeAt >= 0 && hardCall > escapeAt);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /literalizeRawHtml\(reply\.content/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.60 /);
  assert.match(spec, /## 160\. v1\.60/);
  assert.match(spec, /raw HTML stays literal text in completed assistant replies/);
  assert.match(ci, /test_ios_markdown_html_literal\.py/);
  assert.match(pkg, /markdownHtmlLiteral\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
