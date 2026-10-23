// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { safeLinkHref } from "./markdownAutolink.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { splitMarkdownImages } from "./markdownImage.ts";
import {
  inlineLinks,
  linkTitleHint,
  prepareLinkTitleForms,
  renderedInlineLinks,
} from "./markdownLinkTitle.ts";
import {
  commonMarkTitleHint,
  readCommonMarkTitle,
} from "./markdownLinkTitleForm.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownLinkTitleForm.ts"), "utf8");
const link = readFileSync(join(here, "markdownLinkTitle.ts"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const plain = readFileSync(join(here, "midStreamPlaintext.ts"), "utf8");
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownLinkTitleForm.swift"),
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
const runtimeOpenapi = readFileSync(join(here, "..", "..", "runtime", "openapi.yaml"), "utf8");

const PHRASE = "v1.78 CommonMark link title forms in completed assistant replies";

function renderCompleted(text: string, completed = true): string {
  const linked = resolveReferenceLinks(text, completed);
  const prepared = prepareLinkTitleForms(linked, completed);
  const source = protectMarkdownEscapes(prepared, completed);
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      urlTransform: (url: string) => url,
      components: {
        a: ({
          href,
          title,
          children,
        }: {
          href?: string;
          title?: string;
          children?: React.ReactNode;
        }) => {
          const url = safeLinkHref(restoreMarkdownEscapes(href ?? ""));
          const hint = linkTitleHint(title, completed && url.length > 0);
          if (!url) return React.createElement(React.Fragment, null, children);
          return React.createElement(
            "a",
            {
              href: url,
              title: hint || undefined,
              "aria-description": hint || undefined,
            },
            children,
          );
        },
        img: ({ alt, title }: { alt?: string; title?: string }) =>
          React.createElement("img", {
            alt,
            title: linkTitleHint(title, completed) || undefined,
          }),
      },
      children: source,
    }),
  );
}

test("quote, line break, escape, and entity titles match cmark-gfm", () => {
  assert.equal(commonMarkTitleHint("title"), "title");
  assert.equal(commonMarkTitleHint("ti\ntle"), "ti tle");
  assert.equal(commonMarkTitleHint('say \\"hi\\"'), 'say "hi"');
  assert.equal(commonMarkTitleHint("A &amp; B"), "A & B");
  assert.equal(commonMarkTitleHint("&#35;"), "#");
  assert.equal(commonMarkTitleHint("&#x22;"), '"');
  assert.equal(commonMarkTitleHint("foo\\baz"), "foo\\baz");
  assert.equal(commonMarkTitleHint("foo\\(bar\\)"), "foo(bar)");
  assert.equal(commonMarkTitleHint("&#92;&quot;"), '"');
  assert.equal(commonMarkTitleHint("&amp;amp;"), "&amp;");
  assert.equal(commonMarkTitleHint("   "), "");
  assert.equal(readCommonMarkTitle('"', 0), null);
  assert.equal(readCommonMarkTitle('"ti\n\ntle"', 0), null);
  assert.equal(readCommonMarkTitle("(foo(bar))", 0), null);
  const folded = readCommonMarkTitle('"ti\ntle"', 0);
  assert.equal(folded?.raw, "ti\ntle");
  assert.equal(folded?.next, '"ti\ntle"'.length);
});

test("inline links and images keep valid titles and drop invalid ones", () => {
  const sample = [
    '[a](/u "title")',
    "[a](/u 'title')",
    "[a](/u (title))",
    '[a](/u "ti\ntle")',
    '[a](/u "say \\"hi\\"")',
    '[a](/u "A &amp; B")',
    '[a](/u "foo\\baz")',
  ].join("\n");
  assert.deepEqual(
    inlineLinks(sample).map((link) => link.title),
    ["title", "title", "title", "ti tle", 'say "hi"', "A & B", "foo\\baz"],
  );
  assert.equal(inlineLinks('[a](/u "title "and" title")').length, 0);
  assert.equal(inlineLinks("[a](/u (foo(bar)))").length, 0);
  assert.equal(inlineLinks('[a](/u "ti\n\ntle")').length, 0);
  assert.equal(inlineLinks("[a](/u 'title\n\nmore')").length, 0);
  const nospace = inlineLinks('[a](/u"title")');
  assert.equal(nospace.length, 1);
  assert.equal(nospace[0]?.title, null);
  assert.equal(nospace[0]?.dest, '/u"title"');
  assert.equal(
    renderedInlineLinks('[docs](https://example.com/u "say \\"hi\\"")')[0]?.title,
    'say "hi"',
  );
  const pieces = splitMarkdownImages(
    [
      '![a](https://example.com/a.png "title")',
      "![b](https://example.com/b.png 'cap')",
      "![c](https://example.com/c.png (cap))",
      '![d](https://example.com/d.png "ti\ntle")',
      '![e](https://example.com/e.png "A &amp; B")',
    ].join(" "),
    true,
  );
  assert.deepEqual(
    pieces.filter((piece) => piece.type === "image").map((piece) => piece.title),
    ["title", "cap", "cap", "ti tle", "A & B"],
  );
  assert.equal(
    splitMarkdownImages('![a](https://example.com/a.png (foo(bar)))', true).some(
      (piece) => piece.type === "image",
    ),
    false,
  );
  assert.equal(
    splitMarkdownImages('![a](https://example.com/a.png "ti\n\ntle")', true).some(
      (piece) => piece.type === "image",
    ),
    false,
  );
});

