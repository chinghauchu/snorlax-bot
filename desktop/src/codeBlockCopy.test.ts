// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CODE_BLOCK_COPIED_ARIA,
  CODE_BLOCK_COPIED_LABEL,
  CODE_BLOCK_COPY_ARIA,
  CODE_BLOCK_COPY_LABEL,
  CODE_BLOCK_COPY_MS,
  codeBlockClipboardText,
  codeBlockCopyAnimates,
  codeBlockCopyAriaLabel,
  codeBlockCopyLabel,
  showCodeBlockCopy,
} from "./codeBlockCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(here, "MarkdownBody.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const src = readFileSync(join(here, "codeBlockCopy.ts"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");
const actions = readFileSync(join(here, "messageActions.ts"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
  "utf8",
);
const markdown = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "AssistantMarkdown.swift"),
  "utf8",
);
const swift = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "CodeBlockCopy.swift"),
  "utf8",
);
const roadmap = readFileSync(join(here, "..", "..", "ROADMAP.md"), "utf8");
const ci = readFileSync(
  join(here, "..", "..", ".github", "workflows", "ci.yml"),
  "utf8",
);
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
  "v0.66 fenced code block Copy (top-right Copy copies the code only; Copied for 1.5s then reverts; hidden while streaming; no animation; no new HTTP)";

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function reducedMotionBlocks(): string[] {
  const needle = "@media (prefers-reduced-motion: reduce)";
  const out: string[] = [];
  let from = 0;
  while (true) {
    const idx = css.indexOf(needle, from);
    if (idx < 0) break;
    const start = css.indexOf("{", idx);
    let depth = 0;
    let end = start;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push(css.slice(idx, end + 1));
    from = end + 1;
  }
  return out;
}

function sliceFn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end > start ? source.slice(start, end) : source.slice(start);
}

test("clipboard is the fence body, not the fence or language tag", () => {
  const bodyText = "const x = 1;\nconst y = 2;";
  assert.equal(codeBlockClipboardText(bodyText), bodyText);
  assert.equal(codeBlockClipboardText("  keep indent\n\n"), "  keep indent\n\n");
  assert.equal(codeBlockClipboardText(""), "");
  assert.equal(codeBlockClipboardText("```not a wrapper"), "```not a wrapper");
  assert.doesNotMatch(codeBlockClipboardText(bodyText), /```/);
  assert.equal(codeBlockClipboardText(bodyText).includes("js"), false);
  assert.equal(CODE_BLOCK_COPY_MS, 1500);
  assert.equal(CODE_BLOCK_COPY_LABEL, "Copy");
  assert.equal(CODE_BLOCK_COPIED_LABEL, "Copied");
  assert.equal(codeBlockCopyLabel(false), "Copy");
  assert.equal(codeBlockCopyLabel(true), "Copied");
  assert.equal(CODE_BLOCK_COPY_ARIA, "Copy code");
  assert.equal(CODE_BLOCK_COPIED_ARIA, "Copied");
  assert.equal(codeBlockCopyAriaLabel(false), "Copy code");
  assert.equal(codeBlockCopyAriaLabel(true), "Copied");
});

test("Copy is hidden while streaming; confirmation does not animate", () => {
  assert.equal(showCodeBlockCopy(false), false);
  assert.equal(showCodeBlockCopy(true), true);
  assert.equal(codeBlockCopyAnimates(false), false);
  assert.equal(codeBlockCopyAnimates(true), false);
  assert.match(src, /Never animate/);
  assert.match(swift, /return nil/);
  assert.match(swift, /feedbackNanoseconds: UInt64 = 1_500_000_000/);
  assert.match(swift, /copied \? copiedAria : copyAria/);
  assert.match(swift, /static func showsCopy\(completed: Bool\) -> Bool/);
});

test("desktop button is top-right, labeled, and copies the body only", () => {
  const copy = block(".md-copy");
  assert.match(copy, /margin-left:\s*auto/);
  assert.match(copy, /font-size:\s*12px/);
  assert.match(copy, /color:\s*var\(--text-muted\)/);
  assert.match(copy, /transition:\s*none/);
  assert.match(copy, /animation:\s*none/);
  const bar = block(".md-fence-bar");
  assert.match(bar, /display:\s*flex/);
  assert.match(bar, /justify-content:\s*space-between/);
  const reduce = reducedMotionBlocks().find((part) => part.includes(".md-copy"));
  assert.ok(reduce, "missing Reduce Motion rule for fence Copy");
  assert.match(reduce, /\.md-copy \{[\s\S]*transition:\s*none/);
  assert.match(reduce, /animation:\s*none/);
  assert.match(block(".md-copy:focus-visible"), /outline:/);

  const fence = sliceFn(body, "function FenceBar(", "function fenceFromChildren");
  assert.match(fence, /showCodeBlockCopy\(completed\)/);
  assert.match(fence, /codeBlockClipboardText\(source\)/);
  assert.match(fence, /codeBlockCopyLabel\(copied\)/);
  assert.match(fence, /aria-label=\{codeBlockCopyAriaLabel\(copied\)\}/);
  assert.match(fence, /aria-live="polite"/);
  assert.match(fence, /type="button"/);
  assert.match(fence, /CODE_BLOCK_COPY_MS/);
  assert.doesNotMatch(fence, /```/);
  const copyCall = fence.slice(
    fence.indexOf("function onCopy"),
    fence.indexOf("setCopied(true)"),
  );
  assert.match(copyCall, /codeBlockClipboardText\(source\)/);
  assert.doesNotMatch(copyCall, /language/);
});

test("message Copy stays beside the control; OpenAPI stays 0.18.0", () => {
  const messageActions = sliceFn(app, "function MessageActions(", "function AgentSkillRow");
  assert.match(messageActions, /COPY_CONTROL_LABEL/);
  assert.match(messageActions, /copiedFeedbackLabel\(copied\)/);
  assert.doesNotMatch(messageActions, /codeBlockCopyLabel/);
  assert.doesNotMatch(messageActions, /copied \? "Copied" : "Copy"/);
  assert.equal(actions.includes("MESSAGE_COPY_FEEDBACK_MS = 1200"), true);
  assert.doesNotMatch(chat, /1_500_000_000/);
  assert.doesNotMatch(chat, /copied \? "Copied" : "Copy"/);
  assert.match(chat, /Text\("Copied"\)/);
  assert.match(markdown, /CodeBlockCopy\.clipboardText\(source\)/);
  assert.match(markdown, /CodeBlockCopy\.showsCopy\(completed: completed\)/);
  assert.match(markdown, /accessibilityLabel\(CodeBlockCopy\.accessibilityLabel/);
  assert.match(
    markdown,
    /CodeBlockCopy\.animation\(reduceMotion: reduceMotion\)/,
  );
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(roadmap, new RegExp(PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ci, /python3 ios\/scripts\/test_ios_code_block_copy\.py/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
  assert.doesNotMatch(body, /computerPane\.ts/);
  assert.doesNotMatch(src, /\/v1\//);
  assert.doesNotMatch(swift, /\/v1\//);
});
