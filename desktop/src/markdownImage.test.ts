// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React, { createContext, useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { remarkStrikethrough } from "./markdownBreak.ts";
import { protectMarkdownEscapes, restoreMarkdownEscapes } from "./markdownEscape.ts";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak.ts";
import {
  imageFallbackLabel,
  imageRenderPlan,
  imageSourceKind,
  neutralizeUnsafeImages,
  splitMarkdownImages,
} from "./markdownImage.ts";
import { resolveReferenceLinks } from "./markdownReferenceLink.ts";
import { splitMarkdownTables } from "./markdownTable.ts";
import { extractMath } from "./math.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "markdownImage.ts"), "utf8");
const view = readFileSync(join(here, "markdownImageView.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const swift = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "MarkdownImage.swift"), "utf8");
const markdown = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"), "utf8");
const chat = readFileSync(join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"), "utf8");
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const spec = readFileSync(join(here, "..", "..", "docs", "specs", "v0.1-chat-and-agents.md"), "utf8");
const ci = readFileSync(join(here, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
const pkg = readFileSync(join(here, "..", "package.json"), "utf8");
const openapi = readFileSync(join(here, "..", "openapi.yaml"), "utf8");
const protocol = readFileSync(join(here, "..", "..", "protocol", "openapi.yaml"), "utf8");
const runtimeOpenapi = readFileSync(join(here, "..", "..", "runtime", "openapi.yaml"), "utf8");

const PHRASE = "v1.42 CommonMark inline images in completed assistant replies";

const InLink = createContext(false);

function HtmlImage({
  alt,
  src,
  title,
  completed,
}: {
  alt?: string;
  src?: string;
  title?: string;
  completed: boolean;
}) {
  const inLink = useContext(InLink);
  const plan = imageRenderPlan(
    completed,
    restoreMarkdownEscapes(typeof alt === "string" ? alt : ""),
    restoreMarkdownEscapes(typeof src === "string" ? src : ""),
    restoreMarkdownEscapes(typeof title === "string" ? title : ""),
  );
  if (plan.type === "hidden") return null;
  if (plan.type === "alt" || plan.type === "literal") {
    return React.createElement("span", null, plan.text);
  }
  const label = plan.alt.trim() || "Image";
  const img = React.createElement("img", {
    className: "md-inline-image",
    "data-state": "loading",
    src: plan.src,
    title: plan.title || undefined,
  });
  const frame = React.createElement(
    "span",
    { className: "md-image" },
    React.createElement("span", { className: "md-image-pending" }),
    img,
  );
  if (inLink) return frame;
  return React.createElement(
    "button",
    { type: "button", className: "md-image-btn", "aria-label": label, title: plan.title || undefined },
    frame,
  );
}

function renderMarkdown(text: string, completed: boolean): string {
  const extracted = extractMath(text);
  const mathText = neutralizeUnsafeImages(extracted.text, completed);
  const source = applyHardLineBreaks(protectMarkdownEscapes(mathText, completed), completed);
  return renderToStaticMarkup(
    React.createElement(Markdown, {
      remarkPlugins: completed ? [remarkHardBreaks, remarkStrikethrough] : [],
      urlTransform: (url: string) => url,
      components: {
        a: ({ href, children }) =>
          React.createElement(
            "a",
            { href },
            React.createElement(InLink.Provider, { value: true }, children),
          ),
        img: (props) =>
          React.createElement(HtmlImage, {
            alt: props.alt,
            src: typeof props.src === "string" ? props.src : "",
            title: props.title,
            completed,
          }),
      },
      children: source,
    }),
  );
}

function html(text: string, completed = true): string {
  const parts = splitMarkdownTables(text, completed);
  return parts
    .map((part) => {
      if (part.type === "table") {
        const cells = [...part.table.header, ...part.table.rows.flat()];
        return cells.map((cell) => renderMarkdown(cell, completed)).join("");
      }
      return renderMarkdown(part.text, completed);
    })
    .join("");
}

function shown(markup: string): string {
  return restoreMarkdownEscapes(markup.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

test("http(s) and local attachment paths load; other schemes do not", () => {
  assert.equal(imageSourceKind("https://example.com/a.png"), "remote");
  assert.equal(imageSourceKind("http://example.com/a.png"), "remote");
  assert.equal(imageSourceKind("HTTPS://example.com/a.png"), "remote");
  assert.equal(imageSourceKind("/v1/attachments/att_abc"), "attachment");
  assert.equal(imageSourceKind("/v1/images/img_abc"), "attachment");
  assert.equal(imageSourceKind("javascript:alert(1)"), "literal");
  assert.equal(imageSourceKind("data:image/png;base64,aaaa"), "literal");
  assert.equal(imageSourceKind("file:///tmp/a.png"), "literal");
  assert.equal(imageSourceKind("ftp://example.com/a.png"), "literal");
  assert.equal(imageSourceKind("/tmp/a.png"), "literal");
  assert.equal(imageSourceKind(""), "literal");
  assert.equal(imageFallbackLabel("cat", "https://example.com/a.png"), "cat");
  assert.equal(imageFallbackLabel("  ", "https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(imageFallbackLabel("", "/v1/attachments/att_abc"), "/v1/attachments/att_abc");
});

test("a completed reply renders an inline image with alt, title, and the lightbox button", () => {
  const markup = html('Look ![cat](https://example.com/a.png "diagram") here');
  assert.match(markup, /class="md-image-btn"/);
  assert.match(markup, /aria-label="cat"/);
  assert.match(markup, /title="diagram"/);
  assert.match(markup, /class="md-inline-image"/);
  assert.match(markup, /src="https:\/\/example\.com\/a\.png"/);
  assert.match(markup, /class="md-image-pending"/);
  assert.match(markup, /data-state="loading"/);
  assert.doesNotMatch(markup, /!\[cat\]/);
  const plain = html("![](https://example.com/a.png)");
  assert.match(plain, /aria-label="Image"/);
  const angled = html("![cat](<https://example.com/a.png> 'Cat')");
  assert.match(angled, /src="https:\/\/example\.com\/a\.png"/);
  assert.match(angled, /title="Cat"/);
});

test("reference images reuse v1.39 and render after the definition is removed", () => {
  const source = 'See ![cat][pic]\n\n[pic]: https://example.com/a.png "diagram"';
  const resolved = resolveReferenceLinks(source, true);
  assert.match(resolved, /!\[cat\]\(https:\/\/example\.com\/a\.png "diagram"\)/);
  const markup = html(resolved);
  assert.match(markup, /src="https:\/\/example\.com\/a\.png"/);
  assert.match(markup, /aria-label="cat"/);
  assert.match(markup, /title="diagram"/);
  assert.doesNotMatch(markup, /\[pic\]:/);
});

test("an image that is a link opens the link, not the lightbox button", () => {
  const markup = html("[![cat](https://example.com/a.png)](https://example.com/go)");
  assert.match(markup, /<a [^>]*href="https:\/\/example\.com\/go"/);
  assert.match(markup, /src="https:\/\/example\.com\/a\.png"/);
  assert.doesNotMatch(markup, /md-image-btn/);
  const mixed = html("[see ![cat](https://example.com/a.png) now](https://example.com/go)");
  assert.match(mixed, /href="https:\/\/example\.com\/go"/);
  assert.match(mixed, /src="https:\/\/example\.com\/a\.png"/);
  assert.doesNotMatch(mixed, /md-image-btn/);
});

test("other schemes stay literal, including inside a link", () => {
  const markup = html("Nope ![cat](javascript:alert(1)) and ![x](data:image/png,xx)");
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /md-image-btn/);
  assert.match(shown(markup), /!\[cat\]\(javascript:alert\(1\)\)/);
  assert.match(shown(markup), /!\[x\]\(data:image\/png,xx\)/);
  const linked = html("[![cat](javascript:alert(1))](https://example.com/go)");
  assert.doesNotMatch(linked, /<img/);
  assert.match(linked, /href="https:\/\/example\.com\/go"/);
  assert.match(shown(linked), /!\[cat\]\(javascript:alert\(1\)\)/);
});

test("code, indented code, math, and table code cells stay literal", () => {
  const span = html("Use `![cat](https://example.com/a.png)` in code");
  assert.doesNotMatch(span, /<img/);
  assert.match(span, /!\[cat\]\(https:\/\/example\.com\/a\.png\)/);
  const fence = html("```\n![cat](https://example.com/a.png)\n```");
  assert.doesNotMatch(fence, /<img/);
  assert.match(fence, /!\[cat\]\(https:\/\/example\.com\/a\.png\)/);
  const indented = html("\n    ![cat](https://example.com/a.png)\n");
  assert.doesNotMatch(indented, /<img/);
  const math = html("See \\( ![cat](https://example.com/a.png) \\)");
  assert.doesNotMatch(math, /<img/);
  const cell = html(
    ["| Item |", "| --- |", "| `![cat](https://example.com/a.png)` |"].join("\n"),
  );
  assert.doesNotMatch(cell, /<img/);
  assert.match(cell, /!\[cat\]\(https:\/\/example\.com\/a\.png\)/);
  const tableImage = html(
    ["| Item |", "| --- |", "| ![cat](https://example.com/a.png) |"].join("\n"),
  );
  assert.match(tableImage, /src="https:\/\/example\.com\/a\.png"/);
});

test("streaming stays plain and unsafe markers are escaped before the parser", () => {
  assert.equal(neutralizeUnsafeImages("![cat](javascript:alert(1))", false), "![cat](javascript:alert(1))");
  const masked = neutralizeUnsafeImages("![cat](javascript:alert(1))", true);
  assert.match(masked, /\\!\\\[cat\\\]/);
  assert.equal(
    restoreMarkdownEscapes(protectMarkdownEscapes(masked, true)),
    "![cat](javascript:alert(1))",
  );
  const safe = neutralizeUnsafeImages("![cat](https://example.com/a.png)", true);
  assert.equal(safe, "![cat](https://example.com/a.png)");
  const streaming = html("![cat](https://example.com/a.png)", false);
  assert.doesNotMatch(streaming, /<img/);
  assert.match(shown(streaming), /^cat$/);
  const pieces = splitMarkdownImages("See ![cat](https://example.com/a.png) now", true);
  assert.equal(pieces[0]?.type, "text");
  assert.equal(pieces[1]?.type, "image");
  if (pieces[1]?.type === "image") {
    assert.equal(pieces[1].alt, "cat");
    assert.equal(pieces[1].url, "https://example.com/a.png");
    assert.equal(pieces[1].link, null);
  }
  const wrapped = splitMarkdownImages(
    "[![cat](https://example.com/a.png)](https://example.com/go)",
    true,
  );
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0]?.type, "image");
  if (wrapped[0]?.type === "image") assert.equal(wrapped[0].link, "https://example.com/go");
  const coded = splitMarkdownImages("`![cat](https://example.com/a.png)`", true);
  assert.equal(coded.length, 1);
  assert.equal(coded[0]?.type, "text");
  assert.equal(splitMarkdownImages("![cat](https://example.com/a.png)", false)[0]?.type, "text");
});

test("attachment images use the session fetch and the lightbox, with a muted fallback", () => {
  assert.match(view, /imageFallbackLabel/);
  assert.match(view, /md-image-fallback/);
  assert.match(view, /md-image-pending/);
  assert.match(view, /onError=\{\(\) => setPhase\("error"\)\}/);
  assert.match(view, /resolveMediaUrl/);
  assert.match(view, /Authorization/);
  assert.match(view, /InMarkdownLinkContext/);
  assert.match(view, /kind === "attachment"/);
  assert.match(view, /onOpenImage/);
  assert.match(body, /neutralizeUnsafeImages/);
  assert.match(body, /markdownImageNode/);
  assert.match(body, /urlTransform=\{\(url\) => url\}/);
  assert.equal(body.split("urlTransform={(url) => url}").length - 1, 3);
  assert.match(app, /onOpenImage=\{openImageLightbox\}/);
  assert.match(app, /session=\{session\}/);
  assert.match(css, /\.assistant-md \.md-inline-image \{/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /height:\s*auto/);
  assert.match(css, /\.md-image-pending/);
  assert.match(css, /\.md-image-fallback/);
  assert.match(css, /text-decoration:\s*underline/);
  assert.doesNotMatch(css, /md-inline-image[\s\S]{0,200}animation:/);
});

test("docs, both clients, and OpenAPI 0.18.0", () => {
  assert.match(src, /export function imageSourceKind/);
  assert.match(src, /export function splitMarkdownImages/);
  assert.match(src, /Keep in lockstep with `ios\/SnorlaxBot\/MarkdownImage.swift`/);
  assert.match(swift, /static func split\(_ text: String, completed: Bool = true\)/);
  assert.match(swift, /static func sourceKind/);
  assert.match(swift, /\/v1\/attachments\//);
  assert.match(swift, /\/v1\/images\//);
  assert.match(swift, /MarkdownInlineImage/);
  assert.match(swift, /tertiarySystemFill/);
  assert.match(swift, /ImageLightbox\.Target/);
  assert.match(markdown, /MarkdownImage\.split/);
  assert.match(chat, /markdownImageOpen/);
  assert.equal(swift.includes("withAnimation"), false);
  assert.equal(swift.includes("computerPane.ts"), false);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.match(roadmap, new RegExp(PHRASE));
  assert.match(roadmap, /\/ v1\.42 /);
  assert.match(spec, /## 142\. v1\.42/);
  assert.match(ci, /test_ios_markdown_image\.py/);
  assert.match(pkg, /markdownImage\.test\.ts/);
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(protocol, /version: 0\.19/);
  assert.equal(src.includes("copyText"), false);
  assert.equal(view.includes("/v1/markdown"), false);
});