test("reference definitions take a title on the next line", () => {
  const next = 'See [a].\n\n[a]: /u\n"title"\n';
  assert.match(resolveReferenceLinks(next, true), /\[a\]\(\/u "title"\)/);
  const single = "See [a].\n\n[a]: /u\n'title'\n";
  assert.match(resolveReferenceLinks(single, true), /\[a\]\(\/u "title"\)/);
  const paren = "See [a].\n\n[a]: /u\n(title)\n";
  assert.match(resolveReferenceLinks(paren, true), /\[a\]\(\/u "title"\)/);
  const indented = 'See [a].\n\n[a]: /u\n    "indented"\n';
  assert.match(resolveReferenceLinks(indented, true), /\[a\]\(\/u "indented"\)/);
  const folded = 'See [a].\n\n[a]: /u "ti\ntle"\n';
  assert.match(resolveReferenceLinks(folded, true), /\[a\]\(\/u "ti tle"\)/);
  const quoted = 'See [a].\n\n[a]: /u "say \\"hi\\""\n';
  assert.ok(resolveReferenceLinks(quoted, true).includes('[a](/u "say \\"hi\\"")'));
  const entity = 'See [a].\n\n[a]: /u "A &amp; B"\n';
  assert.match(resolveReferenceLinks(entity, true), /\[a\]\(\/u "A &#38; B"\)/);
  const slash = 'See [a].\n\n[a]: /u "foo\\baz"\n';
  assert.ok(resolveReferenceLinks(slash, true).includes('[a](/u "foo\\\\baz")'));
  const image = '![a][pic]\n\n[pic]: https://example.com/a.png\n"cap"\n';
  assert.match(
    resolveReferenceLinks(image, true),
    /!\[a\]\(https:\/\/example\.com\/a\.png "cap"\)/,
  );
  const blank = 'See [a].\n\n[a]: /u "ti\n\ntle"\n';
  assert.equal(resolveReferenceLinks(blank, true).includes("[a]:"), true);
  const bad = '[a](/u "title "and" title")\n\n[a]: /real\n';
  const resolved = resolveReferenceLinks(bad, true);
  assert.match(resolved, /\[a\]\(\/real\)/);
  assert.equal(resolved.includes("/u"), true);
  const parenBad = "[a](/u (foo(bar)))\n\n[a]: /real\n";
  assert.match(resolveReferenceLinks(parenBad, true), /\[a\]\(\/real\)/);
  const kept = "[a](/u (cap))\n\n[a]: /real\n";
  const keptOut = resolveReferenceLinks(kept, true);
  assert.match(keptOut, /\[a\]\(\/u \(cap\)\)/);
  assert.equal(keptOut.includes("/real"), false);
  assert.equal(resolveReferenceLinks(next, false), next);
});

