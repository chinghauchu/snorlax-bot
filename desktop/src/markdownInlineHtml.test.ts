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
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, HARD_BREAK_TOKEN, remarkHardBreaks } from "./markdownHardBreak.ts";
import {
  classifySafeInline,
  literalizeRawHtml,
  safeInlineHtmlAnimates,
} from "./markdownHtmlLiteral.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownHtmlLiteral.ts"), "utf8");
const hard = readFileSync(join(here, "markdownHardBreak.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
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
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(
  join(here, "..", "..", "runtime", "openapi.yaml"),
  "utf8",
);

const PHRASE =
  "v1.75 CommonMark safe inline HTML in completed assistant replies";

function pipeline(text: string, completed = true): string {
  return promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(text, completed), completed),
      completed,
    ),
    completed,
  );
}

function restoreChildren(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") return restoreMarkdownEscapes(child);
    if (!React.isValidElement(child)) return child;
    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;
    return React.cloneElement(child, {}, restoreChildren(props.children));
  });
}

function shown(text: string, completed = true): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      components: {
        p: ({ children }) => React.createElement("p", null, restoreChildren(children)),
        li: ({ children }) => React.createElement("li", null, restoreChildren(children)),
      },
      children: pipeline(text, completed),
    }),
  );
}

test("a bare br, kbd, sub, or sup renders and other angles stay text", () => {
  assert.deepEqual(classifySafeInline("<br>"), { kind: "br" });
  assert.deepEqual(classifySafeInline("<br/>"), { kind: "br" });
  assert.deepEqual(classifySafeInline("<br />"), { kind: "br" });
  assert.deepEqual(classifySafeInline("<BR>"), { kind: "br" });
  assert.deepEqual(classifySafeInline("<br >"), { kind: "br" });
  assert.deepEqual(classifySafeInline("<kbd>"), { kind: "open", tag: "kbd" });
  assert.deepEqual(classifySafeInline("</KBD>"), { kind: "close", tag: "kbd" });
  assert.deepEqual(classifySafeInline("<kbd/>"), { kind: "empty", tag: "kbd" });
  assert.deepEqual(classifySafeInline("<sub >"), { kind: "open", tag: "sub" });
  assert.deepEqual(classifySafeInline("</sup >"), { kind: "close", tag: "sup" });
  assert.equal(classifySafeInline('<br class="x">'), null);
  assert.equal(classifySafeInline('<kbd onclick="alert(1)">'), null);
  assert.equal(classifySafeInline("<script>"), null);
  assert.equal(classifySafeInline("<!-- x -->"), null);
  assert.equal(classifySafeInline("<3>"), null);
  assert.equal(classifySafeInline("<not a tag>"), null);
  assert.equal(classifySafeInline("a <b c"), null);

  for (const sample of ["foo<br>bar", "foo<br/>bar", "foo<br />bar", "foo<BR>bar"]) {
    const html = shown(sample);
    assert.match(html, /<p>foo<br\/>\s*bar<\/p>/, sample);
    assert.doesNotMatch(html, /&lt;br/i, sample);
  }
  assert.match(shown("H<sub>2</sub>O"), /H<sub class="md-sub">2<\/sub>O/);
  assert.match(shown("x<sup>2</sup>"), /x<sup class="md-sup">2<\/sup>/);
  assert.match(shown("Press <kbd>Ctrl</kbd>"), /<kbd class="md-kbd">Ctrl<\/kbd>/);
  assert.match(
    shown("<kbd>**Ctrl**</kbd>"),
    /<kbd class="md-kbd"><strong>Ctrl<\/strong><\/kbd>/,
  );
  assert.match(
    shown("<sup><kbd>n</kbd></sup>"),
    /<sup class="md-sup"><kbd class="md-kbd">n<\/kbd><\/sup>/,
  );
  assert.match(shown("<KBD>Ctrl</KBD>"), /<kbd class="md-kbd">Ctrl<\/kbd>/);
  assert.match(shown("<kbd >Ctrl</kbd >"), /<kbd class="md-kbd">Ctrl<\/kbd>/);
  const broken = shown("<kbd>a<br>b</kbd>");
  assert.match(broken, /<kbd class="md-kbd">a<br\/>\s*b<\/kbd>/);
  assert.match(shown("<kbd/>"), /<kbd class="md-kbd"><\/kbd>/);
  assert.equal(literalizeRawHtml("a<br>b").includes(HARD_BREAK_TOKEN), true);
  assert.equal(HARD_BREAK_TOKEN, "§§SBH§§");

  const crossed = shown("<sup><kbd>b</sup></kbd>");
  assert.match(crossed, /&lt;sup&gt;<kbd class="md-kbd">b&lt;\/sup&gt;<\/kbd>/);
  const open = shown("see <KBD>Ctrl");
  assert.match(open, /&lt;KBD&gt;/);
  assert.match(open, /Ctrl/);
  assert.doesNotMatch(open, /<kbd/);
});

