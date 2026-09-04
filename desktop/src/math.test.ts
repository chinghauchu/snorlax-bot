// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  extractMath,
  fenceRanges,
  renderKatex,
  shouldRenderMath,
  splitMathTokens,
} from "./math.ts";
import { shouldRenderMermaid } from "./mermaid.ts";
import { spokenText } from "./speak.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const mathSrc = readFileSync(join(here, "math.ts"), "utf8");
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

test("inline \\( \\) and block $$ render on completed LEFT kind=message", () => {
  const inline = extractMath("Energy is \\( E = mc^2 \\) today.");
  assert.equal(inline.slots.length, 1);
  assert.equal(inline.slots[0]?.kind, "inline");
  assert.equal(inline.slots[0]?.closed, true);
  assert.match(inline.slots[0]?.tex ?? "", /E = mc\^2/);
  assert.match(inline.slots[0]?.raw ?? "", /\\\(/);
  assert.match(inline.slots[0]?.raw ?? "", /\\\)/);

  const blockMath = extractMath("See\n\n$$\nx = 1\n$$\n\ndone.");
  assert.equal(blockMath.slots.length, 1);
  assert.equal(blockMath.slots[0]?.kind, "block");
  assert.equal(blockMath.slots[0]?.closed, true);
  assert.match(blockMath.slots[0]?.tex ?? "", /x = 1/);
  assert.match(blockMath.slots[0]?.raw ?? "", /\$\$/);

  const oneLine = extractMath("$$\n\\frac{1}{2}\n$$");
  assert.equal(oneLine.slots[0]?.kind, "block");
  assert.equal(oneLine.slots[0]?.closed, true);

  assert.equal(shouldRenderMath({ completed: true, closed: true }), true);
  assert.equal(shouldRenderMath({ completed: false, closed: true }), false);
  assert.equal(shouldRenderMath({ completed: true, closed: false }), false);

  const html = renderKatex("E = mc^2", false);
  assert.ok(html && html.includes("katex"));
  const display = renderKatex("x = 1", true);
  assert.ok(display && display.includes("katex"));

  assert.match(app, /<MarkdownBody/);
  assert.match(app, /completed=\{!\(busy && index === liveAssistantIdx\)\}/);
  assert.match(body, /extractMath/);
  assert.match(body, /shouldRenderMath/);
  assert.match(body, /renderKatex/);
  assert.match(body, /MathNode/);
  assert.match(mathSrc, /from "katex"/);
  assert.match(pkg, /"katex"/);
  const main = readFileSync(join(here, "main.tsx"), "utf8");
  assert.match(main, /katex\/dist\/katex\.min\.css/);
});

test("single-dollar currency is not math; \\[ \\] stays strict", () => {
  const money = extractMath("That costs $5 and $10 tomorrow.");
  assert.equal(money.slots.length, 0);
  assert.equal(money.text, "That costs $5 and $10 tomorrow.");
  const mid = extractMath("Price is $20.");
  assert.equal(mid.slots.length, 0);
  const displayBrackets = extractMath("Keep \\[ x = 1 \\] as text.");
  assert.equal(
    displayBrackets.slots.filter((slot) => slot.kind === "block").length,
    0,
  );
  assert.doesNotMatch(mathSrc, /singleDollarTextMath/);
  assert.doesNotMatch(mathSrc, /remark-math/);
});

test("math is skipped inside fences and inline code", () => {
  const fenced = extractMath("```js\nconst x = `\\( a \\)`\n$$\nb\n$$\n```\n");
  assert.equal(fenced.slots.length, 0);
  const mermaid = extractMath("```mermaid\ngraph TD; A-->B;\n```");
  assert.equal(mermaid.slots.length, 0);
  const inlineCode = extractMath("Use `\\( x \\)` as code.");
  assert.equal(inlineCode.slots.length, 0);
  assert.ok(fenceRanges("```mermaid\ngraph TD; A-->B;\n```").length >= 1);
});

