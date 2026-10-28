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
import { cmarkHtmlDeclarationEnd, literalizeRawHtml } from "./markdownHtmlLiteral.ts";
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
  "v2.04 cmark-gfm HTML declaration whitespace in completed assistant replies";

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

test("the cmark-gfm declaration scanner requires whitespace after the uppercase run", () => {
  assert.equal(cmarkHtmlDeclarationEnd("<!DOCTYPE *bar*>", 0), "<!DOCTYPE *bar*>".length);
  assert.equal(cmarkHtmlDeclarationEnd("<!DOCTYPE\t*no*>", 0), "<!DOCTYPE\t*no*>".length);
  assert.equal(cmarkHtmlDeclarationEnd("<!A >", 0), "<!A >".length);
  assert.equal(cmarkHtmlDeclarationEnd("<!DOCTYPE *bar* and <!DOCTYPE *no*>", 0), "<!DOCTYPE *bar* and <!DOCTYPE *no*>".length);
  assert.equal(cmarkHtmlDeclarationEnd("<!DOCTYPE*bar*>", 0), -1);
  assert.equal(cmarkHtmlDeclarationEnd("<!A>", 0), -1);
  assert.equal(cmarkHtmlDeclarationEnd("<!A*bar*>", 0), -1);
  assert.equal(cmarkHtmlDeclarationEnd("<!HTML5 *bar*>", 0), -1);
  assert.equal(cmarkHtmlDeclarationEnd("<!Doctype*bar*>", 0), -1);
  assert.equal(cmarkHtmlDeclarationEnd("<!doctype *bar*>", 0), -1);
  assert.equal(cmarkHtmlDeclarationEnd("<!DOCTYPE *bar*", 0), -1);
  const shifted = "see <!DOCTYPE *no*>";
  assert.equal(cmarkHtmlDeclarationEnd(shifted, 4), 4 + "<!DOCTYPE *no*>".length);
});

test("a declaration without whitespace emphasizes and a following rule stays a heading", () => {
  assertHtml(
    "see <!DOCTYPE*bar*>",
    "<p>see &lt;!DOCTYPE<em>bar</em>&gt;</p>",
  );
  assertHtml(
    "foo <!DOCTYPE**bar**>",
    "<p>foo &lt;!DOCTYPE<strong>bar</strong>&gt;</p>",
  );
  assertHtml(
    "see <!A*bar*>",
    "<p>see &lt;!A<em>bar</em>&gt;</p>",
  );
  assertHtml(
    "see <!HTML5 *bar*>",
    "<p>see &lt;!HTML5 <em>bar</em>&gt;</p>",
  );
  assertHtml(
    "see <!Doctype*bar*>",
    "<p>see &lt;!Doctype<em>bar</em>&gt;</p>",
  );
  assertHtml(
    "see <!DOCTYPE*yes*> and <!DOCTYPE *no*>",
    "<p>see &lt;!DOCTYPE<em>yes</em>&gt; and &lt;!DOCTYPE *no*&gt;</p>",
  );
  assertHtml(
    "foo <!DOCTYPE*bar*>\n---",
    "<h2>foo &lt;!DOCTYPE<em>bar</em>&gt;</h2>",
  );
  assertHtml(
    "foo <!DOCTYPE*bar*>\n===",
    "<h1>foo &lt;!DOCTYPE<em>bar</em>&gt;</h1>",
  );
  assertHtml(
    "a  \nsee <!DOCTYPE*b*>",
    "<p>a<br/>\nsee &lt;!DOCTYPE<em>b</em>&gt;</p>",
  );
  assertHtml(
    "- see <!DOCTYPE*bar*>",
    "<ul><li>see &lt;!DOCTYPE<em>bar</em>&gt;</li></ul>",
  );
  assertHtml(
    "> quote <!DOCTYPE*bar*>",
    "<blockquote><p>quote &lt;!DOCTYPE<em>bar</em>&gt;</p></blockquote>",
  );
  assertHtml(
    "> foo <!DOCTYPE*bar*>\n> ---",
    "<blockquote><h2>foo &lt;!DOCTYPE<em>bar</em>&gt;</h2></blockquote>",
  );
  assertHtml(
    "[see <!DOCTYPE*bar*>](http://example.com)",
    '<p><a href="http://example.com">see &lt;!DOCTYPE<em>bar</em>&gt;</a></p>',
  );
  assertHtml(
    "foo\n    <!DOCTYPE*bar*>",
    "<p>foo\n&lt;!DOCTYPE<em>bar</em>&gt;</p>",
  );
});

