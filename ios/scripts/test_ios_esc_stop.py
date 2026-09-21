#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.53 iOS Esc = Stop while generating.

While an assistant turn is in flight, hardware Escape (UIKeyCommand)
aborts the client stream — same as tapping Stop. Do not steal Esc
when IME is composing (markedTextRange), or when a pending widget /
approve / connect card is up. On-screen Stop unchanged. No new HTTP.
OpenAPI stays 0.18.0. Keep v0.47–v0.52 intact. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_STOP = (ROOT / "desktop" / "src" / "stopGenerating.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")


def _fn(src: str, name: str) -> str:
    markers = (
        f"func {name}",
        f"static func {name}",
        f"async function {name}",
        f"function {name}",
    )
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


def test_esc_aborts_like_stop() -> None:
    esc = _fn(STOP, "escapeStops")
    assert "shouldOffer(busy: busy)" in esc
    assert "func stopGeneratingFromEscape(composing: Bool)" in MODEL
    from_esc = _fn(MODEL, "stopGeneratingFromEscape(composing: Bool)")
    assert "StopGenerating.escapeStops(" in from_esc
    assert "stopGenerating()" in from_esc
    assert "UIKeyCommand" in COMPOSER
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "selector(stopGeneratingFromEscape)" in COMPOSER
    assert "model.stopGeneratingFromEscape(composing: composing)" in CHAT
    assert "escapeStopsGenerating" in DESKTOP_STOP
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "onStopGenerating()" in DESKTOP_APP[
        DESKTOP_APP.find("escapeStopsGenerating") :
    ]
    # On-screen Stop is unchanged.
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "model.stopGenerating()" in CHAT
    assert "shouldOfferStop(busy)" in DESKTOP_APP
    assert "className=\"stop-generating\"" in DESKTOP_APP


def test_esc_ignored_during_ime_composing() -> None:
    esc = _fn(STOP, "escapeStops")
    assert "!composing" in esc
    handler = _fn(COMPOSER, "stopGeneratingFromEscape()")
    assert "markedTextRange" in handler
    assert "onEscapeStop?(composing)" in handler
    from_esc = _fn(MODEL, "stopGeneratingFromEscape(composing: Bool)")
    assert "composing: composing" in from_esc
    assert "isComposerComposing(event)" in DESKTOP_APP
    assert "if (input.composing) return false" in DESKTOP_STOP


def test_esc_ignored_when_widget_approve_connect_pending() -> None:
    esc = _fn(STOP, "escapeStops")
    assert "!pendingWidget" in esc
    assert "!pendingApprove" in esc
    assert "!pendingConnect" in esc
    assert "static func pendingWidget(in messages: [Message])" in STOP
    assert "static func pendingApprove(in messages: [Message])" in STOP
    assert "static func pendingConnect(in messages: [Message])" in STOP
    assert ".isWidget" in STOP
    assert ".widgetStatus" in STOP
    assert ".isApprove" in STOP
    assert ".approveStatus" in STOP
    assert ".isConnect" in STOP
    assert ".connectStatus" in STOP
    from_esc = _fn(MODEL, "stopGeneratingFromEscape(composing: Bool)")
    assert "StopGenerating.pendingWidget(in: messages)" in from_esc
    assert "StopGenerating.pendingApprove(in: messages)" in from_esc
    assert "StopGenerating.pendingConnect(in: messages)" in from_esc
    assert "isPendingWidget" in DESKTOP_APP
    assert "isPendingApprove" in DESKTOP_APP
    assert "isPendingConnect" in DESKTOP_APP
    assert "pendingWidget" in DESKTOP_STOP
    assert "pendingApprove" in DESKTOP_STOP
    assert "pendingConnect" in DESKTOP_STOP


def test_no_new_http_openapi_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func insert(" in OPT
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.53" in OPENAPI
    assert "v0.53" in RUNTIME_OPENAPI
    assert "v0.53" in DESKTOP_OPENAPI
    assert "/v1/cancel" not in STOP
    assert "/v1/cancel" not in COMPOSER
    assert "/v1/cancel" not in CHAT
    assert "/v1/cancel" not in DESKTOP_STOP
    assert "/v1/cancel" not in DESKTOP_APP
    assert "/v1/cancel" not in OPENAPI
    assert "computerPane.ts" not in STOP
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in COMPOSER
    assert not DESKTOP_PANE.exists()
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP


def main() -> int:
    tests = [
        test_esc_aborts_like_stop,
        test_esc_ignored_during_ime_composing,
        test_esc_ignored_when_widget_approve_connect_pending,
        test_no_new_http_openapi_intact_stack,
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