test("invalid math falls back to readable monospace source; never blank", () => {
  assert.equal(renderKatex("\\notavalid{math", false), null);
  assert.equal(renderKatex("   ", true), null);
  const open = extractMath("Hello \\( E = mc^2");
  assert.equal(open.slots[0]?.closed, false);
  assert.match(open.slots[0]?.raw ?? "", /\\\(/);
  assert.match(body, /md-math-fallback/);
  assert.match(body, /slot\.raw/);
  assert.match(mathSrc, /catch \{/);
  assert.match(mathSrc, /return null/);
  const fallback = block(".md-math-fallback");
  assert.match(fallback, /font-family:\s*ui-monospace/);
  assert.match(fallback, /font-size:\s*13px/);
});

test("block math is full-turn width and scrolls; no separate card", () => {
  const mathBlock = block(".md-math-block");
  assert.match(mathBlock, /width:\s*100%/);
  assert.match(mathBlock, /overflow-x:\s*auto/);
  assert.doesNotMatch(body, /md-math-card/);
  assert.doesNotMatch(css, /\n\.md-math-card \{/);
  assert.doesNotMatch(body, /rehype-raw/);
  assert.match(body, /className="md-math-block"/);
  assert.match(css, /color:\s*var\(--text\)/);
});

test("tool, widget, connect, approve, thinking, user-right stay non-math", () => {
  const userStart = app.indexOf('className="bubble user"');
  const userEnd = app.indexOf("assistant-md", userStart);
  const userBranch = app.slice(
    userStart,
    userEnd > 0 ? userEnd : userStart + 2500,
  );
  assert.match(userBranch, /<pre>/);
  assert.doesNotMatch(userBranch, /MarkdownBody/);
  assert.doesNotMatch(userBranch, /extractMath/);
  assert.doesNotMatch(userBranch, /MathNode/);
  const widgetSlice = app.slice(app.indexOf("isWidget(message)"));
  assert.doesNotMatch(widgetSlice.slice(0, 400), /MarkdownBody/);
  assert.match(app, /isToolLine\(message\)/);
  assert.match(app, /<WidgetCard/);
  assert.match(app, /<ConnectCard/);
  assert.match(app, /<ApproveCard/);
  assert.match(app, /showThinking/);
});

test("mermaid still works unchanged on LEFT kind=message", () => {
  assert.equal(shouldRenderMermaid({ language: "mermaid", completed: true }), true);
  assert.equal(
    shouldRenderMermaid({ language: "mermaid", completed: false }),
    false,
  );
  assert.match(body, /shouldRenderMermaid/);
  assert.match(body, /MermaidFence/);
  assert.match(mermaidSrc, /import\("mermaid"\)/);
  assert.match(mermaidSrc, /securityLevel:\s*"strict"/);
  const mixed = extractMath(
    "A \\( x \\)\n\n```mermaid\ngraph TD; A-->B;\n```\n\n$$\ny=1\n$$",
  );
  assert.equal(mixed.slots.length, 2);
  assert.equal(mixed.slots[0]?.kind, "inline");
  assert.equal(mixed.slots[1]?.kind, "block");
  assert.match(mixed.text, /```mermaid/);
});

test("Speak treats math like other markup (plain source)", () => {
  assert.equal(spokenText("Energy is \\( E = mc^2 \\)."), "Energy is E = mc^2 .");
  assert.equal(spokenText("$$\nx = 1\n$$"), "x = 1");
  assert.equal(
    spokenText("```mermaid\ngraph TD; A-->B;\n```"),
    "graph TD; A-->B;",
  );
  assert.doesNotMatch(spokenText("\\( E = mc^2 \\)"), /Speak|Stop|image/i);
  assert.doesNotMatch(spokenText("$$\nx=1\n$$"), /diagram|formula image/i);
});

test("OpenAPI stays 0.18.0; no computerPane.ts; no new routes", () => {
  assert.match(openapi, /version:\s*0\.18\.0/);
  assert.match(protocol, /version:\s*0\.18\.0/);
  assert.match(runtimeOpenapi, /version:\s*0\.18\.0/);
  assert.match(openapi, /v0\.46/);
  assert.match(protocol, /v0\.46/);
  assert.match(runtimeOpenapi, /v0\.46/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(mathSrc, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(mathSrc, /\/v1\/math/);
  assert.doesNotMatch(mathSrc, /\/v1\/katex/);
  assert.doesNotMatch(app, /\/v1\/math/);
  assert.doesNotMatch(mathSrc, /cdn\.jsdelivr/);
  assert.doesNotMatch(mathSrc, /cdnjs/);
  const pieces = splitMathTokens("hi §§SBMI0§§ there");
  assert.equal(pieces[0]?.type, "text");
  assert.equal(pieces[1]?.type, "math");
  assert.equal(pieces[1]?.kind, "inline");
});
