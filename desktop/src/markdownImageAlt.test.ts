// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { ASCII_PUNCT, protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import { literalizeRawHtml } from "./markdownHtmlLiteral.ts";
import { imageFallbackLabel, imageRenderPlan, neutralizeUnsafeImages } from "./markdownImage.ts";
import { flattenImageAlt, prepareImageAlts } from "./markdownImageAlt.ts";
import { prepareSpacedLinkDestinations, resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { promoteSingleTilde } from "./markdownSingleStrike.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownImageAlt.ts"), "utf8");
const image = readFileSync(join(here, "markdownImage.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const swift = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownImageAlt.swift"), "utf8");
const imageSwift = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownImage.swift"), "utf8");
const markdown = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"), "utf8");
const chat = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"), "utf8");
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(here, "..", "..", "runtime", "openapi.yaml"), "utf8");

const PHRASE = "v1.77 CommonMark image alt text in completed assistant replies";

function flatten(description: string): string {
  return flattenImageAlt(description);
}

function painted(source: string, completed = true): { html: string; alt: string | null; title: string } {
  const text = prepareImageAlts(prepareSpacedLinkDestinations(source, completed), completed);
  const extracted = extractMath(text);
  const mathText = neutralizeUnsafeImages(extracted.text, completed);
  const prepared = promoteSingleTilde(
    applyHardLineBreaks(literalizeRawHtml(protectMarkdownEscapes(mathText, completed), completed), completed),
    completed,
  );
  let alt: string | null = null;
  let title = "";
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      components: {
        img: (props: { alt?: string; src?: string; title?: string }) => {
          const plan = imageRenderPlan(
            completed,
            restoreMarkdownEscapes(typeof props.alt === "string" ? props.alt : ""),
            restoreMarkdownEscapes(typeof props.src === "string" ? props.src : ""),
            restoreMarkdownEscapes(typeof props.title === "string" ? props.title : ""),
          );
          if (plan.type !== "image") {
            alt = plan.type === "hidden" ? "" : plan.text;
            return React.createElement("span", null, alt);
          }
          alt = plan.alt;
          title = plan.title;
          const label = plan.alt.trim() || "Image";
          return React.createElement(
            "button",
            {
              type: "button",
              "aria-label": label,
              "data-fallback": imageFallbackLabel(plan.alt, plan.src),
            },
            React.createElement("img", { alt: plan.alt, src: plan.src }),
          );
        },
      },
      children: prepared,
    }),
  );
  return { html, alt, title };
}

