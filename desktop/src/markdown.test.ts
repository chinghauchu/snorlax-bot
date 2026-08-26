// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isSafeHttpsUrl, stabilizeMarkdown } from "./markdown.ts";

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
});

test("assistant kind=message is 14px markdown with no grey bubble", () => {
  const md = block(".assistant-md");
  assert.match(md, /font-size:\s*14px/);
  assert.match(md, /line-height:\s*1\.4/);
  assert.doesNotMatch(md, /background:\s*var\(--bubble\)/);
  assert.doesNotMatch(md, /border-radius:\s*14px/);
  assert.match(app, /MarkdownBody/);
  assert.match(app, /className="assistant-md"/);
  assert.doesNotMatch(app, /bubble \$\{mine \? "user" : "agent"\}/);
  assert.match(app, /className="bubble user"/);
});

test("user-right bubble stays plain text, not markdown", () => {
  const user = block(".bubble.user");
  assert.match(user, /color-mix\(in srgb,\s*var\(--accent\)\s+28%/);
  assert.match(app, /className="bubble user"/);
  const userBranch = app.slice(app.indexOf('className="bubble user"'));
  assert.match(userBranch, /<pre>/);
  assert.match(userBranch, /MentionText/);
  assert.doesNotMatch(userBranch.slice(0, 800), /MarkdownBody/);
  assert.doesNotMatch(body, /rehype-raw/);
  assert.match(body, /react-markdown/);
});

test("fenced code is 8px radius, 12px mono, with a Copy control", () => {
  const fence = block(".md-fence");
  const pre = block(".md-fence-body");
  const copy = block(".md-copy");
  assert.match(fence, /border-radius:\s*8px/);
  assert.match(pre, /font-size:\s*12px/);
  assert.match(pre, /font-family:\s*ui-monospace/);
  assert.match(copy, /font-size:\s*12px/);
  assert.match(body, /className="md-copy"/);
  assert.match(body, />\s*Copy\s*</);
  assert.match(body, /className="md-copy"/);
  assert.match(body, /copyText/);
});

test("https links are accent; inline code uses mention-chip tint", () => {
  const link = block(".assistant-md a.md-link");
  const inline = block(".assistant-md code");
  const chip = block(".mention-chip");
  assert.match(link, /color:\s*var\(--accent\)/);
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

test("tool, widget, connect, thinking, and handoff chrome are unchanged", () => {
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
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
