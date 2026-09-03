// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DICTATE_LABEL,
  ERR_MIC_PERMISSION,
  ERR_NO_SPEECH,
  ERR_TRANSCRIBE,
  STOP_DICTATION_LABEL,
  TRANSCRIBING_LABEL,
  audioFileName,
  dictationBusy,
  dictationLabel,
  dictationPressed,
  insertTranscript,
  pickRecorderMime,
} from "./dictation.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("dictation labels and a11y helpers", () => {
  assert.equal(dictationLabel("idle"), DICTATE_LABEL);
  assert.equal(dictationLabel("recording"), STOP_DICTATION_LABEL);
  assert.equal(dictationLabel("processing"), TRANSCRIBING_LABEL);
  assert.equal(DICTATE_LABEL, "Dictate");
  assert.equal(STOP_DICTATION_LABEL, "Stop dictation");
  assert.equal(TRANSCRIBING_LABEL, "Transcribing");
  assert.equal(dictationPressed("idle"), false);
  assert.equal(dictationPressed("recording"), true);
  assert.equal(dictationPressed("processing"), false);
  assert.equal(dictationBusy("processing"), true);
  assert.equal(dictationBusy("idle"), false);
  assert.equal(dictationBusy("recording"), false);
});

test("insertTranscript at caret or append, with spacing", () => {
  assert.deepEqual(insertTranscript("", 0, "hello"), {
    text: "hello",
    caret: 5,
  });
  assert.deepEqual(insertTranscript("hi", 2, "there"), {
    text: "hi there",
    caret: 8,
  });
  assert.deepEqual(insertTranscript("aa cc", 2, "bb"), {
    text: "aa bb cc",
    caret: 5,
  });
  assert.deepEqual(insertTranscript("hello ", 6, "world"), {
    text: "hello world",
    caret: 11,
  });
  assert.deepEqual(insertTranscript("keep", 4, "  extra   spaces "), {
    text: "keep extra spaces",
    caret: 17,
  });
  assert.deepEqual(insertTranscript("stay", 2, "   "), {
    text: "stay",
    caret: 2,
  });
});

test("recorder mime helpers", () => {
  assert.equal(pickRecorderMime(), "");
  assert.equal(pickRecorderMime((mime) => mime === "audio/webm"), "audio/webm");
  assert.equal(
    pickRecorderMime((mime) => mime.startsWith("audio/mp4")),
    "audio/mp4",
  );
  assert.equal(audioFileName("audio/webm;codecs=opus"), "speech.webm");
  assert.equal(audioFileName("audio/mp4"), "speech.m4a");
  assert.equal(audioFileName("audio/ogg"), "speech.ogg");
  assert.equal(audioFileName("audio/wav"), "speech.wav");
});

test("desktop composer mic chrome: states, a11y, insert, no auto-send", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const css = readFileSync(join(here, "styles.css"), "utf8");
  const api = readFileSync(join(here, "api.ts"), "utf8");
  const dictation = readFileSync(join(here, "dictation.ts"), "utf8");
  assert.match(app, /function MicIcon/);
  assert.match(app, /aria-label=\{dictationLabel\(dictation\)\}/);
  assert.match(app, /aria-pressed=\{dictationPressed\(dictation\)\}/);
  assert.match(app, /aria-busy=\{dictationBusy\(dictation\) \|\| undefined\}/);
  assert.match(app, /transcribeAudio/);
  assert.match(app, /insertTranscript/);
  assert.match(app, /pendingCaret\.current = next\.caret/);
  assert.match(app, /composerRef\.current\?\.focus/);
  assert.match(app, /ERR_MIC_PERMISSION/);
  assert.match(api, /\/v1\/transcribe/);
  assert.match(api, /body\.append\("audio"/);
  assert.match(css, /\.icon-btn\.dictation\.recording/);
  assert.match(css, /color:\s*var\(--danger\)/);
  assert.match(dictation, /No auto-send/);
  const finish = app.slice(app.indexOf("async function finishDictation"));
  const finishBody = finish.slice(0, finish.indexOf("\n  async function "));
  assert.doesNotMatch(finishBody, /onSend\(/);
  assert.doesNotMatch(finishBody, /sendMessage\(/);
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesis|webkitSpeechRecognition/);
  assert.doesNotMatch(app, /api\.openai\.com/);
  assert.doesNotMatch(dictation, /whisper\.cpp|MCP|oMLX|vLLM/);
  assert.doesNotMatch(app, /aria-label="Dictate"[\s\S]{0,200}iOS|ios.*Dictate/);
});

test("user-facing dictation copy never names the backend", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const dictation = readFileSync(join(here, "dictation.ts"), "utf8");
  for (const src of [app, dictation]) {
    assert.doesNotMatch(src, /whisper\.cpp/);
    assert.doesNotMatch(src, /SNORLAX_WHISPER/);
  }
  assert.equal(ERR_MIC_PERMISSION, "Microphone permission is required.");
  assert.equal(ERR_NO_SPEECH, "No speech detected.");
  assert.equal(ERR_TRANSCRIBE, "Couldn't transcribe that.");
});
