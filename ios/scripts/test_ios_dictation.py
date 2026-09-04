#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.43 iOS local voice dictation lock.

Composer bar is paperclip | field | Mic | Send. Idle Mic is muted.
Listening uses danger plus a 6px solid dot (no pulse). Tap Mic to start;
tap again to stop and POST /v1/transcribe. Cancel while recording does
not POST and does not insert. Hints are exactly Transcribing… /
No speech detected. / Microphone is off. a11y Start dictation /
Stop dictation with pressed while listening — not Dictate. Transcript
inserts as editable composer text. No auto-send. No cloud STT/TTS.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
DICTATION = (IOS / "Dictation.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
INFO = (IOS / "Info.plist").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_DICTATION = (ROOT / "desktop" / "src" / "dictation.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")

START = "Start dictation"
STOP = "Stop dictation"
HINT_TRANSCRIBING = "Transcribing…"
HINT_NO_SPEECH = "No speech detected."
HINT_MIC_OFF = "Microphone is off."
FORBIDDEN_PERM = "Microphone permission is required."


def _fn(src: str, name: str) -> str:
    marker = f"func {name}"
    start = src.index(marker)
    nxt = src.find("\n    func ", start + len(marker))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(marker))
    return src[start:nxt] if nxt > 0 else src[start:]


def insert_transcript(text: str, caret: int, transcript: str, selection_length: int = 0) -> tuple[str, int]:
    piece = re.sub(r"\s+", " ", transcript).strip()
    if not piece:
        return text, caret
    start = max(0, min(caret, len(text)))
    end = max(start, min(start + max(0, selection_length), len(text)))
    before = text[:start]
    after = text[end:]
    lead = " " if before and not re.search(r"[\s\n]$", before) else ""
    trail = " " if after and not re.search(r"^[\s\n]", after) else ""
    inserted = f"{before}{lead}{piece}{trail}{after}"
    return inserted, len(before) + len(lead) + len(piece) + len(trail)


def test_labels_and_hint_strings() -> None:
    assert f'static let startLabel = "{START}"' in DICTATION
    assert f'static let stopLabel = "{STOP}"' in DICTATION
    assert f'static let hintTranscribing = "{HINT_TRANSCRIBING}"' in DICTATION
    assert f'static let hintNoSpeech = "{HINT_NO_SPEECH}"' in DICTATION
    assert f'static let hintMicOff = "{HINT_MIC_OFF}"' in DICTATION
    assert START != "Dictate"
    assert STOP != "Dictate"
    assert "Dictate" not in DICTATION
    assert FORBIDDEN_PERM not in DICTATION
    assert FORBIDDEN_PERM not in CHAT
    assert FORBIDDEN_PERM not in MODEL
    assert FORBIDDEN_PERM not in INFO
    assert "func label(" in DICTATION
    assert "func pressed(" in DICTATION
    assert "func busy(" in DICTATION
    assert "func cancelable(" in DICTATION
    assert "func composerHint(" in DICTATION
    assert "state == .recording" in DICTATION
    assert "state == .processing" in DICTATION
    assert 'hintRole = "status"' in DICTATION


def test_composer_bar_order_paperclip_field_mic_send() -> None:
    start = CHAT.index("HStack(alignment: .bottom, spacing: 8)")
    bar = CHAT[start : CHAT.index('.accessibilityLabel("Send")', start) + 40]
    paperclip = bar.index('Image(systemName: "paperclip")')
    field = bar.index("ComposerTextView(")
    mic = bar.index('Image(systemName: "mic")')
    send = bar.index('Image(systemName: "arrow.up.circle.fill")')
    assert paperclip < field < mic < send
    assert '.accessibilityLabel("Attach")' in bar
    assert "Dictation.label(model.dictation)" in bar
    assert '.accessibilityLabel("Send")' in bar
    assert "toggleDictation" in bar


def test_listening_danger_and_solid_6px_dot() -> None:
    assert "DictationListeningDot" in CHAT
    assert "DictationListeningDot" in DICTATION
    assert "listeningDotSize: CGFloat = 6" in DICTATION
    assert "static let danger" in DICTATION
    assert "model.dictation == .recording ? Dictation.danger : Color.secondary" in CHAT
    assert "Color.secondary" in CHAT
    assert "repeatForever" not in DICTATION
    assert "withAnimation" not in DICTATION
    assert ".pulse" not in DICTATION
    assert "accessibilityHidden(true)" in DICTATION


def test_a11y_start_stop_pressed_not_dictate() -> None:
    assert "accessibilityLabel(Dictation.label(model.dictation))" in CHAT
    assert "accessibilityAddTraits(Dictation.pressed(model.dictation) ? .isSelected : [])" in CHAT
    assert "Dictate" not in CHAT
    assert "Dictate" not in MODEL
    assert START in DICTATION
    assert STOP in DICTATION


