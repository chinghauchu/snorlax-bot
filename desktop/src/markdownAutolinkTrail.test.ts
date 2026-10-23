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
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "WebLinks.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const plain = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MidStreamPlaintext.swift"),
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
  "v1.62 GFM extended autolink trailing punctuation in completed assistant replies";

const TRAIL = ["?", "!", ".", ",", ":", "*", "_", "~"];

function roundTrip(text: string, streaming = false): WebPiece[] {
  const pieces = splitWebUrls(text, { streaming });
  assert.equal(
    pieces.map((piece) => piece.value).join(""),
    text,
    `pieces must rebuild ${JSON.stringify(text)}`,
  );
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

const Anchor = passthrough("a");
const Code = passthrough("code");

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
    // Markdown components linkify their own children. A host anchor or
    // code span already owns its text.
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

/** Same pre-parse passes MarkdownBody runs, then the text-node linkify. */
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
        a: Anchor,
        code: Code,
        em: block("em"),
        strong: block("strong"),
        del: block("del"),
      },
      children: source,
    }),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

test("www and http(s) leave the same GFM trailing punctuation outside", () => {
  for (const mark of TRAIL) {
    assert.deepEqual(linksOf(`see https://example.com/a${mark} next`), [
      "https://example.com/a",
    ]);
    assert.deepEqual(linksOf(`see http://example.com/a${mark} next`), [
      "http://example.com/a",
    ]);
    assert.deepEqual(linksOf(`see www.example.com/a${mark} next`), [
      "www.example.com/a",
    ]);
    assert.deepEqual(linksOf(`https://example.com/a${mark}`), ["https://example.com/a"]);
    assert.deepEqual(linksOf(`www.example.com/a${mark}`), ["www.example.com/a"]);
  }
  assert.deepEqual(linksOf("https://example.com/a_*~."), ["https://example.com/a"]);
  assert.deepEqual(linksOf("www.example.com/a_*~."), ["www.example.com/a"]);
  assert.deepEqual(linksOf("https://example.com/a*b"), ["https://example.com/a*b"]);
  assert.deepEqual(linksOf("https://example.com/a_b"), ["https://example.com/a_b"]);
  assert.deepEqual(linksOf("https://example.com/a?q=1"), ["https://example.com/a?q=1"]);
  assert.deepEqual(linksOf("www.example.com/a?q=1"), ["www.example.com/a?q=1"]);
  assert.deepEqual(linksOf("https://example.com/a~b"), ["https://example.com/a~b"]);
});

test("unbalanced parentheses and entity-like tails stay outside; < ends the link", () => {
  assert.deepEqual(linksOf("(see https://example.com/a_(b))"), [
    "https://example.com/a_(b)",
  ]);
  assert.deepEqual(linksOf("(see www.example.com/a_(b))"), ["www.example.com/a_(b)"]);
  assert.deepEqual(linksOf("https://example.com/a_(b)*"), ["https://example.com/a_(b)"]);
  assert.deepEqual(
    linksOf("https://www.pokemon.com/Pikachu_(Electric)"),
    ["https://www.pokemon.com/Pikachu_(Electric)"],
  );
  assert.deepEqual(
    linksOf("https://www.pokemon.com/Pikachu_(Electric))"),
    ["https://www.pokemon.com/Pikachu_(Electric)"],
  );
  assert.deepEqual(
    linksOf("https://www.pokemon.com/Pikachu_((Electric))"),
    ["https://www.pokemon.com/Pikachu_((Electric))"],
  );
  assert.deepEqual(linksOf("https://example.com/search?q=commonmark&hl;"), [
    "https://example.com/search?q=commonmark",
  ]);
  assert.deepEqual(linksOf("www.google.com/search?q=commonmark&hl;"), [
    "www.google.com/search?q=commonmark",
  ]);
  assert.deepEqual(linksOf("https://example.com/q&hl;."), ["https://example.com/q"]);
  assert.deepEqual(linksOf("www.example.com/q&hl;."), ["www.example.com/q"]);
  assert.deepEqual(linksOf("https://example.com/a;"), ["https://example.com/a"]);
  assert.deepEqual(linksOf("https://example.com/he<lp"), ["https://example.com/he"]);
  assert.deepEqual(linksOf("www.commonmark.org/he<lp"), ["www.commonmark.org/he"]);
  assert.deepEqual(linksOf("see https://example.com/a\u201d next"), [
    "https://example.com/a",
  ]);
  assert.deepEqual(linksOf("see https://example.com/a] next"), ["https://example.com/a"]);
  assert.deepEqual(linksOf("https://example.com/a[b]"), ["https://example.com/a[b]"]);
  assert.deepEqual(linksOf("https://example.com/a[b]]"), ["https://example.com/a[b]"]);
});

