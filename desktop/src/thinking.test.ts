// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isTranscriptVisible } from "./mentions.ts";
import { showThinkingLine, THINKING_LABEL } from "./thinking.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const app = readFileSync(join(here, "App.tsx"), "utf8");

test("thinking line shows only while busy with no live assistant or tool", () => {
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: false,
    }),
    true,
  );
  assert.equal(
    showThinkingLine({
      busy: false,
      hasLiveAssistant: false,
      hasLiveTool: false,
    }),
    false,
  );
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: true,
      hasLiveTool: false,
    }),
    false,
  );
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: true,
    }),
    false,
  );
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: true,
      hasLiveTool: true,
    }),
    false,
  );
});

test("message.delta or a tool line hides thinking even if busy stays true", () => {
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: true,
      hasLiveTool: false,
    }),
    false,
    "streamed assistant text takes over",
  );
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: true,
    }),
    false,
    "tool.start / kind=tool takes over",
  );
});

test("1:1 isolation still hides a peer agent from A's transcript", () => {
  const alice = { id: "alice", kind: "agent" };
  assert.equal(isTranscriptVisible({ senderId: "bob" }, alice), false);
  assert.equal(isTranscriptVisible({ senderId: "alice" }, alice), true);
  assert.equal(
    showThinkingLine({
      busy: true,
      hasLiveAssistant: false,
      hasLiveTool: false,
    }),
    true,
  );
});

test("desktop chrome uses a flowing Thinking label, not a static ellipsis", () => {
  assert.equal(THINKING_LABEL, "Thinking");
  assert.doesNotMatch(app, /className="typing"/);
  assert.match(app, /className="thinking"/);
  assert.match(app, /showThinkingLine/);
  assert.match(app, /\{THINKING_LABEL\}/);
  assert.doesNotMatch(css, /\.typing\s*\{/);
  assert.match(css, /\.thinking\s*\{/);
  assert.match(css, /\.thinking-label\s*\{/);
  assert.match(css, /@keyframes\s+thinking-wave/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("thinking-label keeps a solid muted fill if clip or gradient fails", () => {
  const needle = "\n.thinking-label {";
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, "missing .thinking-label");
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  const label = css.slice(start, end + 1);
  assert.match(label, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(label, /(?:^|[^-])color:\s*transparent\b/);
  assert.doesNotMatch(label, /-webkit-text-fill-color:\s*transparent\b/);
  assert.doesNotMatch(
    css,
    /\.thinking-label\s*\{[^}]*-webkit-text-fill-color:\s*transparent/,
  );
  assert.doesNotMatch(
    css,
    /\.thinking-label\s*\{[^}]*(?<!-webkit-text-fill-)color:\s*transparent/,
  );
});
