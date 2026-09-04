#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.44 iOS local TTS Speak lock.

Speak on completed LEFT kind=message (1:1 and channel). Idle label Speak;
while playing Stop speaking with selected state. POST /v1/speak. Local
piper only. Never autoplay. Never AVSpeechSynthesizer / cloud TTS.
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
SPEAK = (IOS / "Speak.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_SPEAK = (ROOT / "desktop" / "src" / "speak.ts").read_text(encoding="utf-8")

START = "Speak"
STOP = "Stop speaking"


def _fn(src: str, name: str) -> str:
    marker = f"func {name}"
    start = src.index(marker)
    nxt = src.find("\n    func ", start + len(marker))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(marker))
    return src[start:nxt] if nxt > 0 else src[start:]


def spoken_text(src: str) -> str:
    text = src
    text = re.sub(r"```[^\n]*\n?([\s\S]*?)```", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.M)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.M)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.M)
    text = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text)
    text = re.sub(r"(\*|_)(.*?)\1", r"\2", text)
    text = re.sub(r"~~(.*?)~~", r"\1", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def test_labels_and_a11y() -> None:
    assert f'static let startLabel = "{START}"' in SPEAK
    assert f'static let stopLabel = "{STOP}"' in SPEAK
    assert "func label(" in SPEAK
    assert "func pressed(" in SPEAK
    assert "Speak.label(speaking)" in CHAT
    assert "accessibilityLabel(Speak.label(speaking))" in CHAT
    assert "accessibilityAddTraits(Speak.pressed(speaking) ? .isSelected : [])" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert "HStack(spacing: 12)" in CHAT


def test_speak_on_left_kind_message_not_tool_widget() -> None:
    assert "showsSpeak" in CHAT
    assert "showsCopy" in CHAT
    assert "showSpeak" in CHAT
    assert "isKindMessage" in CHAT
    assert "isToolLine" in CHAT
    assert "isWidget" in CHAT
    assert "isConnect" in CHAT
    assert "isApprove" in CHAT
    assert "isFromUser" in CHAT
    assert "func showsSpeak(" in CHAT
    assert "showsCopy(" in CHAT


def test_toggle_stop_and_no_autoplay() -> None:
    toggle = _fn(MODEL, "toggleSpeak(message:")
    assert "client.speak" in toggle
    assert "Speak.spokenText" in toggle
    assert "User tap only" in toggle
    assert "speakingMessageId == message.id" in toggle
    assert "stopSpeaking()" in toggle
    stop = _fn(MODEL, "stopSpeaking()")
    assert "speakPlayback.stop()" in stop
    assert "speakingMessageId = nil" in stop
    assert "stopSpeaking()" in MODEL
    assert "message.done" not in toggle
    assert "AVSpeechSynthesizer" not in CHAT
    assert "AVSpeechSynthesizer" not in MODEL
    assert "AVSpeechSynthesizer" not in SPEAK
    assert "AVAudioPlayer" in SPEAK


def test_spoken_text_strips_markdown() -> None:
    assert spoken_text("**hello** _world_") == "hello world"
    assert "Title" in spoken_text("# Title\n\nA [link](https://example.com).")
    assert "link" in spoken_text("# Title\n\nA [link](https://example.com).")
    assert spoken_text("Use `code`") == "Use code"
    assert "func spokenText" in SPEAK
    assert "Do not invent UI chrome" in SPEAK


def test_speak_uses_local_route() -> None:
    assert "func speak(text:" in CLIENT
    assert 'makeRequest("v1/speak", method: "POST"' in CLIENT
    assert "struct SpeakRequest" in TYPES
    assert "var text: String" in TYPES
    assert "AVAudioPlayer" in SPEAK
    assert "speech.googleapis" not in CLIENT
    assert "api.openai.com" not in CLIENT
    assert "elevenlabs" not in CLIENT
    assert "piper" not in CHAT
    assert "MCP" not in SPEAK
    assert "oMLX" not in SPEAK
    assert "vLLM" not in SPEAK


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "/v1/speak" in OPENAPI
    assert "0.18.0" in TYPES
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CLIENT
    assert "computerPane.ts" not in SPEAK
    assert "/v1/chats/" not in SPEAK


def test_desktop_speak_present() -> None:
    assert 'export const SPEAK_LABEL = "Speak"' in DESKTOP_SPEAK
    assert 'export const STOP_SPEAKING_LABEL = "Stop speaking"' in DESKTOP_SPEAK
    assert "function toggleSpeak" in DESKTOP_APP
    assert "User tap only" in DESKTOP_APP
    assert "speakText" in DESKTOP_APP


def main() -> int:
    tests = [
        test_labels_and_a11y,
        test_speak_on_left_kind_message_not_tool_widget,
        test_toggle_stop_and_no_autoplay,
        test_spoken_text_strips_markdown,
        test_speak_uses_local_route,
        test_openapi_stays_0180_and_no_computer_pane,
        test_desktop_speak_present,
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