def test_status_hint_strings_and_role() -> None:
    assert "Dictation.composerHint" in CHAT
    assert "accessibilityIdentifier(Dictation.hintRole)" in CHAT
    assert "accessibilityAddTraits(.updatesFrequently)" in CHAT
    assert HINT_TRANSCRIBING in DICTATION
    assert HINT_NO_SPEECH in DICTATION
    assert HINT_MIC_OFF in DICTATION
    assert FORBIDDEN_PERM not in CHAT


def test_cancel_without_transcribe_or_insert() -> None:
    cancel = _fn(MODEL, "cancelDictation()")
    assert "dictationCapture.cancel()" in cancel
    assert "transcribeAudio" not in cancel
    assert "insertTranscript" not in cancel
    assert "send()" not in cancel
    assert "draft =" not in cancel
    assert "Dictation.cancelable" in cancel
    assert 'Button("Cancel")' in CHAT
    assert "model.cancelDictation()" in CHAT
    assert '.accessibilityLabel("Cancel dictation")' in CHAT
    assert "No POST /v1/transcribe" in DICTATION
    assert "No POST /v1/transcribe" in MODEL
    capture_cancel = DICTATION[DICTATION.index("func cancel()") :]
    capture_cancel = capture_cancel[: capture_cancel.index("\n    private func ")]
    assert "transcribe" not in capture_cancel.lower() or "No POST /v1/transcribe" in capture_cancel
    assert "insert" not in capture_cancel.lower()


def test_insert_transcript_at_caret_no_auto_send() -> None:
    assert insert_transcript("", 0, "hello") == ("hello", 5)
    assert insert_transcript("hi", 2, "there") == ("hi there", 8)
    assert insert_transcript("aa cc", 2, "bb") == ("aa bb cc", 5)
    assert insert_transcript("hello ", 6, "world") == ("hello world", 11)
    assert insert_transcript("keep", 4, "  extra   spaces ") == ("keep extra spaces", 17)
    assert insert_transcript("stay", 2, "   ") == ("stay", 2)
    assert insert_transcript("hello world", 0, "hey", 5) == ("hey world", 3)
    finish = _fn(MODEL, "finishDictation()")
    assert "insertTranscript" in finish
    assert "pendingComposerCaret = next.caret" in finish
    assert "wantsComposerFocus = true" in finish
    assert "send()" not in finish
    assert "sendMessage" not in finish
    assert "transcribeAudio" in finish
    assert "Dictation.hintNoSpeech" in finish
    assert 'message == "No speech detected."' in finish
    start = _fn(MODEL, "startDictation()")
    assert "Dictation.hintMicOff" in start
    assert "send()" not in start


def test_transcribe_uses_existing_route_multipart_audio() -> None:
    assert "func transcribeAudio" in CLIENT
    assert 'makeRequest("v1/transcribe", method: "POST")' in CLIENT
    assert 'name=\\"audio\\"' in CLIENT or 'name="audio"' in CLIENT
    assert "Transcript" in CLIENT
    assert "struct Transcript" in TYPES
    assert "var text: String" in TYPES
    assert "AVSpeechSynthesizer" not in CHAT
    assert "AVSpeechSynthesizer" not in MODEL
    assert "AVSpeechSynthesizer" not in DICTATION
    assert "speech.googleapis" not in CLIENT
    assert "api.openai.com" not in CLIENT
    assert "whisper.cpp" not in CHAT
    assert "whisper.cpp" not in MODEL
    assert "whisper.cpp" not in DICTATION
    assert "SNORLAX_WHISPER" not in DICTATION
    assert "MCP" not in DICTATION
    assert "oMLX" not in DICTATION
    assert "vLLM" not in DICTATION


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "/v1/transcribe" in OPENAPI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CLIENT
    assert "computerPane.ts" not in DICTATION
    assert "/v1/chats/" not in DICTATION
    assert "NSMicrophoneUsageDescription" in INFO
    assert FORBIDDEN_PERM not in INFO


def test_desktop_dictation_unchanged() -> None:
    assert 'export const START_DICTATION_LABEL = "Start dictation"' in DESKTOP_DICTATION
    assert "function cancelDictation" in DESKTOP_APP
    assert "dictationCancelable" in DESKTOP_APP
    assert "transcribeAudio" in DESKTOP_APP
    assert "icon-btn dictation" in DESKTOP_APP
    assert "No auto-send" in DESKTOP_DICTATION


def main() -> int:
    tests = [
        test_labels_and_hint_strings,
        test_composer_bar_order_paperclip_field_mic_send,
        test_listening_danger_and_solid_6px_dot,
        test_a11y_start_stop_pressed_not_dictate,
        test_status_hint_strings_and_role,
        test_cancel_without_transcribe_or_insert,
        test_insert_transcript_at_caret_no_auto_send,
        test_transcribe_uses_existing_route_multipart_audio,
        test_openapi_stays_0180_and_no_computer_pane,
        test_desktop_dictation_unchanged,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}", file=sys.stderr)
    if failed:
        print(f"{failed} failed", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