test("image alt text is the cmark-gfm plain-text flattening", () => {
  const cases: Array<[string, string]> = [
    ["foo *bar*", "foo bar"],
    ["foo **bar**", "foo bar"],
    ["*foo* bar", "foo bar"],
    ["foo * bar", "foo * bar"],
    ["foo*bar*baz", "foobarbaz"],
    ["*foo*bar*", "foobar*"],
    ["***foo***", "foo"],
    ["***", "***"],
    ["**foo*", "*foo"],
    ["*foo**", "foo*"],
    ["__foo__bar", "__foo__bar"],
    ["foo_bar_baz", "foo_bar_baz"],
    ["_foo_bar_", "foo_bar"],
    ["*(*foo*)*", "(foo)"],
    ["foo\nbar", "foo bar"],
    ["foo \nbar", "foo  bar"],
    ["foo  \nbar", "foo bar"],
    ["foo\\\nbar", "foo bar"],
    ["foo\n  bar", "foo   bar"],
    ["foo   \nbar", "foo bar"],
    ["*bar\nbaz*", "bar baz"],
    ["a `code` b", "a code b"],
    ["a `b\nc` d", "a b c d"],
    ["` foo `", "foo"],
    ["`` ` ``", "`"],
    ["a `b&amp;c` d", "a b&amp;c d"],
    ["a `b\\*c` d", "a b\\*c d"],
    ["foo ~~bar~~ baz", "foo bar baz"],
    ["~~ foo ~~", "~~ foo ~~"],
    ["~~foo~~~", "~~foo~~~"],
    ["~~~foo~~~", "~~~foo~~~"],
    ["~~a~~~b~~", "a~~~b"],
    ["x ~~~foo~~~ y", "x ~~~foo~~~ y"],
    ["~~*bar*~~", "bar"],
    ["foo ~bar~", "foo ~bar~"],
    ["**foo ~~bar~~ baz**", "foo bar baz"],
    ["foo ![bar](/b)", "foo bar"],
    ["foo ![*bar*](/b)", "foo bar"],
    ["foo [bar](/url)", "foo bar"],
    ["foo [bar]", "foo [bar]"],
    ["foo [bar [baz](/u)](/v)", "foo [bar baz](/v)"],
    ["foo [bar](/u) baz", "foo bar baz"],
    ["a `](` b", "a ]( b"],
    ['foo [bar](/u "title")', "foo bar"],
    ["foo [bar](/u 'title')", "foo bar"],
    ["foo [bar](/u (title))", "foo bar"],
    ["&amp;", "&"],
    ["&copy;", "©"],
    ["&#35;", "#"],
    ["&#x22;", '"'],
    ["&notanentity;", "&notanentity;"],
    ["&#87654321;", "&#87654321;"],
    ["&#x1F600;", "😀"],
    ["&lt;bar&gt;", "<bar>"],
    ["foo\\&bar", "foo&bar"],
    ["foo\\*bar\\*", "foo*bar*"],
    ["a <https://example.com/a> b", "a https://example.com/a b"],
    ["a <user@example.com> b", "a user@example.com b"],
    ["<not a link>", "<not a link>"],
    ["<bar>", "<bar>"],
    ["<bar *baz*>", "<bar baz>"],
    ["", ""],
    ["   ", "   "],
    ["```foo``", "```foo``"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(flatten(input), expected, input);
  }
  for (const ch of ASCII_PUNCT) {
    assert.equal(flatten(`a\\${ch}b`), `a${ch}b`, ch);
  }
});

test("a completed image paints the flattened alt on every surface", () => {
  const emphasis = painted('![foo *bar*](https://example.com/a.png "diagram")');
  assert.equal(emphasis.alt, "foo bar");
  assert.equal(emphasis.title, "diagram");
  assert.match(emphasis.html, /aria-label="foo bar"/);
  assert.match(emphasis.html, /alt="foo bar"/);
  assert.match(emphasis.html, /data-fallback="foo bar"/);

  assert.equal(painted("![foo ![bar](/b)](https://example.com/a.png)").alt, "foo bar");
  assert.equal(painted("![a `code` b](https://example.com/a.png)").alt, "a code b");
  assert.equal(painted("![foo\nbar](https://example.com/a.png)").alt, "foo bar");
  assert.equal(painted("![foo  \nbar](https://example.com/a.png)").alt, "foo bar");
  assert.equal(painted("![foo\\\nbar](https://example.com/a.png)").alt, "foo bar");
  assert.equal(painted("![foo ~~bar~~ baz](https://example.com/a.png)").alt, "foo bar baz");
  assert.equal(painted("![foo ~bar~](https://example.com/a.png)").alt, "foo ~bar~");
  assert.equal(painted("![a `](` b](https://example.com/a.png)").alt, "a ]( b");
  assert.equal(painted("![foo &copy;](https://example.com/a.png)").alt, "foo ©");
  assert.equal(painted("![a `b&amp;c` d](https://example.com/a.png)").alt, "a b&amp;c d");
  assert.equal(painted("![foo \\*bar\\*](https://example.com/a.png)").alt, "foo *bar*");

  const empty = painted("![](https://example.com/a.png)");
  assert.equal(empty.alt, "");
  assert.match(empty.html, /aria-label="Image"/);
  assert.match(empty.html, /data-fallback="https:\/\/example\.com\/a\.png"/);

  const ref = "See ![foo *bar*][img]\n\n[img]: https://example.com/a.png";
  assert.equal(painted(resolveReferenceLinks(ref, true)).alt, "foo bar");
  assert.equal(
    painted("![a `code` b](/v1/attachments/att_abc)").alt,
    "a code b",
  );
});

test("literal schemes, code, and streaming stay the original characters", () => {
  const mixed = 'Look ![foo *bar*](https://example.com/a.png "t") ![x](javascript:alert(1))';
  const prepared = prepareImageAlts(mixed, true);
  assert.match(prepared, /§§SBE[0-9A-F]+§§/);
  assert.match(prepared, /!\[x\]\(javascript:alert\(1\)\)/);
  assert.equal(
    restoreMarkdownEscapes(protectMarkdownEscapes(prepared, true)).includes("foo bar"),
    true,
  );
  const rawLiteral = "![foo *bar*](javascript:alert(1))";
  assert.equal(prepareImageAlts(rawLiteral, true), rawLiteral);
  const literal = painted(rawLiteral);
  assert.equal(literal.html.includes("<img"), false);
  assert.equal(literal.html.includes("<button"), false);
  assert.equal(literal.html.includes("foo bar"), false);

  const fence = "```\n![foo *bar*](https://example.com/a.png)\n```\n";
  assert.equal(prepareImageAlts(fence, true), fence);
  const coded = "See `![foo *bar*](https://example.com/a.png)`";
  assert.equal(prepareImageAlts(coded, true), coded);

  assert.equal(prepareImageAlts(mixed, false), mixed);
  assert.equal(prepareImageAlts("", true), "");
  const live = painted("![foo *bar*](https://example.com/a.png)", false);
  assert.equal(live.html.includes("<img"), false);
  assert.equal(live.html.includes("<button"), false);
});

test("docs, CI, and OpenAPI record v1.77 without a new route", () => {
  assert.match(src, /v1\.77/);
  assert.match(src, /flattenImageAlt/);
  assert.match(src, /prepareImageAlts/);
  assert.match(src, /stashMarkdownText/);
  assert.match(image, /prepareImageAlts/);
  assert.match(body, /prepareImageAlts\(prepareSpacedLinkDestinations/);
  assert.match(swift, /v1\.77/);
  assert.match(swift, /static func flatten/);
  assert.match(imageSwift, /MarkdownEscape\.stash/);
  assert.match(imageSwift, /prepareAlts/);
  assert.match(imageSwift, /MarkdownImageAlt\.flatten/);
  assert.match(markdown, /MarkdownImage\.prepareAlts/);
  assert.match(chat, /UIPasteboard\.general\.string = reply\.content/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
  assert.doesNotMatch(swift, /UIPasteboard/);
  assert.doesNotMatch(swift, /withAnimation/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /\/ v1\.77 /);
  assert.match(spec, /## 177\. v1\.77/);
  assert.match(spec, /image alt text in completed assistant replies/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_image_alt\.py/);
  assert.match(pkg, /markdownImageAlt\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version: 0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
