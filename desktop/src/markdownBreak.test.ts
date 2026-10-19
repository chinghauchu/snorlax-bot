// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import {
  breakAnimates,
  remarkStrikethrough,
  splitThematicBreaks,
  thematicBreakMarker,
} from "./markdownBreak.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";

const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const src = readFileSync(join(here, "markdownBreak.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownBreak.swift"),
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
  "v1.33 headings, strikethrough, and thematic breaks in completed assistant replies";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function render(text: string, strike = true): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: strike ? [remarkStrikethrough] : [],
      children: text,
    }),
  );
}

test("desktop ATX headings already render as h1 through h6", () => {
  const html = render("# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6");
  assert.match(html, /<h1>H1<\/h1>/);
  assert.match(html, /<h2>H2<\/h2>/);
  assert.match(html, /<h3>H3<\/h3>/);
  assert.match(html, /<h4>H4<\/h4>/);
  assert.match(html, /<h5>H5<\/h5>/);
  assert.match(html, /<h6>H6<\/h6>/);
  assert.doesNotMatch(html, /#/);
  assert.match(block(".assistant-md h1"), /font-size:\s*16px/);
  assert.match(block(".assistant-md h1"), /font-weight:\s*600/);
  assert.match(block(".assistant-md h2"), /font-size:\s*14px/);
  assert.match(block(".assistant-md h2"), /font-weight:\s*600/);
  assert.match(body, /h1: \(\{ children \}\) => <h1>/);
  assert.match(body, /h6: \(\{ children \}\) => <h6>/);
});

test("GFM strikethrough renders as del and leaves code alone", () => {
  const html = render("say ~~gone~~ please and ~~**bold**~~ and **~~x~~** and `~~nope~~`");
  assert.match(html, /<del class="md-strike">gone<\/del>/);
  assert.match(html, /<del class="md-strike"><strong>bold<\/strong><\/del>/);
  assert.match(html, /<strong><del class="md-strike">x<\/del><\/strong>/);
  assert.match(html, /<code>~~nope~~<\/code>/);
  assert.doesNotMatch(html.replace(/<code>~~nope~~<\/code>/, ""), /~~/);
  const plain = render("say ~~gone~~", false);
  assert.match(plain, /~~gone~~/);
  assert.doesNotMatch(plain, /<del/);
});

test("own-line rules split out; setext underlines stay headings", () => {
  assert.equal(thematicBreakMarker("---"), "-");
  assert.equal(thematicBreakMarker("***"), "*");
  assert.equal(thematicBreakMarker("___"), "_");
  assert.equal(thematicBreakMarker("   ---"), "-");
  assert.equal(thematicBreakMarker("* * *"), "*");
  assert.equal(thematicBreakMarker("- - -"), "-");
  assert.equal(thematicBreakMarker("    ---"), null);
  assert.equal(thematicBreakMarker("---text"), null);
  assert.equal(thematicBreakMarker("==="), null);

  const rules = splitThematicBreaks("before\n\n---\n\n***\n\n___\n\nafter", true);
  assert.deepEqual(
    rules.map((part) => part.type),
    ["markdown", "rule", "rule", "rule", "markdown"],
  );

  const setext = splitThematicBreaks("Title\n---\n", true);
  assert.equal(setext.length, 1);
  assert.equal(setext[0]?.type, "markdown");
  if (setext[0]?.type === "markdown") {
    assert.match(render(setext[0].text), /<h2>Title<\/h2>/);
    assert.doesNotMatch(render(setext[0].text), /<hr/);
  }
  const multi = splitThematicBreaks("Foo\nBar\n---\n", true);
  assert.equal(multi.length, 1);
  assert.match(render("Foo\n===\n"), /<h1>Foo<\/h1>/);

  const afterBlank = splitThematicBreaks("Foo\n\n---\n", true);
  assert.equal(afterBlank[1]?.type, "rule");
  const afterAtx = splitThematicBreaks("# Title\n---\n", true);
  assert.equal(afterAtx[0]?.type, "markdown");
  assert.equal(afterAtx[1]?.type, "rule");
  const afterList = splitThematicBreaks("- item\n  continued\n---\n", true);
  assert.equal(afterList.at(-1)?.type, "rule");
  assert.equal(breakAnimates(false), false);
  assert.equal(breakAnimates(true), false);
});

test("fences, math, and streaming keep rules and tildes", () => {
  const fence = "```\n# not\n~~nope~~\n---\n```";
  const fenced = splitThematicBreaks(fence, true);
  assert.equal(fenced.length, 1);
  assert.equal(fenced[0]?.type, "markdown");
  const fenceHtml = render(fence);
  assert.match(fenceHtml, /~~nope~~/);
  assert.match(fenceHtml, /---/);
  assert.doesNotMatch(fenceHtml, /<hr/);
  assert.doesNotMatch(fenceHtml, /<del/);

  const math = "$$\n---\n~~gone~~\n$$";
  assert.equal(splitThematicBreaks(math, true)[0]?.type, "markdown");

  const live = splitThematicBreaks("---\n~~gone~~", false);
  assert.equal(live.length, 1);
  assert.equal(live[0]?.type, "markdown");
  if (live[0]?.type === "markdown") {
    assert.equal(live[0].text, "---\n~~gone~~");
  }

  const quoted = splitQuoteAndTasks("> ---\n> Hello\n> ---", true);
  assert.equal(quoted[0]?.type, "quote");
  if (quoted[0]?.type === "quote") {
    const inner = splitThematicBreaks(quoted[0].text, true);
    assert.equal(inner[0]?.type, "rule");
    assert.equal(inner[1]?.type, "markdown");
  }
  const lone = splitQuoteAndTasks("> ---", true);
  if (lone[0]?.type === "quote") {
    assert.equal(splitThematicBreaks(lone[0].text, true)[0]?.type, "rule");
  }
});

test("completed replies wire the rule and the strike; copy stays source", () => {
  assert.match(body, /splitThematicBreaks\(text, completed\)/);
  assert.match(body, /className="md-rule"/);
  assert.match(body, /className="md-strike"/);
  assert.match(body, /remarkPlugins=\{completed \? \[remarkStrikethrough\] : \[\]\}/);
  assert.match(body, /breakAnimates\(false\)/);
  assert.match(body, /h1: \(\{ children \}\) => <h1>/);
  const ruleCss = block(".assistant-md hr");
  assert.match(ruleCss, /align-self:\s*stretch/);
  assert.match(ruleCss, /width:\s*100%/);
  assert.match(ruleCss, /border-top:\s*1px solid var\(--border\)/);
  assert.match(ruleCss, /height:\s*0/);
  assert.match(ruleCss, /transition:\s*none/);
  assert.match(ruleCss, /animation:\s*none/);
  const strikeCss = block(".assistant-md del.md-strike");
  assert.match(strikeCss, /text-decoration:\s*line-through/);
  assert.match(strikeCss, /animation:\s*none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(body, /tableClipboardText\(table\.source\)/);
  assert.match(body, /codeBlockClipboardText\(source\)/);
  assert.doesNotMatch(src, /copyText/);
  assert.doesNotMatch(src, /clipboard/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(swift, /if !completed \{ return \[.markdown\(src\)\] \}/);
  assert.match(swift, /static func thematicBreakMarker/);
  assert.match(markdown, /MarkdownBreak\.split\(source, completed: completed\)/);
  assert.match(markdown, /Rectangle\(\)/);
  assert.match(markdown, /\.frame\(height: 1\)/);
  assert.match(markdown, /Color\(uiColor: \.separator\)/);
  assert.match(markdown, /accessibilityLabel\("Separator"\)/);
  assert.match(markdown, /MarkdownBreak\.animation\(reduceMotion: reduceMotion\)/);
  assert.match(markdown, /uiKit\.font = UIFont\.systemFont\(ofSize: size, weight: \.semibold\)/);
  assert.match(markdown, /level <= 1 \? metrics\.heading : metrics\.body/);
  assert.match(markdown, /byCharWrapping/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /replacingOccurrences\(of: "~~"/);
  assert.match(markdown, /interpretedSyntax = \.full/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.33 /);
  assert.match(spec, /## 133\. v1\.33/);
  assert.match(spec, /headings, strikethrough, and thematic breaks in completed assistant replies/i);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_break\.py/);
  assert.match(pkg, /markdownBreak\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
