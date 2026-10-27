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
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { splitQuoteAndTasks } from "./markdownQuoteTask.ts";
import { headingInlineSource, splitSetextHeadings } from "./markdownSetext.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const src = read(join(here, "markdownHtmlLiteral.ts"));
const swift = read(join(root, "ios", "SnorlaxBot", "MarkdownHtmlLiteral.swift"));
const body = read(join(here, "MarkdownBody.tsx"));
const app = read(join(here, "App.tsx"));
const roadmap = read(join(root, "ROADMAP.md"));
const spec = read(join(root, "docs", "specs", "v0.1-chat-and-agents.md"));
const ci = read(join(root, ".github", "workflows", "ci.yml"));
const pkg = read(join(here, "..", "package.json"));
const openapi = read(join(here, "..", "openapi.yaml"));
const protocol = read(join(root, "protocol", "openapi.yaml"));
const runtimeOpenapi = read(join(root, "runtime", "openapi.yaml"));

const PHRASE =
  "v2.02 cmark-gfm lowercase HTML declarations in completed assistant replies";

function restoreChildren(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") return restoreMarkdownEscapes(child);
    if (!React.isValidElement(child)) return child;
    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;
    return React.cloneElement(child, {}, restoreChildren(props.children));
  });
}

/** Same prepare order a completed reply uses, then react-markdown. */
function renderChunk(text: string): string {
  const source = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(text, true), true),
      true,
    ),
    true,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      components: {
        a: ({ href, children }) =>
          React.createElement("a", { href }, restoreChildren(children)),
        blockquote: ({ children }) =>
          React.createElement("blockquote", null, restoreChildren(children)),
        em: ({ children }) => React.createElement("em", null, restoreChildren(children)),
        li: ({ children }) => React.createElement("li", null, restoreChildren(children)),
        p: ({ children }) => React.createElement("p", null, restoreChildren(children)),
        strong: ({ children }) =>
          React.createElement("strong", null, restoreChildren(children)),
      },
      children: source,
    }),
  );
}

function renderSetext(text: string): string {
  return splitSetextHeadings(text, true)
    .map((part) => {
      if (part.type !== "heading") return renderChunk(part.text);
      const tag = part.level === 1 ? "h1" : "h2";
      const inner = renderChunk(headingInlineSource(part.text)).replace(/<\/?p>/g, "");
      return `<${tag}>${inner}</${tag}>`;
    })
    .join("");
}

/** Quote peel, then setext, then the completed-reply prepare path. */
function renderReply(text: string): string {
  return splitQuoteAndTasks(text, true)
    .map((part) => {
      if (part.type === "quote") return `<blockquote>${renderSetext(part.text)}</blockquote>`;
      if (part.type === "markdown") return renderSetext(part.text);
      return "";
    })
    .join("");
}

function norm(html: string): string {
  return html
    .replace(/ class="[^"]*"/g, "")
    .replace(/<br\s*\/?>/g, "<br/>")
    .replace(/<hr\s*\/?>/g, "<hr/>")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, "");
}

function assertHtml(markdown: string, html: string): void {
  const actual = norm(renderReply(markdown));
  assert.equal(actual, norm(html), `${JSON.stringify(markdown)}\n${actual}`);
  assert.doesNotMatch(actual, /§§SBE/);
}

test("a lowercase declaration stays in the paragraph and a setext underline stays a heading", () => {
  assertHtml(
    "see <!doctype *bar* html>",
    "<p>see &lt;!doctype <em>bar</em> html&gt;</p>",
  );
  assertHtml(
    "foo\n<!doctype html>\n*bar*",
    "<p>foo\n&lt;!doctype html&gt;\n<em>bar</em></p>",
  );
  assertHtml(
    "foo\n<!doctype html\n*bar*\n>\nbaz",
    "<p>foo\n&lt;!doctype html\n<em>bar</em></p><blockquote></blockquote><p>baz</p>",
  );
  assertHtml(
    "foo\n<!doctype *bar* html>\n---",
    "<h2>foo\n&lt;!doctype <em>bar</em> html&gt;</h2>",
  );
  assertHtml(
    "<!doctype *bar* html>\n---",
    "<h2>&lt;!doctype <em>bar</em> html&gt;</h2>",
  );
  assertHtml(
    "foo\n<!doctype x>\n===",
    "<h1>foo\n&lt;!doctype x&gt;</h1>",
  );
  assertHtml(
    "foo\n   <!doctype *bar*>",
    "<p>foo\n&lt;!doctype <em>bar</em>&gt;</p>",
  );
  assertHtml(
    "foo\n    <!doctype *bar*>",
    "<p>foo\n&lt;!doctype <em>bar</em>&gt;</p>",
  );
  assertHtml(
    "a  \n<!doctype *b*>",
    "<p>a<br/>\n&lt;!doctype <em>b</em>&gt;</p>",
  );
  assertHtml(
    "[see <!doctype *bar*>](http://example.com)",
    '<p><a href="http://example.com">see &lt;!doctype <em>bar</em>&gt;</a></p>',
  );
  assertHtml(
    "- foo\n  <!doctype *bar*\n  ---",
    "<ul><li><h2>foo\n&lt;!doctype <em>bar</em></h2></li></ul>",
  );
  assertHtml(
    "> foo\n> <!doctype *bar*\n> ---",
    "<blockquote><h2>foo\n&lt;!doctype <em>bar</em></h2></blockquote>",
  );
  assertHtml(
    "> foo\n<!doctype *bar*",
    "<blockquote><p>foo\n&lt;!doctype <em>bar</em></p></blockquote>",
  );
  assertHtml(
    "- foo\n  see <!doctype *bar*>",
    "<ul><li>foo\nsee &lt;!doctype <em>bar</em>&gt;</li></ul>",
  );
  assertHtml(
    "see <!doctype *bar* html> and <!DOCTYPE *no*>",
    "<p>see &lt;!doctype <em>bar</em> html&gt; and &lt;!DOCTYPE *no*&gt;</p>",
  );
});