test("tags that are not bare HTML stay characters and never run", () => {
  const literals = [
    ["a <b c", /a &lt;b c/],
    ["<3 hearts", /&lt;3 hearts/],
    ["<not a tag>", /&lt;not a tag&gt;/],
    ["1 < 2 > 0", /1 &lt; 2 &gt; 0/],
    ["foo <!-- **x** --> bar", /&lt;!-- \*\*x\*\* --&gt;/],
  ] as const;
  for (const [sample, pattern] of literals) {
    const html = shown(sample);
    assert.match(html, pattern, sample);
    assert.doesNotMatch(html, /<kbd|<sub\b|<sup\b|<br/i, sample);
    assert.doesNotMatch(html, /<script|<img|onclick|onerror/i, sample);
  }
  const comment = shown("foo <!-- **x** --> bar");
  assert.doesNotMatch(comment, /<strong>/);
  assert.doesNotMatch(comment, /<em>/);

  const script = shown("click <script>alert(1)</script> now");
  assert.match(script, /&lt;script&gt;/);
  assert.match(script, /alert\(1\)/);
  assert.match(script, /&lt;\/script&gt;/);
  assert.doesNotMatch(script, /<script/i);

  const handler = shown('<kbd onclick="alert(1)">x</kbd>');
  assert.match(handler, /&lt;kbd onclick=&quot;alert\(1\)&quot;&gt;/);
  assert.match(handler, /&lt;\/kbd&gt;/);
  assert.match(handler, /&gt;x&lt;\/kbd&gt;/);
  assert.doesNotMatch(handler, /<kbd/);
  assert.match(handler, /&lt;kbd onclick=/);

  const titled = shown('<kbd title="x">a</kbd>');
  assert.match(titled, /&lt;kbd title=&quot;x&quot;&gt;/);
  assert.doesNotMatch(titled, /<kbd/);

  const span = shown('<span class="x">t</span>');
  assert.match(span, /&lt;span class=&quot;x&quot;&gt;t&lt;\/span&gt;/);
  assert.doesNotMatch(span, /<span/);
});

test("code, fences, indented code, math, and streaming stay literal", () => {
  const code = shown("see `<kbd>Ctrl</kbd>` and <kbd>Ctrl</kbd>");
  assert.match(code, /<code>&lt;kbd&gt;Ctrl&lt;\/kbd&gt;<\/code>/);
  assert.match(code, /<kbd class="md-kbd">Ctrl<\/kbd>/);

  const fence = shown("```\n<br>\n<kbd>Ctrl</kbd>\n```\n");
  assert.match(fence, /<code>&lt;br&gt;\n&lt;kbd&gt;Ctrl&lt;\/kbd&gt;\n<\/code>/);
  assert.doesNotMatch(fence, /<kbd/);
  assert.doesNotMatch(fence, /md-kbd/);

  const indented = shown("para\n\n    <br>\n");
  assert.match(indented, /<pre><code>&lt;br&gt;\n<\/code><\/pre>/);
  assert.doesNotMatch(indented, /<br/);

  // Math is lifted out before raw HTML, same as MarkdownBody.
  const extracted = extractMath("See \\( a<br>b \\) and c<br>d");
  assert.match(extracted.slots[0]?.raw ?? "", /a<br>b/);
  assert.doesNotMatch(extracted.text, /a<br/);
  assert.match(extracted.text, /c<br>d/);
  const prepared = literalizeRawHtml(protectMarkdownEscapes(extracted.text, true), true);
  assert.match(prepared, /c§§SBH§§d/);
  assert.doesNotMatch(prepared, /<br/);
  const mathHtml = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      children: promoteSingleTilde(applyHardLineBreaks(prepared, true), true),
    }),
  );
  assert.match(mathHtml, /c<br\/>\s*d/);
  assert.doesNotMatch(mathHtml, /a<br/);

  const streaming = "use <br> and <kbd>Ctrl</kbd> <script>alert(1)</script>";
  assert.equal(pipeline(streaming, false), streaming);
  assert.equal(literalizeRawHtml(streaming, false), streaming);
  assert.equal(safeInlineHtmlAnimates(false), false);
  assert.equal(safeInlineHtmlAnimates(true), false);

  const link = shown("[<kbd>Enter</kbd>](https://example.com)");
  assert.match(link, /href="https:\/\/example.com"/);
  assert.match(link, /<kbd class="md-kbd">Enter<\/kbd>/);
  assert.equal(
    restoreMarkdownEscapes(literalizeRawHtml("` <br> `", true)),
    "` <br> `",
  );
});

test("docs, CI, and OpenAPI record v1.75 without a new route", () => {
  assert.match(src, /v1\.75/);
  assert.match(src, /export function classifySafeInline/);
  assert.match(src, /export function applySafeInlineHtml/);
  assert.match(src, /export function safeInlineHtmlAnimates/);
  assert.match(src, /SAFE_BREAK = "§§SBH§§"/);
  assert.match(src, /never copied|Nothing in the tag is copied/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(src, /computerPane/);
  assert.match(hard, /applySafeInlineHtml\(tree\)/);
  assert.match(body, /remarkHardBreaks/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /literalizeRawHtml\(reply\.content/);
  assert.doesNotMatch(app, /applySafeInlineHtml/);
  assert.match(css, /\.assistant-md kbd\.md-kbd/);
  assert.match(css, /animation:\s*none/);
  assert.match(css, /\.assistant-md sub\.md-sub/);
  assert.match(swift, /v1\.75/);
  assert.match(swift, /static func restoreSafeTags/);
  assert.match(swift, /static func safeAnimation/);
  assert.match(swift, /private static let safeBreak = "§§SBH§§"/);
  assert.match(swift, /"kbd", "sub", "sup"/);
  assert.match(swift, /Nothing in the tag is copied/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(markdown, /MarkdownHtmlLiteral\.restoreSafeTags\(parsed\)/);
  const hardAt = markdown.indexOf("MarkdownHardBreak.restore(parsed)");
  const safeAt = markdown.indexOf("MarkdownHtmlLiteral.restoreSafeTags(parsed)");
  assert.ok(hardAt >= 0 && safeAt > hardAt);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.75 /);
  assert.match(spec, /## 175\. v1\.75/);
  assert.match(spec, /safe inline HTML in completed assistant replies/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_inline_html\.py/);
  assert.match(pkg, /markdownInlineHtml\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