test("whitespace declarations, HTML blocks, and code stay literal", () => {
  assertHtml(
    "see <!DOCTYPE *no*>",
    "<p>see &lt;!DOCTYPE *no*&gt;</p>",
  );
  assertHtml(
    "see <!DOCTYPE\t*no*>",
    "<p>see &lt;!DOCTYPE *no*&gt;</p>",
  );
  assertHtml(
    "foo <!DOCTYPE *no*>\n---",
    "<h2>foo &lt;!DOCTYPE *no*&gt;</h2>",
  );
  const block = renderReply("<!DOCTYPE*bar*>");
  assert.doesNotMatch(block, /<em>/);
  assert.match(block, /\*bar\*/);
  assert.doesNotMatch(block, /§§SBE/);

  const after = renderReply("foo\n<!DOCTYPE*bar*>\n---");
  assert.match(after, /<p>foo<\/p>/);
  assert.doesNotMatch(after, /<em>/);
  assert.match(after, /\*bar\*/);
  assert.match(norm(after), /<hr\/>/);
  assert.doesNotMatch(after, /<h[12]>/);

  const indented = renderReply("foo\n   <!DOCTYPE*bar*>");
  assert.doesNotMatch(indented, /<em>/);
  assert.match(indented, /\*bar\*/);

  assertHtml("see `<!DOCTYPE*bar*>` now", "<p>see <code>&lt;!DOCTYPE*bar*&gt;</code> now</p>");
  assertHtml(
    "```\n<!DOCTYPE*bar*>\n```",
    "<pre><code>&lt;!DOCTYPE*bar*&gt;\n</code></pre>",
  );
  assertHtml(
    "foo\n\n    <!DOCTYPE*bar*>",
    "<p>foo</p><pre><code>&lt;!DOCTYPE*bar*&gt;\n</code></pre>",
  );
  assert.equal(literalizeRawHtml("see <!DOCTYPE*bar*>", false), "see <!DOCTYPE*bar*>");
  const stashed = literalizeRawHtml("see <!DOCTYPE*bar*>", true);
  assert.match(stashed, /§§SBE00003C§§!DOCTYPE/);
  assert.equal(stashed.includes("<"), false);
  const kept = literalizeRawHtml("see <!DOCTYPE *no*>", true);
  assert.equal(kept.includes("<!DOCTYPE"), false);
  assert.match(kept, /§§SBE/);
});

test("both clients share the declaration whitespace rule and the reply path", () => {
  assert.match(src, /v2\.04/);
  assert.match(src, /function cmarkHtmlDeclarationEnd/);
  assert.match(src, /function isInvalidHtmlDeclaration/);
  assert.match(src, /function isDeclSpace/);
  assert.match(src, /stashMarkdownText\("<"\)/);
  assert.match(swift, /v2\.04/);
  assert.match(swift, /func cmarkHtmlDeclarationEnd/);
  assert.match(swift, /func isInvalidHtmlDeclaration/);
  assert.match(swift, /func isDeclSpace/);
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
  assert.ok(roadmap.includes("/ v2.04 "));
  assert.match(spec, /## 204\. v2\.04/);
  assert.match(ci, /test_ios_markdown_declaration_space\.py/);
  assert.match(pkg, /markdownDeclarationSpace\.test\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
