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
import { codeSpanRanges, offsetInsideCodeSpan } from "./markdownCodeSpan.ts";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { splitIndentedCode } from "./markdownIndentedCode.ts";
import { stabilizeMarkdown } from "./markdown.ts";
import { extractMath, fenceInfoAllowsOpen, fenceRanges } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownCodeSpan.ts"), "utf8");
const math = readFileSync(join(here, "math.ts"), "utf8");
const bubbles = readFileSync(join(here, "assistantBubbles.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownCodeSpan.swift"),
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
  "v1.52 CommonMark multi-backtick code spans in completed assistant replies";

function html(text: string): string {
  const source = applyHardLineBreaks(stabilizeMarkdown(text), true);
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      children: source,
    }),
  );
}

test("a run of N backticks closes only on another run of N", () => {
  const inner = html("Use ``code with ` inside`` please");
  assert.match(inner, /<code>code with ` inside<\/code>/);
  assert.doesNotMatch(inner, /<pre>/);

  const spaced = html("Use `` code with ` inside `` please");
  assert.match(spaced, /<code>code with ` inside<\/code>/);

  const only = html("`` ` ``");
  assert.match(only, /<code>`<\/code>/);
  assert.doesNotMatch(only, /<pre>/);

  const shorter = html("`foo``bar`");
  assert.match(shorter, /<code>foo``bar<\/code>/);
  const longer = html("``foo`bar``");
  assert.match(longer, /<code>foo`bar<\/code>/);

  const single = html("See `code` and **bold**");
  assert.match(single, /<code>code<\/code>/);
  assert.match(single, /<strong>bold<\/strong>/);
});

test("three backticks with a backtick in the info string stay inline code", () => {
  const line = "``` `` ```";
  assert.equal(fenceInfoAllowsOpen("```", " `` ```"), false);
  assert.equal(fenceRanges(line).length, 0);
  assert.equal(stabilizeMarkdown(line), line);
  assert.equal(codeSpanRanges(line).length, 1);
  const rendered = html(line);
  assert.match(rendered, /<code>``<\/code>/);
  assert.doesNotMatch(rendered, /<pre>/);

  const followed = "```foo```\nhello **bold**";
  assert.equal(stabilizeMarkdown(followed), followed);
  const both = html(followed);
  assert.match(both, /<code>foo<\/code>/);
  assert.match(both, /<strong>bold<\/strong>/);
  assert.doesNotMatch(both, /<pre>/);

  const fence = "```js\nconst x = ``a``\n```";
  assert.equal(stabilizeMarkdown(fence), fence);
  assert.equal(fenceRanges(fence).length, 1);
  const block = html(fence);
  assert.match(block, /<pre><code class="language-js">/);
  assert.match(block, /``a``/);
});

test("a line ending inside a code span stays one chip; a blank line splits", () => {
  const span = "``foo\nbar``";
  assert.equal(offsetInsideCodeSpan(span, span.indexOf("\n")), true);
  assert.deepEqual(splitAssistantBubbles(span, true), [span]);
  assert.match(html(span), /<code>foo bar<\/code>/);
  const broken = "``foo\n\nbar``";
  assert.equal(offsetInsideCodeSpan(broken, broken.indexOf("\n\n") + 1), false);
  assert.deepEqual(splitAssistantBubbles(broken, true), ["``foo", "bar``"]);
  assert.match(html(broken), /``foo/);
  assert.doesNotMatch(html(broken), /<code>foo/);
  assert.deepEqual(splitAssistantBubbles("Hello\n\nThere", true), ["Hello", "There"]);
  assert.deepEqual(splitAssistantBubbles("``` `` ```\n\nNext", true), [
    "``` `` ```",
    "Next",
  ]);
  const fence = "```js\n\ncode\n```\n\nout";
  assert.deepEqual(splitAssistantBubbles(fence, true), ["```js\n\ncode\n```", "out"]);
});

test("an unmatched opener stays literal and does not swallow the next span", () => {
  const source = "``unclosed\nSee `\\(x\\)` please";
  assert.equal(extractMath(source).slots.length, 0);
  const rendered = html(source);
  assert.match(rendered, /``unclosed/);
  assert.match(rendered, /<code>\\\(x\\\)<\/code>/);
  const live = "``foo\n\nbar``";
  assert.deepEqual(splitAssistantBubbles(live, false), [live]);
  assert.equal(stabilizeMarkdown("```\nok\n"), "```\nok\n```");
});

test("indented code and a real fence keep their backticks", () => {
  const indented = splitIndentedCode("\n    ``foo``\n", true);
  const code = indented.find((part) => part.type === "code");
  assert.ok(code && code.type === "code");
  assert.equal(code.source, "``foo``");
  assert.equal(fenceInfoAllowsOpen("~~~", " `` "), true);
  assert.equal(fenceInfoAllowsOpen("```", "js"), true);
});

test("desktop and iOS share the rule and do not grow the protocol", () => {
  assert.match(src, /export function codeSpanRanges/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownCodeSpan.swift`/);
  assert.match(math, /export function fenceInfoAllowsOpen/);
  assert.match(math, /if \(!matched\) i \+= n/);
  assert.match(bubbles, /insideCodeSpan/);
  assert.match(bubbles, /fenceInfoAllowsOpen/);
  assert.match(body, /stabilizeMarkdown/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /codeSpanRanges\(reply/);
  assert.match(swift, /static func fenceInfoAllowsOpen/);
  assert.match(swift, /static func spans\(in text: String\)/);
  assert.match(swift, /if !matched \{ index \+= length \}/);
  assert.match(swift, /Keep in lockstep with `desktop\/src\/markdownCodeSpan.ts`/);
  assert.match(markdown, /MarkdownCodeSpan\.spans\(in: joined\)/);
  assert.match(markdown, /MarkdownCodeSpan\.fenceInfoAllowsOpen/);
  assert.match(markdown, /MarkdownCodeSpan\.contains\(lineStarts\[index\], codeSpans\)/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /computerPane\.ts/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.52 /);
  assert.match(spec, /## 152\. v1\.52/);
  assert.match(spec, /multi-backtick code spans in completed assistant replies/i);
  assert.match(pkg, /markdownCodeSpan\.test\.ts/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_code_span\.py/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
});
