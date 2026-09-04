// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { showAssistantCopy } from "./messageActions.ts";
import {
  SPEAK_LABEL,
  STOP_SPEAKING_LABEL,
  showAssistantSpeak,
  speakLabel,
  spokenText,
} from "./speak.ts";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "App.tsx"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");
const api = readFileSync(join(here, "api.ts"), "utf8");
const speakSrc = readFileSync(join(here, "speak.ts"), "utf8");

function msg(
  partial: Record<string, unknown>,
): { kind?: string; role?: string; senderId?: string } {
  return partial as { kind?: string; role?: string; senderId?: string };
}

test("Speak on completed LEFT kind=message; not tool/widget/connect/user-right", () => {
  const left = msg({ kind: "message", role: "assistant", senderId: "snorlax-bot" });
  assert.equal(showAssistantSpeak({ message: left, completed: true }), true);
  assert.equal(showAssistantSpeak({ message: left, completed: false }), false);
  assert.equal(showAssistantSpeak({ message: left, completed: true }), showAssistantCopy({ message: left, completed: true }));
  assert.equal(
    showAssistantSpeak({
      message: msg({ kind: "tool", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantSpeak({
      message: msg({ kind: "widget", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantSpeak({
      message: msg({ kind: "connect", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantSpeak({
      message: msg({ kind: "approve", role: "assistant", senderId: "snorlax-bot" }),
      completed: true,
    }),
    false,
  );
  assert.equal(
    showAssistantSpeak({
      message: msg({ kind: "message", role: "user", senderId: "user" }),
      completed: true,
    }),
    false,
  );
});

test("Speak / Stop speaking labels and a11y names", () => {
  assert.equal(SPEAK_LABEL, "Speak");
  assert.equal(STOP_SPEAKING_LABEL, "Stop speaking");
  assert.equal(speakLabel(false), SPEAK_LABEL);
  assert.equal(speakLabel(true), STOP_SPEAKING_LABEL);
  assert.match(app, /speakLabel\(/);
  assert.match(app, /aria-label=\{speakName\}/);
  assert.match(app, /aria-pressed=\{speaking\}/);
  assert.match(app, /onSpeak/);
  assert.match(app, /toggleSpeak/);
  assert.match(app, /stopSpeaking/);
});

test("spokenText strips markdown without inventing chrome", () => {
  assert.equal(spokenText("**hello** _world_"), "hello world");
  assert.equal(spokenText("# Title\n\nA [link](https://example.com)."), "Title\n\nA link.");
  assert.equal(spokenText("Use `code` and ![alt](http://x)"), "Use code and alt");
  assert.equal(spokenText("```ts\nconst x = 1;\n```"), "const x = 1;");
  assert.equal(
    spokenText("```mermaid\ngraph TD; A-->B;\n```"),
    "graph TD; A-->B;",
  );
  assert.equal(spokenText("  "), "");
  assert.doesNotMatch(spokenText("**hi**"), /\*\*|Speak|Stop/);
  assert.doesNotMatch(
    spokenText("```mermaid\ngraph TD; A-->B;\n```"),
    /diagram|Speak|Stop/i,
  );
});

test("Speak chrome: 12px muted row; pressed while playing; no autoplay", () => {
  assert.match(app, /MessageActions/);
  assert.match(app, /toggleSpeak\(message\.id, message\.content\)/);
  assert.match(app, /speakingId === message\.id/);
  assert.match(css, /\n\.message-action \{/);
  const btn = css.slice(css.indexOf("\n.message-action {"));
  const btnBlock = btn.slice(0, btn.indexOf("}") + 1);
  assert.match(btnBlock, /font-size:\s*12px/);
  assert.match(btnBlock, /color:\s*var\(--text-muted\)/);
  assert.match(css, /\.message-action\.is-speaking/);
  assert.match(css, /\.message-action\[aria-pressed="true"\]/);
  assert.match(app, /new Audio\(/);
  assert.doesNotMatch(app, /message\.done[\s\S]{0,200}toggleSpeak/);
  assert.doesNotMatch(app, /autoPlay/);
  assert.match(app, /User tap only/);
});

test("speak POST is local Bearer /v1/speak; never cloud TTS", () => {
  assert.match(api, /\/v1\/speak/);
  assert.match(api, /export async function speakText/);
  assert.match(api, /Content-Type.*application\/json/);
  assert.doesNotMatch(api, /api\.openai\.com/);
  assert.doesNotMatch(api, /elevenlabs/);
  assert.doesNotMatch(api, /texttospeech\.googleapis/);
  assert.doesNotMatch(api, /speech\.googleapis/);
  assert.doesNotMatch(speakSrc, /api\.openai\.com/);
  assert.doesNotMatch(speakSrc, /elevenlabs/);
  assert.doesNotMatch(app, /computerPane\.ts/);
  assert.equal(existsSync(join(here, "computerPane.ts")), false);
});
