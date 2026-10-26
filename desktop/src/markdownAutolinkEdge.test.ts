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
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(here, "..", "..", "runtime", "openapi.yaml"), "utf8");

const PHRASE =
  "v1.85 GFM extended autolink edge cases in completed assistant replies";

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
        li: block("li"),
        blockquote: block("blockquote"),
        a: passthrough("a"),
        code: passthrough("code"),
        pre: passthrough("pre"),
        em: block("em"),
        strong: block("strong"),
      },
      children: source,
    }),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replace(/&amp;/g, "&"),
  );
}

test("http(s) rejects an underscore in the last two domain segments", () => {
  assert.deepEqual(linksOf("http://ex_ample.com"), []);
  assert.deepEqual(linksOf("http://example.com_foo"), []);
  assert.deepEqual(linksOf("https://example_foo.com"), []);
  assert.deepEqual(linksOf("http://good.example_foo.com/a"), []);
  assert.deepEqual(linksOf("https://a.b.c_d.com"), []);
  assert.deepEqual(linksOf("http://exam_ple"), []);
  assert.deepEqual(linksOf("see http://example.com_ now"), []);
  assert.deepEqual(linksOf("http://example.com_ more"), []);
  assert.deepEqual(linksOf("www.example_foo.com"), []);
  assert.deepEqual(linksOf("www.xxx.yyy._zzz"), []);
  assert.deepEqual(linksOf("www.xxx._yyy.zzz"), []);
  assert.deepEqual(linksOf("https://foo_bar.example.com/a"), ["https://foo_bar.example.com/a"]);
  assert.deepEqual(linksOf("https://a.b_c.d.com/a"), ["https://a.b_c.d.com/a"]);
  assert.deepEqual(linksOf("www.foo_bar.example.com"), ["www.foo_bar.example.com"]);
  assert.deepEqual(linksOf("www._xxx.yyy.zzz"), ["www._xxx.yyy.zzz"]);
  assert.deepEqual(linksOf("http://example.com/foo_bar"), ["http://example.com/foo_bar"]);
  assert.deepEqual(linksOf("http://localhost/a_b"), ["http://localhost/a_b"]);
  assert.deepEqual(linksOf("http://example"), ["http://example"]);
  assert.deepEqual(linksOf("http://a.b.c.d.e.f.g.h.i.j.k._l"), [
    "http://a.b.c.d.e.f.g.h.i.j.k._l",
  ]);
  assert.deepEqual(linksOf("http://example.com_"), ["http://example.com"]);
  assert.deepEqual(linksOf("www.example.com_"), ["www.example.com"]);
  assert.deepEqual(
    linksOf("see https://foo_bar.example.com/a and http://ex_ample.com"),
    ["https://foo_bar.example.com/a"],
  );
});

test("a glued scheme and a punctuation-leading host stay plain", () => {
  assert.deepEqual(linksOf("foohttp://example.com"), []);
  assert.deepEqual(linksOf("fooHTTP://example.com"), []);
  assert.deepEqual(linksOf("1http://example.com"), ["http://example.com"]);
  assert.deepEqual(linksOf("foo-http://example.com"), ["http://example.com"]);
  assert.deepEqual(linksOf("foo_http://example.com"), ["http://example.com"]);
  assert.deepEqual(linksOf("http://-example.com"), []);
  assert.deepEqual(linksOf("http://.example.com"), []);
  assert.deepEqual(linksOf("http://_foo.com"), []);
  assert.deepEqual(linksOf("http://[::1]/"), []);
  assert.deepEqual(linksOf("http://$foo.com"), []);
  assert.deepEqual(linksOf("http://example$foo.com"), ["http://example$foo.com"]);
  assert.deepEqual(linksOf("ftp://example.com/a"), []);
  assert.deepEqual(linksOf("http://café.com"), ["http://café.com"]);
  assert.deepEqual(linksOf("http://ex_ämple.com"), []);
});

test("trailing entities count letters, and earlier punctuation still peels", () => {
  assert.deepEqual(linksOf("www.google.com/search?q=commonmark&hl;"), [
    "www.google.com/search?q=commonmark",
  ]);
  assert.deepEqual(linksOf("https://example.com/foo&bar;"), ["https://example.com/foo"]);
  assert.deepEqual(linksOf("www.example.com&amp;"), ["www.example.com"]);
  assert.deepEqual(linksOf("www.google.com/search?q=commonmark&hl1;"), [
    "www.google.com/search?q=commonmark&hl1",
  ]);
  assert.deepEqual(linksOf("https://example.com/foo&bar1;"), ["https://example.com/foo&bar1"]);
  assert.deepEqual(linksOf("www.example.com/foo&9;"), ["www.example.com/foo&9"]);
  assert.deepEqual(linksOf("https://example.com/foo&#38;"), ["https://example.com/foo&#38"]);
  assert.deepEqual(linksOf("http://example.com/foo&amp1;"), ["http://example.com/foo&amp1"]);
  assert.deepEqual(linksOf("https://example.com/foo&Ab1;"), ["https://example.com/foo&Ab1"]);
  assert.deepEqual(linksOf("www.commonmark.org/he<lp"), ["www.commonmark.org/he"]);
  assert.deepEqual(linksOf("(see https://example.com/a_(b))"), ["https://example.com/a_(b)"]);
  assert.deepEqual(linksOf("www.google.com/search?q=Markup+(business)))"), [
    "www.google.com/search?q=Markup+(business)",
  ]);
  assert.deepEqual(linksOf("http://www.pokemon.com/Pikachu_(Electric))"), [
    "http://www.pokemon.com/Pikachu_(Electric)",
  ]);
  assert.deepEqual(linksOf("http://www.pokemon.com/Pikachu_((Electric))"), [
    "http://www.pokemon.com/Pikachu_((Electric))",
  ]);
  assert.equal(linkHref("www.example.com"), "http://www.example.com");
});

