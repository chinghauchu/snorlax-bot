// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  fenceLanguage,
  isSafeHttpsUrl,
  splitHttpsUrls,
  stabilizeMarkdown,
} from "./markdown.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("stabilizeMarkdown closes an open fence so streamed deltas keep rendering", () => {
  const open = "hello\n```js\nconst x = 1";
  const closed = stabilizeMarkdown(open);
  assert.match(closed, /```\s*$/);
  assert.equal(stabilizeMarkdown("```\nok\n```"), "```\nok\n```");
  assert.equal(stabilizeMarkdown("no fences"), "no fences");
});

test("only https:// URLs are safe to open", () => {
  assert.equal(isSafeHttpsUrl("https://example.com/a"), true);
  assert.equal(isSafeHttpsUrl("http://example.com"), false);
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("data:text/html,hi"), false);
  assert.equal(isSafeHttpsUrl("/relative"), false);
  assert.equal(isSafeHttpsUrl(undefined), false);
  assert.equal(fenceLanguage("language-js"), "js");
  assert.equal(fenceLanguage("language-C++"), "C++");
  const links = splitHttpsUrls("see https://example.com/a, please");
  assert.equal(links[0]?.type, "text");
  assert.equal(links[1]?.type, "link");
  assert.equal(links[1]?.value, "https://example.com/a");
});

test("assistant kind=message is 14px markdown with no grey bubble", () => {
  const md = block(".assistant-md");
  const left = block(".turn.left");
  assert.match(md, /font-size:\s*14px/);
  assert.match(md, /line-height:\s*1\.4/);
  assert.match(md, /width:\s*100%/);
  assert.doesNotMatch(md, /background:\s*var\(--bubble\)/);
  assert.doesNotMatch(md, /border-radius:\s*14px/);
  assert.match(left, /width:\s*100%/);
  assert.match(app, /MarkdownBody/);
  assert.match(app, /className="assistant-md"/);
  assert.doesNotMatch(app, /bubble \$\{mine \? "user" : "agent"\}/);
  assert.match(app, /className="bubble user"/);
});

test("headings are 16/14, lists and bold stay markdown", () => {
  const h1 = block(".assistant-md h1");
  const h2 = block(".assistant-md h2");
  const lists = block(".assistant-md ul");
  assert.match(h1, /font-size:\s*16px/);
  assert.match(h2, /font-size:\s*14px/);
  assert.match(lists, /padding-left:\s*1\.2em/);
  assert.match(body, /h1:/);
  assert.match(body, /mentionify/);
});

test("user-right bubble stays plain text, https links tappable", () => {
  const user = block(".bubble.user");
  const link = block(".bubble.user a.md-link");
  const hover = block(".bubble.user a.md-link:hover");
  assert.match(user, /color-mix\(in srgb,\s*var\(--accent\)\s+28%/);
  assert.match(app, /className="bubble user"/);
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(
    userStart,
    userEnd > 0 ? userEnd : userStart + 2500,
  );
  assert.match(userBranch, /<pre>/);
  assert.match(userBranch, /MentionText/);
  assert.match(userBranch, /links/);
  assert.doesNotMatch(userBranch, /MarkdownBody/);
  assert.match(link, /color:\s*var\(--accent\)/);
  assert.match(hover, /text-decoration:\s*underline/);
  assert.doesNotMatch(body, /rehype-raw/);
  assert.match(body, /react-markdown/);
});

test("fenced code is full-turn 8px, elevated, language + Copy, 12px/1.45", () => {
  const fence = block(".md-fence");
  const bar = block(".md-fence-bar");
  const lang = block(".md-fence-lang");
  const pre = block(".md-fence-body");
  const copy = block(".md-copy");
  assert.match(fence, /width:\s*100%/);
  assert.match(fence, /border-radius:\s*8px/);
  assert.match(fence, /border:\s*1px\s+solid\s+var\(--border\)/);
  assert.match(fence, /background:\s*var\(--bg-elevated\)/);
  assert.match(bar, /display:\s*flex/);
  assert.match(lang, /font-size:\s*12px/);
  assert.match(lang, /color:\s*var\(--text-muted\)/);
  assert.match(pre, /font-size:\s*12px/);
  assert.match(pre, /line-height:\s*1\.45/);
  assert.match(pre, /overflow-x:\s*auto/);
  assert.match(pre, /font-family:\s*ui-monospace/);
  assert.match(copy, /font-size:\s*12px/);
  assert.match(body, /className="md-copy"/);
  assert.match(body, />\s*Copy\s*</);
  assert.match(body, /md-fence-lang/);
  assert.match(body, /fenceLanguage/);
});

test("https links are accent with hover underline; inline code is 13px chip", () => {
  const link = block(".assistant-md a.md-link");
  const hover = block(".assistant-md a.md-link:hover");
  const inline = block(".assistant-md code");
  const chip = block(".mention-chip");
  assert.match(link, /color:\s*var\(--accent\)/);
  assert.match(hover, /text-decoration:\s*underline/);
  assert.match(inline, /font-size:\s*13px/);
  assert.match(inline, /border-radius:\s*4px/);
  assert.match(inline, /color:\s*var\(--accent\)/);
  assert.match(
    inline,
    /background:\s*color-mix\(in srgb,\s*var\(--accent\)\s+18%/,
  );
  assert.match(
    chip,
    /background:\s*color-mix\(in srgb,\s*var\(--accent\)\s+18%/,
  );
  assert.match(body, /isSafeHttpsUrl/);
  assert.match(body, /openOsBrowser/);
  assert.match(body, /img:/);
});

test("tool, widget, connect, thinking, and handoff are not markdown", () => {
  assert.match(app, /isToolLine\(message\)/);
  assert.match(app, /<WidgetCard/);
  assert.match(app, /<ConnectCard/);
  assert.match(app, /showThinking/);
  assert.match(app, /handoff-card/);
  assert.match(css, /\n\.tool-trace \{/);
  assert.match(css, /\n\.widget-card \{/);
  assert.match(css, /\n\.connect-card \{/);
  assert.match(css, /\n\.thinking \{/);
  assert.match(css, /\n\.handoff-card \{/);
  const widgetSlice = app.slice(app.indexOf("isWidget(message)"));
  assert.doesNotMatch(widgetSlice.slice(0, 400), /MarkdownBody/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
