// SPDX-License-Identifier: Apache-2.0
/** Desktop composer dictation. Transcript is editable plain text. No auto-send. */

export type DictationState = "idle" | "recording" | "processing";

export const DICTATE_LABEL = "Dictate";
export const STOP_DICTATION_LABEL = "Stop dictation";
export const TRANSCRIBING_LABEL = "Transcribing";
export const ERR_MIC_PERMISSION = "Microphone permission is required.";
export const ERR_NO_SPEECH = "No speech detected.";
export const ERR_TRANSCRIBE = "Couldn't transcribe that.";

const RECORDER_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
];

export function dictationLabel(state: DictationState): string {
  if (state === "recording") return STOP_DICTATION_LABEL;
  if (state === "processing") return TRANSCRIBING_LABEL;
  return DICTATE_LABEL;
}

export function dictationPressed(state: DictationState): boolean {
  return state === "recording";
}

export function dictationBusy(state: DictationState): boolean {
  return state === "processing";
}

/** Insert recognized text at the caret. Surrounding spaces when needed. */
export function insertTranscript(
  text: string,
  caret: number,
  transcript: string,
): { text: string; caret: number } {
  const piece = transcript.replace(/\s+/g, " ").trim();
  if (!piece) return { text, caret };
  const start = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, start);
  const after = text.slice(start);
  const lead = before && !/[\s\n]$/.test(before) ? " " : "";
  const trail = after && !/^[\s\n]/.test(after) ? " " : "";
  const inserted = `${before}${lead}${piece}${trail}${after}`;
  return {
    text: inserted,
    caret: before.length + lead.length + piece.length + trail.length,
  };
}

export function pickRecorderMime(
  isTypeSupported?: (mime: string) => boolean,
): string {
  const check = isTypeSupported;
  if (!check) return "";
  for (const mime of RECORDER_MIMES) {
    try {
      if (check(mime)) return mime;
    } catch {
      continue;
    }
  }
  return "";
}

export function audioFileName(mime: string): string {
  const type = mime.toLowerCase().split(";")[0].trim();
  if (type === "audio/mp4" || type === "video/mp4") return "speech.m4a";
  if (type === "audio/ogg") return "speech.ogg";
  if (type === "audio/wav" || type === "audio/x-wav") return "speech.wav";
  return "speech.webm";
}