test("prepare rewrites titles both parsers share and escapes invalid forms", () => {
  assert.equal(prepareLinkTitleForms('[a](/u "ti\ntle")'), '[a](/u "ti tle")');
  assert.equal(prepareLinkTitleForms("[a](/u 'title')"), '[a](/u "title")');
  assert.equal(prepareLinkTitleForms("[a](/u (title))"), '[a](/u "title")');
  assert.equal(prepareLinkTitleForms('[a](/u "A &amp; B")'), '[a](/u "A &#38; B")');
  assert.equal(prepareLinkTitleForms('[a](/u "say \\"hi\\"")'), '[a](/u "say \\"hi\\"")');
  assert.equal(prepareLinkTitleForms("[a](/u (foo\\(bar\\)))"), '[a](/u "foo(bar)")');
  assert.equal(prepareLinkTitleForms("[a](/u (foo(bar)))"), "\\[a](/u (foo(bar)))");
  assert.equal(prepareLinkTitleForms('[a](/u "ti\n\ntle")'), '\\[a](/u "ti\n\ntle")');
  assert.equal(
    prepareLinkTitleForms('[a](/u "title "and" title")'),
    '\\[a](/u "title "and" title")',
  );
  assert.equal(prepareLinkTitleForms('[a](/u"title")'), '[a](/u"title")');
  const coded = '`[a](/u "ti\ntle")`';
  assert.equal(prepareLinkTitleForms(coded), coded);
  const codedBad = "`[a](/u (foo(bar)))`";
  assert.equal(prepareLinkTitleForms(codedBad), codedBad);
  const fence = '```\n[a](/u "ti\ntle")\n```\n';
  assert.equal(prepareLinkTitleForms(fence), fence);
  assert.equal(prepareLinkTitleForms('[a](/u "ti\ntle")', false), '[a](/u "ti\ntle")');
  assert.equal(prepareLinkTitleForms("[a](/u (foo(bar)))", false), "[a](/u (foo(bar)))");
  assert.equal(
    prepareLinkTitleForms('![a](https://example.com/a.png "ti\ntle")'),
    '![a](https://example.com/a.png "ti tle")',
  );
  assert.equal(
    prepareLinkTitleForms("![a](https://example.com/a.png (foo(bar)))"),
    "!\\[a](https://example.com/a.png (foo(bar)))",
  );
});

test("a completed reply shows the normalized title as the tooltip", () => {
  const html = renderCompleted('[docs](https://example.com/a "ti\ntle")');
  assert.match(html, /href="https:\/\/example\.com\/a"/);
  assert.match(html, /title="ti tle"/);
  assert.match(html, /aria-description="ti tle"/);
  const single = renderCompleted("[docs](https://example.com/b 'source')");
  assert.match(single, /title="source"/);
  const paren = renderCompleted("[docs](https://example.com/c (paren tip))");
  assert.match(paren, /title="paren tip"/);
  const quoted = renderCompleted('[docs](https://example.com/a "say \\"hi\\"")');
  assert.match(quoted, /title="say &quot;hi&quot;"/);
  const entity = renderCompleted('[docs](https://example.com/a "A &amp; B")');
  assert.match(entity, /title="A &amp; B"/);
  const slash = renderCompleted('[docs](https://example.com/a "foo\\baz")');
  assert.match(slash, /title="foo\\baz"/);
  const invalid = renderCompleted('[docs](https://example.com/a "title "and" title")');
  assert.doesNotMatch(invalid, /<a /);
  const parenBad = renderCompleted("[docs](https://example.com/a (foo(bar)))");
  assert.doesNotMatch(parenBad, /<a /);
  const badImage = renderCompleted("![cat](https://example.com/a.png (foo(bar)))");
  assert.doesNotMatch(badImage, /<img /);
  const blank = renderCompleted('[docs](https://example.com/a "ti\n\ntle")');
  assert.doesNotMatch(blank, /<a /);
  const ref = renderCompleted('See [docs].\n\n[docs]: https://example.com/guide\n"Guide title"\n');
  assert.match(ref, /title="Guide title"/);
  assert.match(ref, />docs</);
  const image = renderCompleted('![cat](https://example.com/a.png "ti\ntle")');
  assert.match(image, /title="ti tle"/);
  const streaming = renderCompleted('[docs](https://example.com/a "API")', false);
  assert.doesNotMatch(streaming, /title=/);
});

test("docs, copy, and OpenAPI stay on the v1.78 path", () => {
  assert.match(src, /export function readCommonMarkTitle/);
  assert.match(src, /No new HTTP/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.match(link, /export function prepareLinkTitleForms/);
  assert.match(body, /prepareLinkTitleForms\(/);
  assert.match(app, /copyText\(reply\.content\)/);
  assert.match(plain, /return opts\.completed/);
  assert.match(swift, /static func read/);
  assert.match(swift, /&#38;/);
  assert.match(markdown, /MarkdownLinkTitle\.prepare\(/);
  assert.match(markdown, /prepareSpacedDestinations\(self\.source, completed: completed\)/);
  assert.ok(roadmap.includes(PHRASE));
  assert.match(roadmap, /\/ v1\.78 /);
  assert.match(spec, /## 178\. v1\.78/);
  assert.match(spec, /CommonMark link title forms in completed assistant replies/);
  assert.match(ci, /python3 ios\/scripts\/test_ios_markdown_link_title_form\.py/);
  assert.match(pkg, /markdownLinkTitleForm\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(swift, /computerPane\.ts/);
});
