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
import { encodeCmarkHref } from "./markdownLinkDest.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const roadmap = readFileSync(join(root, "ROADMAP.md"), "utf8");
const spec = readFileSync(join(root, "docs", "specs", "v0.1-chat-and-agents.md"), "utf8");
const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const linkifySrc = readFileSync(join(here, "linkify.ts"), "utf8");
const destSrc = readFileSync(join(here, "markdownLinkDest.ts"), "utf8");
const swiftLinks = readFileSync(join(root, "ios", "SnorlaxBot", "WebLinks.swift"), "utf8");
const swiftDest = readFileSync(join(root, "ios", "SnorlaxBot", "MarkdownLinkDest.swift"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(root, "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(root, "runtime", "openapi.yaml"), "utf8");

const PHRASE =
  "v2.00 cmark-gfm extended autolink href percent-encoding in completed assistant replies";

/**
 * cmark-gfm 0.29.0.gfm.13 HTML (`-e autolink`) for the href.
 * houdini_escape_href percent-encodes unsafe bytes. The link text
 * stays the source characters. Hardcoded: CI does not build cmark.
 */
const CMARK_HTML: Array<[string, string]> = [
  [
    "www.example.com/foo]",
    '<p><a href="http://www.example.com/foo%5D">www.example.com/foo]</a></p>',
  ],
  [
    "see www.example.com/ä now",
    '<p>see <a href="http://www.example.com/%C3%A4">www.example.com/ä</a> now</p>',
  ],
  [
    "https://example.com/π",
    '<p><a href="https://example.com/%CF%80">https://example.com/π</a></p>',
  ],
  [
    "https://example.com/a|b",
    '<p><a href="https://example.com/a%7Cb">https://example.com/a|b</a></p>',
  ],
  [
    "https://example.com/a>b",
    '<p><a href="https://example.com/a%3Eb">https://example.com/a&gt;b</a></p>',
  ],
  [
    "www.example.com/a[b]",
    '<p><a href="http://www.example.com/a%5Bb%5D">www.example.com/a[b]</a></p>',
  ],
  [
    "https://example.com/foo]bar",
    '<p><a href="https://example.com/foo%5Dbar">https://example.com/foo]bar</a></p>',
  ],
  [
    "https://example.com/a{b}",
    '<p><a href="https://example.com/a%7Bb%7D">https://example.com/a{b}</a></p>',
  ],
  [
    "https://example.com/a^b",
    '<p><a href="https://example.com/a%5Eb">https://example.com/a^b</a></p>',
  ],
  [
    'https://example.com/a"b',
    '<p><a href="https://example.com/a%22b">https://example.com/a&quot;b</a></p>',
  ],
  [
    "www.example.com/foo\\bar",
    '<p><a href="http://www.example.com/foo%5Cbar">www.example.com/foo\\bar</a></p>',
  ],
  [
    "https://example.com/path?q=1",
    '<p><a href="https://example.com/path?q=1">https://example.com/path?q=1</a></p>',
  ],
  [
    "https://example.com/a_(b)",
    '<p><a href="https://example.com/a_(b)">https://example.com/a_(b)</a></p>',
  ],
  [
    "see https://example.com/a] next",
    '<p>see <a href="https://example.com/a">https://example.com/a</a>] next</p>',
  ],
  [
    "see `www.example.com/foo]` now",
    "<p>see <code>www.example.com/foo]</code> now</p>",
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

test("extended autolink hrefs match cmark-gfm percent-encoding", () => {
  for (const [source, html] of CMARK_HTML) {
    assert.equal(rendered(source), html, source);
  }
  assert.equal(linkHref("www.example.com/foo]"), "http://www.example.com/foo%5D");
  assert.equal(linkHref("www.example.com/ä"), "http://www.example.com/%C3%A4");
  assert.equal(linkHref("https://example.com/a|b"), "https://example.com/a%7Cb");
  assert.equal(linkHref("https://example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(linkHref("https://en.wikipedia.org/wiki/O'Brien"), "https://en.wikipedia.org/wiki/O'Brien");
  assert.equal(linkHref("foo@bar.baz"), "mailto:foo@bar.baz");
  assert.equal(encodeCmarkHref(linkHref("www.example.com/foo]")), linkHref("www.example.com/foo]"));
  assert.deepEqual(splitWebUrls("www.example.com/foo]").map((piece) => piece.value), [
    "www.example.com/foo]",
  ]);
  assert.deepEqual(splitWebUrls("see www.example.com/ä", { streaming: true }), [
    { type: "text", value: "see www.example.com/ä" },
  ]);
});

test("v2.00 is wired on both clients without a new route", () => {
  assert.match(linkifySrc, /v2\.00/);
  assert.match(linkifySrc, /encodeCmarkHref/);
  assert.match(destSrc, /export function encodeCmarkHref/);
  assert.match(swiftLinks, /v2\.00/);
  assert.match(swiftLinks, /MarkdownLinkDest\.autolinkHref/);
  assert.match(swiftDest, /v2\.00/);
  assert.match(swiftDest, /static func autolinkHref/);
  assert.match(swiftDest, /encodeHref\(value\)/);
  assert.equal(swiftLinks.includes("/v1/"), false);
  assert.equal(swiftDest.includes("/v1/"), false);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v2\.00 /);
  assert.match(spec, /## 200\. v2\.00/);
  assert.match(ci, /test_ios_markdown_autolink_href\.py/);
  assert.match(pkg, /markdownAutolinkHref\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.equal(openapi.includes("version: 0.19"), false);
});