test("uppercase declarations, code, and HTML blocks stay as they were", () => {
  const upper = renderReply("foo\n<!DOCTYPE html\n*bar*\nbaz");
  assert.doesNotMatch(upper, /<em>/);
  assert.match(upper, /\*bar\*/);
  assert.match(upper, /DOCTYPE/);

  const ruled = norm(renderReply("foo\n<!DOCTYPE html>\n---"));
  assert.match(ruled, /<p>foo<\/p>/);
  assert.match(ruled, /DOCTYPE/);
  assert.match(ruled, /<hr\/>/);
  assert.doesNotMatch(ruled, /<h[12]>/);
  assert.doesNotMatch(ruled, /<em>/);

  assertHtml(
    "foo\n\n<!doctype x>\n\n---",
    "<p>foo</p><p>&lt;!doctype x&gt;</p><hr/>",
  );
  assertHtml("foo\n<! doctype\n*bar*", "<p>foo\n&lt;! doctype\n<em>bar</em></p>");
  assertHtml("see `<!doctype *b*>`", "<p>see <code>&lt;!doctype *b*&gt;</code></p>");
  assertHtml(
    "```\n<!doctype *bar*\n```",
    "<pre><code>&lt;!doctype *bar*\n</code></pre>",
  );
  assertHtml(
    "foo\n\n    <!doctype *bar*",
    "<p>foo</p><pre><code>&lt;!doctype *bar*\n</code></pre>",
  );
  assertHtml(
    "- foo\n\n      <!doctype *bar*",
    "<ul><li><p>foo</p><pre><code>&lt;!doctype *bar*\n</code></pre></li></ul>",
  );

  const script = renderReply("<script>\n<!doctype *bar*\n</script>\nok");
  assert.doesNotMatch(script, /<em>/);
  assert.match(script, /\*bar\*/);
  assert.match(script, /ok/);
  assert.doesNotMatch(script, /<script/i);

  const comment = renderReply("<!-- *bar* -->");
  assert.doesNotMatch(comment, /<em>/);
  assert.match(comment, /\*bar\*/);

  const cdata = renderReply("foo\n<![CDATA[\n*bar*\n]]>");
  assert.doesNotMatch(cdata, /<em>/);
  assert.match(cdata, /\*bar\*/);

  assert.equal(literalizeRawHtml("see <!doctype *bar*>", false), "see <!doctype *bar*>");
  const inlined = literalizeRawHtml("see <!DOCTYPE *no*>", true);
  assert.equal(inlined.includes("<!DOCTYPE"), false);
  assert.match(inlined, /§§SBE/);
  assert.match(literalizeRawHtml("see <!doctype *bar*>", true), /§§SBE00003C§§!doctype/);
});

test("both clients share the rule and the reply path", () => {
  assert.match(src, /v2\.02/);
  assert.match(src, /function isLowerHtmlDeclaration/);
  assert.match(src, /ASCII uppercase/);
  assert.match(src, /stashMarkdownText\("<"\)/);
  assert.match(swift, /v2\.02/);
  assert.match(swift, /isLowerHtmlDeclaration/);
  assert.match(swift, /ASCII uppercase/);
  assert.match(swift, /token\("<"\)/);
  assert.match(body, /literalizeRawHtml\(/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /computerPane/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.ok(roadmap.includes(PHRASE));
  assert.ok(roadmap.includes("/ v2.02 "));
  assert.match(spec, /## 202\. v2\.02/);
  assert.match(ci, /test_ios_markdown_declaration\.py/);
  assert.match(pkg, /markdownDeclaration\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
