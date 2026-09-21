#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.51 iOS LEFT pulsing ··· until first token.

After Send, show LEFT 12pt muted pulsing ··· (not a tool line, not a
bubble) until the first assistant token. First token swaps to the
growing LEFT bubble. Stop / error / empty reply dismisses the dots.
Works with v0.49 optimistic user-RIGHT and v0.50 Stop. No new HTTP.
OpenAPI stays 0.18.0. Keep v0.47–v0.50 intact. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_WAIT = (ROOT / "desktop" / "src" / "waiting.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
THINKING_SWIFT = IOS / "Thinking.swift"
THINKING_TS = ROOT / "desktop" / "src" / "thinking.ts"

LABEL = "···"
DOT = "·"


def _fn(src: str, name: str) -> str:
    markers = (f"func {name}", f"static func {name}", f"async function {name}", f"function {name}")
    start = -1
    used = ""
    for marker in markers:
        idx = src.find(marker)
        if idx >= 0:
            start = idx
            used = marker
            break
    if start < 0:
        raise AssertionError(f"missing {name}")
    nxt = src.find("\n    func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    static func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    async function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def test_waiting_shows_after_send() -> None:
    assert f'static let dot = "{DOT}"' in WAITING
    assert f'static let label = "{LABEL}"' in WAITING
    assert "static let word" not in WAITING
    show = _fn(WAITING, "shouldShow")
    assert "busy && !hasFirstToken && !hasLiveTool && !hasError" in show
    assert "showWaitingLine" in DESKTOP_WAIT
    assert 'WAITING_LABEL = ' in DESKTOP_WAIT
    assert "WAITING_WORD" not in DESKTOP_WAIT
    assert "WaitingChrome.shouldShow(" in CHAT
    assert "busy: model.isSending" in CHAT
    assert "hasFirstToken: hasFirstToken" in CHAT
    assert "showWaitingLine({" in DESKTOP_APP
    assert "hasFirstToken: hasAssistantToken" in DESKTOP_APP


def test_waiting_hides_on_first_token() -> None:
    show = _fn(WAITING, "shouldShow")
    assert "!hasFirstToken" in show
    assert "!hasLiveTool" in show
    assert "if showWaiting" in CHAT
    assert "waitingStreak(agent: agent)" in CHAT
    assert "liveAssistantIdx" in CHAT
    assert "showWaiting ?" in DESKTOP_APP
    assert "className=\"waiting\"" in DESKTOP_APP
    assert "className=\"thinking\"" not in DESKTOP_APP
    assert "ThinkingChrome" not in CHAT
    assert not THINKING_SWIFT.exists()
    assert not THINKING_TS.exists()
    assert "if text.isEmpty { return }" in MODEL
    assert "if (!delta) return prev;" in DESKTOP_APP


def test_stop_error_empty_dismiss() -> None:
    show = _fn(WAITING, "shouldShow")
    assert "!hasError" in show
    assert "hasError: model.errorMessage != nil || model.composerError != nil" in CHAT
    assert "hasError: Boolean(composerError)" in DESKTOP_APP
    assert "static func isEmptyAssistantReply" in WAITING
    assert "WaitingChrome.isEmptyAssistantReply(" in MODEL
    assert "isEmptyAssistantReply(message)" in DESKTOP_APP
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "shouldOfferStop(busy)" in DESKTOP_APP
    assert "onStopGenerating" in DESKTOP_APP
    assert "optimisticUser: true" in DESKTOP_APP
    assert "static func insert(" in OPT


def test_chrome_12pt_muted_dots_not_bubble() -> None:
    assert "WaitingLabel()" in CHAT
    assert ".font(.system(size: 12))" in WAITING
    assert ".foregroundStyle(.secondary)" in WAITING
    assert "WaitingChrome.word" not in WAITING
    assert "WaitingChrome.word" not in CHAT
    overlay = DESKTOP_APP[DESKTOP_APP.find("{showWaiting ? (") :]
    overlay = overlay[:1400]
    assert "className=\"waiting\"" in overlay
    assert "className=\"bubble" not in overlay
    assert "tool-trace" not in overlay
    assert "waiting-word" not in overlay
    assert ".waiting {" in DESKTOP_CSS
    assert "font-size: 12px" in DESKTOP_CSS[DESKTOP_CSS.find(".waiting {") :]
    assert "@keyframes waiting-dot" in DESKTOP_CSS
    assert ".waiting-word" not in DESKTOP_CSS
    assert "WAITING_LABEL" in DESKTOP_APP
    assert "WAITING_DOT" in DESKTOP_APP
    assert "WAITING_WORD" not in DESKTOP_APP
    assert 'id("waiting")' in CHAT
    assert "accessibilityLabel(WaitingChrome.label)" in WAITING
    assert "Thinking" not in WAITING
    assert "className=\"thinking\"" not in DESKTOP_APP


def test_stick_multi_bubbles_stop_openapi() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static let label = \"Stop\"" in STOP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.51" in OPENAPI
    assert "v0.51" in RUNTIME_OPENAPI
    assert "v0.51" in DESKTOP_OPENAPI
    assert "computerPane.ts" not in WAITING
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in DESKTOP_WAIT
    assert not DESKTOP_PANE.exists()
    assert "/v1/chats/" not in WAITING
    assert "/v1/chats/" not in DESKTOP_WAIT


def main() -> int:
    tests = [
        test_waiting_shows_after_send,
        test_waiting_hides_on_first_token,
        test_stop_error_empty_dismiss,
        test_chrome_12pt_muted_dots_not_bubble,
        test_stick_multi_bubbles_stop_openapi,
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
