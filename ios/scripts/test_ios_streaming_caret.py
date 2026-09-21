#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.52 iOS streaming caret on the growing LEFT bubble.

After the first assistant token and until complete / Stop: 12pt muted
blinking caret at the end of the mid-stream LEFT growing bubble text.
On complete / Stop: caret gone immediately. Waiting ··· is pre-first-
token only; never both. Reduce Motion: static muted caret. Not on
tool / widget / approve / connect / user-right. Mid-stream stays one
bubble. No new HTTP. OpenAPI stays 0.18.0. Keep v0.47–v0.51 intact.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_CARET = (ROOT / "desktop" / "src" / "streamingCaret.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")


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


def test_caret_shows_after_first_token() -> None:
    show = _fn(CARET, "shouldShow")
    assert "busy && !completed && hasFirstToken && !isUser && isKindMessage" in show
    assert "showStreamingCaret" in DESKTOP_CARET
    assert "StreamingCaretChrome.shouldShow(" in CHAT
    assert "showCaret:" in CHAT
    assert "showStreamingCaret({" in DESKTOP_APP
    assert "hasFirstToken:" in DESKTOP_APP[DESKTOP_APP.find("showStreamingCaret") :]


def test_caret_hides_on_complete_or_stop() -> None:
    show = _fn(CARET, "shouldShow")
    assert "!completed" in show
    assert "busy &&" in show
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "shouldOfferStop(busy)" in DESKTOP_APP
    assert "onStopGenerating" in DESKTOP_APP
    bubble = CHAT[CHAT.find("private struct MessageBubble") :]
    bubble = bubble[: bubble.find("private struct MentionLabel")] if "private struct MentionLabel" in bubble else bubble
    assert "if showCaret" in bubble
    assert "StreamingCaretView()" in bubble


def test_never_with_waiting_dots() -> None:
    wait = _fn(WAITING, "shouldShow")
    caret = _fn(CARET, "shouldShow")
    assert "!hasFirstToken" in wait
    assert "hasFirstToken" in caret
    assert "if showWaiting" in CHAT
    assert "waitingStreak(agent: agent)" in CHAT
    assert "className=\"waiting\"" in DESKTOP_APP
    assert "className=\"streaming-caret\"" in DESKTOP_APP
    md = DESKTOP_APP[DESKTOP_APP.find('className="assistant-md"') : DESKTOP_APP.find('className="assistant-md"') + 3600]
    assert "streaming-caret" in md
    waiting_render = DESKTOP_APP[DESKTOP_APP.find("{showWaiting ? (") :][:1400]
    assert "streaming-caret" not in waiting_render


def test_chrome_12pt_muted_reduce_motion_static() -> None:
    assert "StreamingCaretView()" in CHAT
    assert ".frame(width: 1.5, height: 12)" in CARET
    assert "Color.secondary" in CARET
    assert "accessibilityReduceMotion" in CARET
    assert "Reduce Motion skips" in CARET or "reduceMotion" in CARET
    assert "accessibilityHidden(true)" in CARET
    assert ".streaming-caret {" in DESKTOP_CSS
    caret_css = DESKTOP_CSS[DESKTOP_CSS.find(".streaming-caret {") :]
    assert "height: 12px" in caret_css
    assert "var(--text-muted)" in caret_css
    assert "@keyframes streaming-caret-blink" in DESKTOP_CSS
    assert "prefers-reduced-motion" in DESKTOP_CSS
    reduce = DESKTOP_CSS[DESKTOP_CSS.find("@media (prefers-reduced-motion: reduce)") :]
    assert ".streaming-caret" in reduce
    assert "animation: none" in reduce[reduce.find(".streaming-caret") :]


def test_not_on_tool_widget_approve_connect_user_right() -> None:
    show = _fn(CARET, "shouldShow")
    assert "!isUser" in show
    assert "isKindMessage" in show
    user = DESKTOP_APP[DESKTOP_APP.find('className="bubble user"') :]
    user = user[: user.find("assistant-md")]
    assert "streaming-caret" not in user
    assert "isToolLine(message)" in DESKTOP_APP
    assert "<WidgetCard" in DESKTOP_APP
    assert "<ApproveCard" in DESKTOP_APP
    assert "<ConnectCard" in DESKTOP_APP
    assert "message.isToolLine" in CHAT
    assert "message.isWidget" in CHAT
    assert "message.isApprove" in CHAT
    assert "message.isConnect" in CHAT
    assert "message.isFromUser" in CHAT


def test_stick_multi_bubbles_waiting_stop_openapi() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func insert(" in OPT
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.52" in OPENAPI
    assert "v0.52" in RUNTIME_OPENAPI
    assert "v0.52" in DESKTOP_OPENAPI
    assert "computerPane.ts" not in CARET
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in DESKTOP_CARET
    assert not DESKTOP_PANE.exists()
    assert "/v1/chats/" not in CARET
    assert "/v1/chats/" not in DESKTOP_CARET
    assert "/v1/cancel" not in CARET
    assert "if !completed { return [text] }" in MARKDOWN


def main() -> int:
    tests = [
        test_caret_shows_after_first_token,
        test_caret_hides_on_complete_or_stop,
        test_never_with_waiting_dots,
        test_chrome_12pt_muted_reduce_motion_static,
        test_not_on_tool_widget_approve_connect_user_right,
        test_stick_multi_bubbles_waiting_stop_openapi,
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
