// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isMermaidLanguage } from "./markdown.ts";
import { shouldRenderMermaid } from "./mermaid.ts";
import { spokenText } from "./speak.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const mermaidSrc = readFileSync(join(here, "mermaid.ts"), "utf8");
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

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("mermaid language tag is exact mermaid (case-insensitive)", () => {
  assert.equal(isMermaidLanguage("mermaid"), true);
  assert.equal(isMermaidLanguage("MERMAID"), true);
  assert.equal(isMermaidLanguage("Mermaid"), true);
  assert.equal(isMermaidLanguage(" mermaid "), true);
  assert.equal(isMermaidLanguage("js"), false);
  assert.equal(isMermaidLanguage("typescript"), false);
  assert.equal(isMermaidLanguage("mermaid graph"), false);
  assert.equal(isMermaidLanguage(""), false);
  assert.equal(isMermaidLanguage(undefined), false);
});

test("mermaid renders only on completed LEFT kind=message fences", () => {
  assert.equal(shouldRenderMermaid({ language: "mermaid", completed: true }), true);
  assert.equal(
    shouldRenderMermaid({ language: "mermaid", completed: false }),
    false,
  );
  assert.equal(shouldRenderMermaid({ language: "js", completed: true }), false);
  assert.match(app, /<MarkdownBody/);
  assert.match(app, /completed=\{!\(busy && index === liveAssistantIdx\)\}/);
  assert.match(body, /shouldRenderMermaid/);
  assert.match(body, /MermaidFence/);
  assert.match(body, /renderMermaidSvg/);
  assert.match(mermaidSrc, /import\("mermaid"\)/);
  assert.match(mermaidSrc, /securityLevel:\s*"strict"/);
  assert.match(pkg, /"mermaid"/);
});

test("non-mermaid fences keep language + Copy + mono body", () => {
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
  assert.match(copy, /font-size:\s*12px/);
  assert.match(body, /className="md-copy"/);
  assert.match(body, />\s*Copy\s*</);
  assert.match(body, /FenceChrome/);
  assert.doesNotMatch(body, /rehype-raw/);
});

test("mermaid chrome reuses fence family; SVG scrolls horizontally", () => {
  const mermaidBody = block(".md-mermaid-body");
  const mermaidSvg = block(".md-mermaid-body svg");
  assert.match(mermaidBody, /overflow-x:\s*auto/);
  assert.match(mermaidSvg, /max-width:\s*none/);
  assert.match(body, /className="md-fence"/);
  assert.match(body, /className="md-mermaid-body"/);
  assert.doesNotMatch(body, /md-mermaid-card/);
  assert.doesNotMatch(css, /\n\.md-mermaid-card \{/);
});

test("invalid mermaid falls back to fence chrome; never blank", () => {
  assert.match(body, /if \(!svg\)/);
  assert.match(body, /<FenceChrome language=\{language\} source=\{source\}/);
  assert.match(mermaidSrc, /catch \{/);
  assert.match(mermaidSrc, /return null/);
});

test("tool, widget, connect, approve, thinking, user-right stay non-mermaid", () => {
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(
    userStart,
    userEnd > 0 ? userEnd : userStart + 2500,
  );
  assert.match(userBranch, /<pre>/);
  assert.doesNotMatch(userBranch, /MarkdownBody/);
  assert.doesNotMatch(userBranch, /MermaidFence/);
  const widgetSlice = app.slice(app.indexOf("isWidget(message)"));
  assert.doesNotMatch(widgetSlice.slice(0, 400), /MarkdownBody/);
  assert.match(app, /isToolLine\(message\)/);
  assert.match(app, /<WidgetCard/);
  assert.match(app, /<ConnectCard/);
  assert.match(app, /<ApproveCard/);
  assert.match(app, /showThinking/);
});

test("Speak treats mermaid fences like other fences", () => {
  assert.equal(
    spokenText("```mermaid\ngraph TD; A-->B;\n```"),
    "graph TD; A-->B;",
  );
  assert.equal(spokenText("```ts\nconst x = 1;\n```"), "const x = 1;");
  assert.doesNotMatch(spokenText("```mermaid\ngraph TD; A-->B;\n```"), /diagram|Speak|Stop/i);
});

test("OpenAPI stays 0.18.0; no computerPane.ts; no new routes", () => {
  assert.match(openapi, /version:\s*0\.18\.0/);
  assert.match(protocol, /version:\s*0\.18\.0/);
  assert.match(runtimeOpenapi, /version:\s*0\.18\.0/);
  assert.match(openapi, /v0\.45/);
  assert.match(protocol, /v0\.45/);
  assert.match(runtimeOpenapi, /v0\.45/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(mermaidSrc, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(mermaidSrc, /\/v1\/mermaid/);
  assert.doesNotMatch(app, /\/v1\/mermaid/);
});
