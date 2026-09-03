// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ERR_TRANSCRIBE,
  HINT_MIC_OFF,
  HINT_NO_SPEECH,
  HINT_TRANSCRIBING,
  START_DICTATION_LABEL,
  STOP_DICTATION_LABEL,
  audioFileName,
  composerDictationHint,
  dictationBusy,
  dictationCancelable,
  dictationLabel,
  dictationPressed,
  insertTranscript,
  pickRecorderMime,
} from "./dictation.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("dictation labels and a11y helpers", () => {
  assert.equal(dictationLabel("idle"), START_DICTATION_LABEL);
  assert.equal(dictationLabel("recording"), STOP_DICTATION_LABEL);
  assert.equal(dictationLabel("processing"), START_DICTATION_LABEL);
  assert.equal(START_DICTATION_LABEL, "Start dictation");
  assert.equal(STOP_DICTATION_LABEL, "Stop dictation");
  assert.notEqual(START_DICTATION_LABEL, "Dictate");
  assert.equal(dictationPressed("idle"), false);
  assert.equal(dictationPressed("recording"), true);
  assert.equal(dictationPressed("processing"), false);
  assert.equal(dictationBusy("processing"), true);
  assert.equal(dictationBusy("idle"), false);
  assert.equal(dictationBusy("recording"), false);
});

test("composer hint strings and Esc cancel", () => {
  assert.equal(HINT_TRANSCRIBING, "Transcribing…");
  assert.equal(HINT_NO_SPEECH, "No speech detected.");
  assert.equal(HINT_MIC_OFF, "Microphone is off.");
  assert.equal(composerDictationHint("processing", null), HINT_TRANSCRIBING);
  assert.equal(composerDictationHint("processing", HINT_MIC_OFF), HINT_TRANSCRIBING);
  assert.equal(composerDictationHint("idle", HINT_NO_SPEECH), HINT_NO_SPEECH);
  assert.equal(composerDictationHint("idle", HINT_MIC_OFF), HINT_MIC_OFF);
  assert.equal(composerDictationHint("idle", ERR_TRANSCRIBE), null);
  assert.equal(composerDictationHint("idle", null), null);
  assert.equal(composerDictationHint("recording", null), null);
  assert.equal(dictationCancelable("recording"), true);
  assert.equal(dictationCancelable("idle"), false);
  assert.equal(dictationCancelable("processing"), false);
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

test("desktop composer mic chrome: layout, a11y, insert, Esc cancel, no auto-send", () => {
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
  assert.match(app, /HINT_MIC_OFF/);
  assert.match(app, /HINT_NO_SPEECH/);
  assert.match(app, /composerDictationHint/);
  assert.match(app, /role="status"/);
  assert.match(app, /dictationCancelable/);
  assert.match(app, /cancelDictation/);
  assert.match(api, /\/v1\/transcribe/);
  assert.match(api, /body\.append\("audio"/);
  assert.match(css, /\.icon-btn\.dictation\.recording/);
  assert.match(css, /color:\s*var\(--danger\)/);
  assert.match(css, /\.dictation-dot/);
  assert.match(css, /\.composer-hint/);
  assert.match(dictation, /No auto-send/);
  assert.match(dictation, /No POST \/v1\/transcribe/);
  const finish = app.slice(app.indexOf("async function finishDictation"));
  const finishBody = finish.slice(0, finish.indexOf("\n  async function "));
  assert.doesNotMatch(finishBody, /onSend\(/);
  assert.doesNotMatch(finishBody, /sendMessage\(/);
  const cancel = app.slice(app.indexOf("function cancelDictation"));
  const cancelBody = cancel.slice(0, cancel.indexOf("\n  async function "));
  assert.doesNotMatch(cancelBody, /transcribeAudio/);
  assert.doesNotMatch(cancelBody, /insertTranscript/);
  assert.doesNotMatch(cancelBody, /onSend\(/);
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesis|webkitSpeechRecognition/);
  assert.doesNotMatch(app, /api\.openai\.com/);
  assert.doesNotMatch(dictation, /whisper\.cpp|MCP|oMLX|vLLM/);
  assert.doesNotMatch(app, /Dictate/);
  assert.doesNotMatch(app, /Microphone permission is required\./);
  assert.doesNotMatch(dictation, /Dictate/);
  assert.doesNotMatch(dictation, /Microphone permission is required\./);
});

test("user-facing dictation copy never names the backend", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const dictation = readFileSync(join(here, "dictation.ts"), "utf8");
  for (const src of [app, dictation]) {
    assert.doesNotMatch(src, /whisper\.cpp/);
    assert.doesNotMatch(src, /SNORLAX_WHISPER/);
  }
  assert.equal(HINT_MIC_OFF, "Microphone is off.");
  assert.equal(HINT_NO_SPEECH, "No speech detected.");
  assert.equal(HINT_TRANSCRIBING, "Transcribing…");
  assert.equal(ERR_TRANSCRIBE, "Couldn't transcribe that.");
});

test("composer bar order is paperclip, field, mic, send", () => {
  const app = readFileSync(join(here, "App.tsx"), "utf8");
  const start = app.indexOf('className="composer-bar"');
  const bar = app.slice(start, app.indexOf("<SendIcon", start));
  const paperclip = bar.indexOf('aria-label="Attach file"');
  const field = bar.indexOf('className="composer-field"');
  const mic = bar.indexOf("icon-btn dictation");
  const send = bar.indexOf('aria-label="Send"');
  assert.ok(paperclip >= 0 && field > paperclip);
  assert.ok(mic > field);
  assert.ok(send > mic);
});
