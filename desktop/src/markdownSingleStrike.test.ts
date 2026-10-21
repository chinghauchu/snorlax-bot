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
import { applyHardLineBreaks, HARD_BREAK_TOKEN, remarkHardBreaks } from "./markdownHardBreak.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownSingleStrike.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSingleStrike.swift"),
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

const PHRASE = "v1.50 GFM single-tilde strikethrough in completed assistant replies";

function render(text: string, completed = true): string {
  const source = completed ? promoteSingleTilde(text, true) : text;
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      children: source,
    }),
  );
}

test("~text~ strikes and ~~text~~ still strikes", () => {
  assert.equal(promoteSingleTilde("say ~gone~ please", true), "say ~~gone~~ please");
  assert.match(render("say ~gone~ please"), /<del class="md-strike">gone<\/del>/);
  assert.doesNotMatch(render("say ~gone~ please"), /~/);
  assert.equal(promoteSingleTilde("~~gone~~", true), "~~gone~~");
  assert.match(render("~~gone~~"), /<del class="md-strike">gone<\/del>/);
  assert.match(render("~**bold**~"), /<del class="md-strike"><strong>bold<\/strong><\/del>/);
  assert.match(render("*~x~*"), /<em><del class="md-strike">x<\/del><\/em>/);
  assert.match(render("**~x~**"), /<strong><del class="md-strike">x<\/del><\/strong>/);
  assert.equal(
    promoteSingleTilde("~a~ and ~~b~~ and ~c~", true),
    "~~a~~ and ~~b~~ and ~~c~~",
  );
  assert.match(render("~a~ and ~~b~~"), /<del class="md-strike">a<\/del>/);
  assert.match(render("~a~ and ~~b~~"), /<del class="md-strike">b<\/del>/);
});

test("unclosed, spaced, triple, and mixed tildes stay literal", () => {
  assert.equal(promoteSingleTilde("~gone", true), "~gone");
  assert.equal(promoteSingleTilde("~ foo ~", true), "~ foo ~");
  assert.equal(promoteSingleTilde("~foo ~", true), "~foo ~");
  assert.equal(promoteSingleTilde("~foo\nbar~", true), "~foo\nbar~");
  assert.equal(promoteSingleTilde("~~~gone~~~", true), "~~~gone~~~");
  assert.equal(promoteSingleTilde("~foo~~bar~", true), "~foo~~bar~");
  assert.equal(promoteSingleTilde("~gone~~", true), "~gone~~");
  assert.equal(promoteSingleTilde("~~gone~", true), "~~gone~");
  assert.doesNotMatch(render("~ foo ~"), /<del/);
  assert.match(render("~ foo ~"), /~ foo ~/);
  const broken = applyHardLineBreaks("~foo  \nbar~", true);
  assert.ok(broken.includes(HARD_BREAK_TOKEN));
  assert.equal(promoteSingleTilde(broken, true), broken);
  assert.doesNotMatch(render(broken), /~~/);
});

test("code, math, urls, link destinations, and escapes stay literal", () => {
  assert.equal(promoteSingleTilde("see `~nope~` and ~yes~", true), "see `~nope~` and ~~yes~~");
  const fence = "```\n~nope~\n```\n~yes~";
  assert.equal(promoteSingleTilde(fence, true), "```\n~nope~\n```\n~~yes~~");
  const tildeFence = "~~~\n~nope~\n~~~\n";
  assert.equal(promoteSingleTilde(tildeFence, true), tildeFence);
  const indented = "para\n\n    ~nope~\n";
  assert.equal(promoteSingleTilde(indented, true), indented);
  assert.equal(promoteSingleTilde("\\( ~nope~ \\)", true), "\\( ~nope~ \\)");
  assert.equal(promoteSingleTilde("$$\n~nope~\n$$\n~yes~", true), "$$\n~nope~\n$$\n~~yes~~");
  const url = "see https://example.com/~user~ now";
  assert.equal(promoteSingleTilde(url, true), url);
  const www = "see www.example.com/~user~ now";
  assert.equal(promoteSingleTilde(www, true), www);
  const dest = "[docs](https://example.com/~user~)";
  assert.equal(promoteSingleTilde(dest, true), dest);
  assert.equal(
    promoteSingleTilde("[~docs~](https://example.com)", true),
    "[~~docs~~](https://example.com)",
  );
  assert.match(render("[~docs~](https://example.com)"), /<del class="md-strike">docs<\/del>/);
  assert.match(render("[~docs~](https://example.com)"), /href="https:\/\/example.com"/);
  const escaped = protectMarkdownEscapes("\\~not~", true);
  assert.equal(promoteSingleTilde(escaped, true), escaped);
  assert.doesNotMatch(render(escaped), /<del/);
  assert.match(restoreMarkdownEscapes(render(escaped)), /~not~/);
  assert.equal(promoteSingleTilde("\\~not~", true), "\\~not~");
  const codeHtml = render("say `~nope~` and ~yes~");
  assert.match(codeHtml, /<code>~nope~<\/code>/);
  assert.match(codeHtml, /<del class="md-strike">yes<\/del>/);
});

test("streaming stays plain and copy keeps markdown source", () => {
  const raw = "say ~gone~ and ~~also~~";
  assert.equal(promoteSingleTilde(raw, false), raw);
  assert.match(render(raw, false), /~gone~/);
  assert.doesNotMatch(render(raw, false), /<del/);
  assert.equal(body.split("promoteSingleTilde(").length, 4);
  assert.match(
    body,
    /promoteSingleTilde\(\s*applyHardLineBreaks\(\s*protectMarkdownEscapes\(mathText, completed\),\s*completed,\s*\),\s*completed,\s*\)/,
  );
  assert.match(body, /remarkPlugins=\{completed \? \[remarkHardBreaks, remarkStrikethrough\] : \[\]\}/);
  assert.match(markdown, /MarkdownSingleStrike\.promote\(\s*MarkdownHardBreak\.apply\(escaped, completed: completed\),\s*completed: completed\s*\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /promoteSingleTilde\(reply\.content/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(src, /markdown source/);
  assert.match(swift, /static func promote\(_ text: String, completed: Bool\)/);
  assert.match(swift, /if !completed \|\| text.isEmpty \|\| !text.contains\("~"\)/);
  assert.match(swift, /markdown source/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.match(swift, /isSingleOpener/);
  assert.match(swift, /findCloser/);
  assert.match(swift, /tildeInUrl/);
  assert.match(swift, /inLinkDestination/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.50 /);
  assert.match(spec, /## 150\. v1\.50/);
  assert.match(spec, /single-tilde strikethrough in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_single_strike\.py/);
  assert.match(pkg, /markdownSingleStrike\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