test("a completed reply renders the trimmed link and keeps the punctuation", () => {
  const star = rendered("see https://example.com/a* now");
  assert.deepEqual(hrefs(star), ["https://example.com/a"]);
  assert.match(star, /https:\/\/example\.com\/a<\/a>\*/);

  const under = rendered("see https://example.com/a_ now");
  assert.deepEqual(hrefs(under), ["https://example.com/a"]);
  assert.match(under, /https:\/\/example\.com\/a<\/a>_/);

  const tilde = rendered("see https://example.com/a~ now");
  assert.deepEqual(hrefs(tilde), ["https://example.com/a"]);
  assert.match(tilde, /https:\/\/example\.com\/a<\/a>~/);

  const wrapped = rendered("(see https://example.com/a_(b))");
  assert.deepEqual(hrefs(wrapped), ["https://example.com/a_(b)"]);
  assert.match(wrapped, /\(see /);
  assert.match(wrapped, /\)<\/p>/);

  const entity = rendered("see https://example.com/search?q=commonmark&hl; now");
  assert.deepEqual(hrefs(entity), ["https://example.com/search?q=commonmark"]);
  assert.match(entity, /&amp;hl;/);

  const www = rendered("see www.example.com/a* now");
  assert.deepEqual(hrefs(www), ["http://www.example.com/a"]);
  assert.match(www, /www\.example\.com\/a<\/a>\*/);

  const explicit = rendered("[go](https://example.com/a*)");
  assert.deepEqual(hrefs(explicit), ["https://example.com/a*"]);

  const angle = rendered("<https://example.com/a*>");
  assert.deepEqual(hrefs(angle), ["https://example.com/a*"]);

  const code = rendered("use `https://example.com/a*` then https://example.com/b*.");
  assert.deepEqual(hrefs(code), ["https://example.com/b"]);
  assert.match(code, /https:\/\/example\.com\/a\*/);
});

test("streaming still leaves an end-of-buffer URL plain, and copy stays source", () => {
  assert.deepEqual(linksOf("see https://example.com/a*", true), []);
  assert.deepEqual(linksOf("see www.example.com/a*", true), []);
  assert.deepEqual(linksOf("see https://example.com/a* next", true), [
    "https://example.com/a",
  ]);
  assert.deepEqual(linksOf("see https://example.com/search?q=commonmark&hl;", true), []);
  assert.deepEqual(
    linksOf("use `https://example.com/a*` then https://example.com/b*."),
    ["https://example.com/b"],
  );

  const http = src.split("function splitHttp")[1]?.split("const WWW_TRAIL")[0] ?? "";
  assert.ok(http.indexOf("streaming && idx + raw.length") < http.indexOf("trimTrailingPunctuation"));
  assert.match(src, /autolinkDelim\(url, 0, end\)/);
  assert.match(src, /v1\.62/);
  assert.match(
    src,
    /const WWW_TRAIL = new Set\(\["\?", "!", "\.", ",", ":", "\*", "_", "~", "'", '"'\]\)/,
  );
  const swiftHttp = swift.split("func splitHttp")[1]?.split("static func attributed")[0] ?? "";
  assert.ok(swiftHttp.indexOf("streaming && rawEnd == text.endIndex") < swiftHttp.indexOf("trimTrailing"));
  assert.match(swift, /autolinkDelim\(chars, 0, end\)/);
  assert.match(swift, /v1\.62/);
  assert.match(swift, /\["\?", "!", "\.", ",", ":", "\*", "_", "~", "'", "\\""\]/);
  assert.match(body, /splitWebUrls\(text, \{ streaming, emails \}\)/);
  assert.match(body, /href=\{linkHref\(piece\.value\)\}/);
  assert.match(markdown, /WebLinks\.applyingLinks\(parsed, streaming: false\)/);
  assert.match(plain, /WebLinks\.attributed\(text, streaming: true\)/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.doesNotMatch(app, /splitWebUrls\(reply\.content/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.62 /);
  assert.match(spec, /## 162\. v1\.62/);
  assert.match(spec, /GFM extended autolink trailing punctuation/);
  assert.match(ci, /test_ios_markdown_autolink_trail\.py/);
  assert.match(pkg, /markdownAutolinkTrail\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
