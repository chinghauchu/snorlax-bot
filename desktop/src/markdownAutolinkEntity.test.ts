// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { linkHref, splitWebUrls } from "./linkify.ts";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const roadmap = readFileSync(join(root, "ROADMAP.md"), "utf8");
const spec = readFileSync(join(root, "docs", "specs", "v0.1-chat-and-agents.md"), "utf8");
const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const escapeSrc = readFileSync(join(here, "markdownEscape.ts"), "utf8");
const linkifySrc = readFileSync(join(here, "linkify.ts"), "utf8");
const bodySrc = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const swiftLinks = readFileSync(join(root, "ios", "SnorlaxBot", "WebLinks.swift"), "utf8");
const swiftEscape = readFileSync(join(root, "ios", "SnorlaxBot", "MarkdownEscape.swift"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(root, "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(root, "runtime", "openapi.yaml"), "utf8");

const PHRASE =
  "v1.99 cmark-gfm extended autolink trailing character references in completed assistant replies";

/**
 * cmark-gfm 0.29.0.gfm.13 `-e autolink` HTML for a completed reply.
 * Hardcoded: CI does not build cmark. Angle autolinks are not in
 * this list; v1.91 still copies those source characters.
 */
const CMARK_HTML: Array<[string, string]> = [
  [
    "see https://example.com/a&copy;",
    "<p>see <a href=\"https://example.com/a\">https://example.com/a</a>©</p>",
  ],
  [
    "www.example.com/a&copy;",
    "<p><a href=\"http://www.example.com/a\">www.example.com/a</a>©</p>",
  ],
  [
    "https://example.com/a&amp;",
    "<p><a href=\"https://example.com/a\">https://example.com/a</a>&amp;</p>",
  ],
  [
    "https://example.com/a&copy;b",
    "<p><a href=\"https://example.com/a&amp;copy;b\">https://example.com/a&amp;copy;b</a></p>",
  ],
  [
    "https://example.com/foo&#38;",
    "<p><a href=\"https://example.com/foo&amp;#38\">https://example.com/foo&amp;#38</a>;</p>",
  ],
  [
    "Visit https://example.com/a&reg;.",
    "<p>Visit <a href=\"https://example.com/a\">https://example.com/a</a>®.</p>",
  ],
  [
    "https://example.com/a&nbsp;",
    "<p><a href=\"https://example.com/a\">https://example.com/a</a>\u00a0</p>",
  ],
  [
    "(https://example.com/a&copy;)",
    "<p>(<a href=\"https://example.com/a\">https://example.com/a</a>©)</p>",
  ],
  ["&copy; 2026", "<p>© 2026</p>"],
  [
    "https://example.com/q&hl;",
    "<p><a href=\"https://example.com/q\">https://example.com/q</a>&amp;hl;</p>",
  ],
  [
    "www.example.com/q&hl;",
    "<p><a href=\"http://www.example.com/q\">www.example.com/q</a>&amp;hl;</p>",
  ],
  [
    "`https://example.com/a&copy;`",
    "<p><code>https://example.com/a&amp;copy;</code></p>",
  ],
  [
    "https://example.com/a&quot;",
    "<p><a href=\"https://example.com/a\">https://example.com/a</a>&quot;</p>",
  ],
  [
    "https://example.com/a&hellip;",
    "<p><a href=\"https://example.com/a\">https://example.com/a</a>…</p>",
  ],
  [
    "https://example.com/a&amp;b",
    "<p><a href=\"https://example.com/a&amp;amp;b\">https://example.com/a&amp;amp;b</a></p>",
  ],
];

function linkifyNode(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") {
      const pieces = splitWebUrls(child, { emails: true }).map((piece) => ({
        ...piece,
        value: restoreMarkdownEscapes(piece.value),
      }));
      return pieces.map((piece, index) =>
        piece.type === "link"
          ? React.createElement("a", { key: index, href: linkHref(piece.value) }, piece.value)
          : piece.value,
      );
    }
    if (!React.isValidElement(child)) return child;
    if (typeof child.type === "function" || child.type === "a" || child.type === "code") {
      return child;
    }
    const props = child.props as { children?: ReactNode };
    return React.cloneElement(child, {}, linkifyNode(props.children));
  });
}

/** Same prepare path as MarkdownBody, then the text-node linkify. */
function rendered(text: string): string {
  const source = literalizeRawHtml(
    protectMarkdownEscapes(prepareAngleAutolinks(text, true), true),
    true,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      urlTransform: (url: string) => url,
      components: {
        p: (props: { children?: ReactNode }) =>
          React.createElement("p", null, linkifyNode(props.children)),
        a: (props: { href?: string; children?: ReactNode }) =>
          React.createElement("a", { href: props.href }, props.children),
        code: (props: { children?: ReactNode }) =>
          React.createElement("code", null, props.children),
      },
      children: source,
    }),
  );
}

test("trailing character references match cmark-gfm extended autolinks", () => {
  for (const [source, html] of CMARK_HTML) {
    assert.equal(rendered(source), html, source);
    const once = protectMarkdownEscapes(source, true);
    assert.equal(protectMarkdownEscapes(once, true), once, source);
  }
});

test("a backslash inside the autolink stays, and the paren stays outside", () => {
  const html = rendered("http://example.com/foo\\)");
  assert.match(html, /<a href="http:\/\/example.com\/foo%5C">http:\/\/example.com\/foo\\<\/a>\)/);
  assert.equal(
    protectMarkdownEscapes(protectMarkdownEscapes("http://example.com/foo\\)", true), true),
    protectMarkdownEscapes("http://example.com/foo\\)", true),
  );
});

test("angle autolinks, destinations, and streaming stay on the previous rules", () => {
  const angle = "<https://example.com/a&amp;>";
  assert.equal(protectMarkdownEscapes(angle, true), angle);
  const dest = "[a](https://example.com/a&#38;)";
  assert.match(protectMarkdownEscapes(dest, true), /&#38;/);
  assert.equal(
    protectMarkdownEscapes("see https://example.com/a&copy;", false),
    "see https://example.com/a&copy;",
  );
});

test("v1.99 is wired on both clients without a new route", () => {
  assert.match(escapeSrc, /v1\.99/);
  assert.match(escapeSrc, /§§SBL/);
  assert.match(escapeSrc, /function literalToken/);
  assert.match(linkifySrc, /extendedAutolinkRanges/);
  assert.match(linkifySrc, /trailingEscapeToken/);
  assert.match(bodySrc, /§§SBL/);
  assert.match(swiftLinks, /v1\.99/);
  assert.match(swiftLinks, /extendedAutolinkSpans/);
  assert.match(swiftLinks, /trailingEscapeToken/);
  assert.match(swiftLinks, /MarkdownEscape\.restoreString/);
  assert.match(swiftEscape, /v1\.99/);
  assert.match(swiftEscape, /§§SBL/);
  assert.match(swiftEscape, /literalToken/);
  assert.match(swiftEscape, /extendedLiteralSpans/);
  assert.equal(swiftLinks.includes("/v1/"), false);
  assert.equal(swiftEscape.includes("/v1/"), false);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.99 /);
  assert.match(spec, /## 199\. v1\.99/);
  assert.match(ci, /test_ios_markdown_autolink_entity\.py/);
  assert.match(pkg, /markdownAutolinkEntity\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.equal(openapi.includes("version: 0.19"), false);
});
