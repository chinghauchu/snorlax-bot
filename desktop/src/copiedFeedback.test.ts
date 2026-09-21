// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COPIED_FEEDBACK_LABEL,
  COPY_CONTROL_LABEL,
  copiedFeedbackLabel,
  MESSAGE_COPY_FEEDBACK_MS,
  showAssistantCopy,
} from "./messageActions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const actionsSrc = readFileSync(join(here, "messageActions.ts"), "utf8");
const chat = readFileSync(
  join(here, "..", "..", "ios", "SnorlaxBot", "ChatView.swift"),
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

function block(selector: string): string {
  const needle = `\n${selector} {`;
  const idx = css.indexOf(needle);
  assert.ok(idx >= 0, `missing ${selector}`);
  const start = css.indexOf("{", idx);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function sliceFn(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end > start ? src.slice(start, end) : src.slice(start);
}

function msg(
  partial: Record<string, unknown>,
): { kind?: string; role?: string; senderId?: string } {
  return partial as { kind?: string; role?: string; senderId?: string };
}

test("Copy → muted Copied 1.2s beside control; Copy label not replaced", () => {
  const left = msg({ kind: "message", role: "assistant", senderId: "snorlax-bot" });
  assert.equal(showAssistantCopy({ message: left, completed: true }), true);
  assert.equal(MESSAGE_COPY_FEEDBACK_MS, 1200);
  assert.equal(COPY_CONTROL_LABEL, "Copy");
  assert.equal(COPIED_FEEDBACK_LABEL, "Copied");
  assert.equal(copiedFeedbackLabel(true), "Copied");
  assert.equal(copiedFeedbackLabel(false), null);

  const actions = sliceFn(app, "function MessageActions(", "function AgentSkillRow");
  assert.match(actions, /MESSAGE_COPY_FEEDBACK_MS/);
  assert.match(actions, /copiedFeedbackLabel\(copied\)/);
  assert.match(actions, /COPY_CONTROL_LABEL/);
  assert.match(actions, /className="message-copy"/);
  assert.match(actions, /className="message-copied"/);
  assert.match(actions, /aria-live="polite"/);
  assert.doesNotMatch(actions, /copied \? "Copied" : "Copy"/);
  assert.doesNotMatch(actions, /\{copied \? "Copied"/);
  const copyBtn = actions.slice(
    actions.indexOf("className=\"message-copy\""),
    actions.indexOf("className={`message-action${speaking"),
  );
  assert.match(copyBtn, /\{COPY_CONTROL_LABEL\}/);
  assert.match(copyBtn, /copiedLabel/);
  assert.ok(
    copyBtn.indexOf("COPY_CONTROL_LABEL") < copyBtn.indexOf("copiedLabel"),
    "Copied must sit beside Copy, not replace it",
  );

  const copiedCss = block(".message-copied");
  assert.match(copiedCss, /font-size:\s*12px/);
  assert.match(copiedCss, /color:\s*var\(--text-muted\)/);
  assert.match(copiedCss, /pointer-events:\s*none/);
  assert.doesNotMatch(copiedCss, /position:\s*fixed/);
  assert.doesNotMatch(copiedCss, /position:\s*absolute/);
  const cluster = block(".message-copy");
  assert.match(cluster, /display:\s*flex/);
  assert.match(cluster, /align-items:\s*center/);
  const row = block(".message-actions");
  assert.match(row, /gap:\s*12px/);
  assert.match(row, /flex-direction:\s*row/);
});

test("no toast overlay; Speak / Regenerate unchanged", () => {
  const actions = sliceFn(app, "function MessageActions(", "function AgentSkillRow");
  assert.doesNotMatch(actions, /toast/i);
  assert.doesNotMatch(css, /\n\.toast \{/);
  assert.doesNotMatch(actions, /position:\s*fixed/);
  assert.match(actions, /speakLabel\(speaking\)/);
  assert.match(actions, /onSpeak/);
  assert.match(actions, /showRegenerate/);
  assert.match(actions, />\s*Regenerate\s*</);
  const copiedAt = actions.indexOf("message-copied");
  const speakBtn = actions.indexOf("className={`message-action${speaking");
  const regenAt = actions.lastIndexOf("Regenerate");
  assert.ok(copiedAt >= 0 && speakBtn > copiedAt && regenAt > speakBtn);

  assert.match(chat, /Button\("Copy"\)/);
  assert.doesNotMatch(chat, /copied \? "Copied" : "Copy"/);
  assert.match(chat, /Text\("Copied"\)/);
  assert.match(chat, /1_200_000_000/);
  assert.doesNotMatch(chat, /1_500_000_000/);
  assert.doesNotMatch(chat, /toast/i);
  assert.match(chat, /Speak\.label\(speaking\)/);
  assert.match(chat, /Button\("Regenerate"\)/);
  const copyBlock = chat.slice(
    chat.indexOf('Button("Copy")'),
    chat.indexOf("if showSpeak"),
  );
  assert.match(copyBlock, /Text\("Copied"\)/);
  assert.match(copyBlock, /\.font\(\.system\(size: 12\)\)/);
  assert.match(copyBlock, /foregroundStyle\(\.secondary\)/);
  assert.doesNotMatch(copyBlock, /Speak\.label/);
  assert.doesNotMatch(copyBlock, /Regenerate/);
});

test("OpenAPI stays 0.18.0; v0.61 is documented; no computerPane.ts", () => {
  assert.match(openapi, /version: 0\.18\.0/);
  assert.match(protocol, /version: 0\.18\.0/);
  assert.match(runtimeOpenapi, /version: 0\.18\.0/);
  assert.doesNotMatch(openapi, /version:\s*0\.19/);
  assert.match(openapi, /v0\.61/);
  assert.match(protocol, /v0\.61/);
  assert.match(runtimeOpenapi, /v0\.61/);
  assert.doesNotMatch(actionsSrc, /\/v1\/cancel/);
  assert.doesNotMatch(app, /\/v1\/chats\//);
  assert.doesNotMatch(actionsSrc, /computerPane\.ts/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});

test("v0.47–v0.60 intact stack stays wired", () => {
  assert.match(app, /onSendOrRegenerate/);
  assert.match(app, /splitAssistantBubbles/);
  assert.match(app, /optimisticUser: true/);
  assert.match(app, /insertOptimistic\(/);
  assert.match(app, /shouldOfferStop/);
  assert.match(app, /onStopGenerating/);
  assert.match(app, /showWaitingLine/);
  assert.match(app, /className="waiting"/);
  assert.match(app, /showStreamingCaret/);
  assert.match(app, /className="streaming-caret"/);
  assert.match(app, /escapeStopsGenerating/);
  assert.match(app, /className="assistant-bubbles"/);
  assert.match(app, /sendMutedWhileGenerating/);
  assert.match(app, /from "\.\/compactToolTraces"/);
  assert.match(app, /from "\.\/midStreamPlaintext"/);
  assert.match(app, /from "\.\/waiting"/);
  assert.match(app, /WAITING_DOT/);
  assert.match(app, /shouldFocusComposerAfterAbort/);
  assert.match(app, /className="jump-latest"/);
  assert.match(app, /onClick=\{onJumpLatest\}/);
  assert.match(app, /escapeJumpsToLatest/);
});