test("an extended email must end in a letter", () => {
  assert.deepEqual(linksOf("foo@bar.baz"), ["foo@bar.baz"]);
  assert.deepEqual(linksOf("foo@bar.c2m"), ["foo@bar.c2m"]);
  assert.deepEqual(linksOf("a@b2.com"), ["a@b2.com"]);
  assert.deepEqual(linksOf("user@example.2com"), ["user@example.2com"]);
  assert.deepEqual(linksOf("x@y.z1a"), ["x@y.z1a"]);
  assert.deepEqual(linksOf("foo@bar.com2"), []);
  assert.deepEqual(linksOf("foo@bar.b2"), []);
  assert.deepEqual(linksOf("user@example.com2"), []);
  assert.deepEqual(linksOf("a@b.c2"), []);
  assert.deepEqual(linksOf("foo@bar.baz2"), []);
  assert.deepEqual(linksOf("x@y.z1"), []);
  assert.deepEqual(linksOf("a.b-c_d@a.b-"), []);
  assert.deepEqual(linksOf("a.b-c_d@a.b_"), []);
  assert.deepEqual(linksOf("hello@mail+xyz.example"), []);
  assert.deepEqual(linksOf("foo@bar.baz~"), ["foo@bar.baz"]);
  assert.equal(linkHref("foo@bar.c2m"), "mailto:foo@bar.c2m");
  assert.equal(linkHref("foo@bar.com2"), "foo@bar.com2");
});

test("only the exact mailto prefix is part of the link", () => {
  assert.deepEqual(linksOf("mailto:foo@bar.baz"), ["mailto:foo@bar.baz"]);
  assert.deepEqual(linksOf("MAILTO:foo@bar.baz"), ["foo@bar.baz"]);
  assert.deepEqual(linksOf("Mailto:foo@bar.baz"), ["foo@bar.baz"]);
  assert.equal(roundTrip("MAILTO:foo@bar.baz")[0]?.value, "MAILTO:");
  assert.deepEqual(linksOf("notmailto:foo@bar.baz"), []);
  assert.deepEqual(linksOf("xmpp:foo@bar.baz"), []);
  assert.equal(linkHref("mailto:foo@bar.baz"), "mailto:foo@bar.baz");
  assert.equal(linkHref("foo@bar.baz"), "mailto:foo@bar.baz");
});

test("code, links, and HTML blocks do not gain an extended autolink", () => {
  const code = rendered("see `http://example.com` and `foo@bar.baz` then http://out.example.com");
  assert.match(code, /<code>http:\/\/example.com<\/code>/);
  assert.match(code, /<code>foo@bar.baz<\/code>/);
  assert.deepEqual(hrefs(code), ["http://out.example.com"]);

  const label = rendered("[www.example.com](http://other.com)");
  assert.deepEqual(hrefs(label), ["http://other.com"]);
  assert.match(label, />www\.example\.com</);

  const inside = rendered("[link http://example.com](/uri)");
  assert.deepEqual(hrefs(inside), ["/uri"]);
  assert.doesNotMatch(inside, /href="http:\/\/example.com"/);

  const blockHtml = rendered("<div>\nwww.example.com\n</div>");
  assert.deepEqual(hrefs(blockHtml), []);
  assert.match(blockHtml, /www\.example\.com/);

  const after = rendered("paragraph\n\n<div>\nhttp://ex_ample.com\n</div>\n\nafter www.example.com");
  assert.deepEqual(hrefs(after), ["http://www.example.com"]);
  assert.match(after, /http:\/\/ex_ample\.com/);

  const quote = rendered("> www.example.com");
  assert.deepEqual(hrefs(quote), ["http://www.example.com"]);
  const item = rendered("- https://foo_bar.example.com");
  assert.deepEqual(hrefs(item), ["https://foo_bar.example.com"]);
});

test("streaming still leaves a URL at the end of the buffer plain", () => {
  assert.deepEqual(linksOf("see https://foo_bar.example.com", true), []);
  assert.deepEqual(linksOf("see https://foo_bar.example.com next", true), [
    "https://foo_bar.example.com",
  ]);
  assert.deepEqual(linksOf("see http://ex_ample.com next", true), []);
  assert.deepEqual(linksOf("see foo@bar.c2m", true), []);
  assert.deepEqual(linksOf("see foo@bar.c2m next", true), ["foo@bar.c2m"]);
});

test("both clients share the scan and the docs stay on 0.18.0", () => {
  assert.match(src, /v1\.85/);
  assert.match(swift, /v1\.85/);
  assert.match(src, /checkDomain\(text, hostStart, true\)/);
  assert.match(swift, /allowShort: true/);
  assert.match(src, /function isAsciiAlpha/);
  assert.match(swift, /func isAsciiAlpha/);
  assert.match(src, /function isMailtoCaseVariant/);
  assert.match(swift, /func isMailtoCaseVariant/);
  assert.match(src, /!== "mailto:"/);
  assert.match(swift, /prefix == "mailto:"/);
  assert.ok(src.includes("https?:\\/\\/[^\\s<]+"));
  assert.ok(swift.includes("https?://[^\\\\s<]+"));
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.85 /);
  assert.match(spec, /## 185\. v1\.85/);
  assert.match(spec, /GFM extended autolink edge cases/);
  assert.match(ci, /test_ios_markdown_autolink_edge\.py/);
  assert.match(pkg, /markdownAutolinkEdge\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /xmpp/);
});
