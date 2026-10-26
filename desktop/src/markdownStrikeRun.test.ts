// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { splitWebUrls } from "./linkify.ts";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const strikeSrc = readFileSync(join(here, "markdownBreak.ts"), "utf8");
const singleSrc = readFileSync(join(here, "markdownSingleStrike.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownSingleStrike.swift"),
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

const PHRASE = "v1.70 GFM strikethrough tilde runs in completed assistant replies";

function render(text: string, completed = true): string {
  const source = completed
    ? promoteSingleTilde(applyHardLineBreaks(text, true), true)
    : text;
  return restoreMarkdownEscapes(
    renderToStaticMarkup(
      React.createElement(Markdown, {
        remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
        children: source,
      }),
    ),
  );
}

function struck(html: string): string | null {
  const match = /<del class="md-strike">([\s\S]*?)<\/del>/.exec(html);
  return match ? match[1]! : null;
}

test("a delimiter is a run of exactly two tildes", () => {
  const triple = render("x ~~~foo~~~ y");
  assert.doesNotMatch(triple, /<del/);
  assert.match(triple, /~~~foo~~~/);

  const inner = render("~~a~~~b~~");
  assert.equal(struck(inner), "a~~~b");
  assert.equal(struck(render("~~a~~~~b~~")), "a~~~~b");
  assert.equal(struck(render("~~a~~~~~b~~")), "a~~~~~b");

  const open = render("see ~~foo~~~ please");
  assert.doesNotMatch(open, /<del/);
  assert.match(open, /~~foo~~~/);

  assert.equal(struck(render("~~foo bar~~")), "foo bar");
  assert.equal(struck(render("~~foo~~")), "foo");
  assert.equal(struck(render("foo~~bar~~baz")), "bar");
  assert.equal(struck(render("~gone~")), "gone");
  assert.doesNotMatch(render("~gone~"), /~/);
});

test("whitespace flanking stays literal and a soft newline strikes", () => {
  for (const sample of ["~~ foo ~~", "~~foo ~~", "~~ foo~~", "a ~~ b ~~ c"]) {
    const html = render(sample);
    assert.doesNotMatch(html, /<del/, sample);
    assert.match(html, /~~/, sample);
  }
  const soft = render("~~foo\nbar~~");
  assert.match(soft, /<del class="md-strike">foo[\s\S]*bar<\/del>/);
  assert.doesNotMatch(soft, /~~/);
  const broken = render("~~foo  \nbar~~");
  assert.doesNotMatch(broken, /<del/);
  assert.match(broken, /~~foo<br\s*\/?>\s*bar~~/);
  const afterBreak = render("~~foo\n~~");
  assert.doesNotMatch(afterBreak, /<del/);
});

test("nested marks and code stay put, and a length-1 pair may hold a longer run", () => {
  assert.match(render("~~**bold**~~"), /<del class="md-strike"><strong>bold<\/strong><\/del>/);
  assert.match(render("**~~x~~**"), /<strong><del class="md-strike">x<\/del><\/strong>/);
  const code = render("say `~~nope~~` and ~~yes~~");
  assert.match(code, /<code>~~nope~~<\/code>/);
  assert.match(code, /<del class="md-strike">yes<\/del>/);
  const fence = render("~~~\n~~nope~~\n~~~\n\n~~yes~~");
  assert.match(fence, /<pre><code>~~nope~~\n<\/code><\/pre>/);
  assert.match(fence, /<del class="md-strike">yes<\/del>/);
  assert.equal(struck(render("~foo~~bar~")), "foo~~bar");
  assert.equal(struck(render("~~foo~bar~~")), "foo~bar");
  assert.equal(struck(render("~~foo.~~")), "foo.");
});

test("tildes inside an autolink are not a strikethrough pair", () => {
  const url = "see https://example.com/~~foo~~ now";
  const html = render(url);
  assert.doesNotMatch(html, /<del/);
  assert.match(html, /https:\/\/example.com\/~~foo~~/);
  const pieces = splitWebUrls(url, { emails: true });
  assert.deepEqual(
    pieces.filter((piece) => piece.type === "link").map((piece) => piece.value),
    ["https://example.com/~~foo"],
  );
  const wrapped = render("see ~~https://example.com~~ now");
  assert.match(wrapped, /<del class="md-strike">https:\/\/example.com<\/del>/);
});

test("streaming stays plain and copy keeps markdown source", () => {
  const raw = "x ~~~foo~~~ y ~~bar~~";
  assert.equal(promoteSingleTilde(raw, false), raw);
  assert.match(render(raw, false), /~~~foo~~~/);
  assert.match(render(raw, false), /~~bar~~/);
  assert.doesNotMatch(render(raw, false), /<del/);
  assert.equal(body.split("promoteSingleTilde(").length, 4);
  assert.match(body, /remarkPlugins=\{completed \? \[remarkHardBreaks, remarkStrikethrough\] : \[\]\}/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(singleSrc, /copyText/);
  assert.doesNotMatch(singleSrc, /clipboard/);
  assert.doesNotMatch(strikeSrc, /\/v1\//);
  assert.match(strikeSrc, /end - i === 2/);
  assert.match(strikeSrc, /runInLink/);
  assert.doesNotMatch(singleSrc, /shieldStrayTildes/);
  assert.doesNotMatch(swift, /shieldStrayTildes/);
  assert.match(swift, /v1\.84 retires/);
  assert.match(swift, /if !completed \|\| text.isEmpty \|\| !text.contains\("~"\)/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.70 /);
  assert.match(spec, /## 170\. v1\.70/);
  assert.match(spec, /tilde runs in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_strike_run\.py/);
  assert.match(pkg, /markdownStrikeRun\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /withAnimation/);
});
