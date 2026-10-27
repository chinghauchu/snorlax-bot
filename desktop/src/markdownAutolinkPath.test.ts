// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { linkHref, splitWebUrls, type WebPiece } from "./linkify.ts";
import { prepareAngleAutolinks } from "./markdownAutolink.ts";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { protectMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "linkify.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "WebLinks.swift"),
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

const PHRASE =
  "v1.71 GFM http(s) autolink path characters in completed assistant replies";

function roundTrip(text: string, streaming = false): WebPiece[] {
  const pieces = splitWebUrls(text, { streaming, emails: true });
  assert.equal(pieces.map((piece) => piece.value).join(""), text);
  return pieces;
}

function linksOf(text: string, streaming = false): string[] {
  return roundTrip(text, streaming)
    .filter((piece) => piece.type === "link")
    .map((piece) => piece.value);
}

function passthrough(tag: string) {
  return (props: Record<string, unknown>) => {
    const { children, node: _node, href } = props;
    return React.createElement(tag, { href }, children as ReactNode);
  };
}

function linkifyNode(node: ReactNode): ReactNode {
  return React.Children.map(node, (child) => {
    if (typeof child === "string") {
      const pieces = splitWebUrls(child, { emails: true });
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

function block(tag: string) {
  return (props: Record<string, unknown>) => {
    const { children, node: _node } = props;
    return React.createElement(tag, null, linkifyNode(children as ReactNode));
  };
}

function rendered(text: string): string {
  const source = promoteSingleTilde(
    applyHardLineBreaks(
      literalizeRawHtml(protectMarkdownEscapes(prepareAngleAutolinks(text, true), true), true),
      true,
    ),
    true,
  );
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: [remarkHardBreaks, remarkStrikethrough],
      urlTransform: (url: string) => url,
      components: {
        p: block("p"),
        a: passthrough("a"),
        code: passthrough("code"),
        em: block("em"),
        strong: block("strong"),
        del: block("del"),
      },
      children: source,
    }),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    (match[1] ?? "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<"),
  );
}

test("http(s) keeps interior path characters that www and cmark-gfm keep", () => {
  assert.deepEqual(linksOf("See https://en.wikipedia.org/wiki/O'Brien now"), [
    "https://en.wikipedia.org/wiki/O'Brien",
  ]);
  assert.deepEqual(linksOf("see http://example.com/O'Brien now"), [
    "http://example.com/O'Brien",
  ]);
  assert.deepEqual(linksOf('see https://example.com/a"b"c now'), [
    'https://example.com/a"b"c',
  ]);
  assert.deepEqual(linksOf("see https://example.com/a>b now"), ["https://example.com/a>b"]);
  assert.deepEqual(linksOf("see https://example.com/?a=1>2 now"), [
    "https://example.com/?a=1>2",
  ]);
  assert.deepEqual(linksOf("see https://example.com/a`b` now"), ["https://example.com/a`b`"]);
  assert.deepEqual(linksOf("https://example.com/foo'bar'."), ["https://example.com/foo'bar"]);
  assert.deepEqual(linksOf("https://example.com/O'Brien'"), ["https://example.com/O'Brien"]);
  assert.deepEqual(linksOf('https://example.com/a"b"'), ['https://example.com/a"b']);
  assert.deepEqual(linksOf("see https://user:p@ss'word@example.com/a now"), [
    "https://user:p@ss'word@example.com/a",
  ]);
  assert.deepEqual(linksOf("www.example.com/O'Brien"), ["www.example.com/O'Brien"]);
  assert.deepEqual(linksOf("www.example.com/a>b"), ["www.example.com/a>b"]);
});

test("angle closers, legacy trail, and non-http schemes stay as they were", () => {
  assert.deepEqual(linksOf("<https://example.com/foo>"), ["https://example.com/foo"]);
  assert.deepEqual(linksOf("<https://example.com/O'Brien>"), ["https://example.com/O'Brien"]);
  assert.deepEqual(linksOf("<https://example.com/foo>https://example.com/b"), [
    "https://example.com/foo",
    "https://example.com/b",
  ]);
  assert.deepEqual(linksOf("see https://example.com/a] next"), ["https://example.com/a"]);
  assert.deepEqual(linksOf("see https://example.com/foo]. now"), ["https://example.com/foo"]);
  assert.deepEqual(linksOf("https://example.com/a[b]"), ["https://example.com/a[b]"]);
  assert.deepEqual(linksOf("see https://example.com/a\u201d next"), ["https://example.com/a"]);
  assert.deepEqual(linksOf("see https://example.com/a* next"), ["https://example.com/a"]);
  assert.deepEqual(linksOf("(see https://example.com/a_(b))"), ["https://example.com/a_(b)"]);
  assert.deepEqual(linksOf("https://example.com/he<lp"), ["https://example.com/he"]);
  assert.deepEqual(linksOf("https://example.com/search?q=commonmark&hl;"), [
    "https://example.com/search?q=commonmark",
  ]);
  assert.deepEqual(linksOf("ftp://example.com/O'Brien"), []);
  assert.deepEqual(linksOf("xmpp:foo@bar.baz"), []);
  assert.deepEqual(linksOf("use `https://example.com/O'Brien` then https://example.com/b."), [
    "https://example.com/b",
  ]);
});

test("a completed reply links the path and streaming still waits at the buffer end", () => {
  const wiki = rendered("See https://en.wikipedia.org/wiki/O'Brien now");
  assert.deepEqual(hrefs(wiki), ["https://en.wikipedia.org/wiki/O'Brien"]);
  assert.match(wiki, /O&#x27;Brien/);

  const gt = rendered("see https://example.com/a>b now");
  // v2.00: the visible text still has `>`. The href percent-encodes it.
  assert.deepEqual(hrefs(gt), ["https://example.com/a%3Eb"]);
  assert.match(gt, /a&gt;b/);

  const angle = rendered("<https://example.com/O'Brien>");
  assert.deepEqual(hrefs(angle), ["https://example.com/O'Brien"]);
  assert.doesNotMatch(angle, /&lt;https/);

  const code = rendered("see https://example.com/a`b` now");
  assert.match(code, /<code[^>]*>b<\/code>/);
  assert.deepEqual(hrefs(code), ["https://example.com/a"]);

  assert.deepEqual(linksOf("see https://example.com/O'Brien", true), []);
  assert.deepEqual(linksOf("see https://example.com/O'Brien next", true), [
    "https://example.com/O'Brien",
  ]);
  assert.deepEqual(linksOf("<https://example.com/foo>", true), ["https://example.com/foo"]);
});

test("both clients share the scan and the docs stay on 0.18.0", () => {
  assert.ok(src.includes("https?:\\/\\/[^\\s<]+"));
  assert.ok(swift.includes('https?://[^\\\\s<]+'));
  assert.match(src, /function clipAngleCloser/);
  assert.match(swift, /func clipAngleCloser/);
  assert.match(src, /v1\.71/);
  assert.match(swift, /v1\.71/);
  assert.ok(swift.includes('"%27"'));
  assert.ok(swift.includes('"%22"'));
  assert.ok(swift.includes('"%60"'));
  assert.ok(swift.includes('"%3E"'));
  assert.equal(src.includes('[^\\s<>"\'`]'), false);
  assert.equal(swift.includes('[^\\\\s<>"\'`]'), false);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.71 /);
  assert.match(spec, /## 171\. v1\.71/);
  assert.match(spec, /http\(s\) autolink path characters/);
  assert.match(ci, /test_ios_markdown_autolink_path\.py/);
  assert.match(pkg, /markdownAutolinkPath\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /UIPasteboard/);
});
