#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.54 iOS same-turn multi-bubble gap.

Consecutive LEFT bubbles from the same completed turn (blank-line split)
use a 6pt gap. Between different turns, and after tool / widget / approve
/ connect, keep 12pt. Mid-stream stays one growing bubble. User-right
unchanged (4pt same-sender / 16pt speaker change). No new HTTP. OpenAPI
stays 0.18.0. Keep v0.47–v0.53 intact. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_BUBBLES = (
    ROOT / "desktop" / "src" / "assistantBubbles.ts"
).read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")


def _block(css: str, selector: str) -> str:
    needle = f"\n{selector} {{"
    idx = css.find(needle)
    if idx < 0:
        raise AssertionError(f"missing {selector}")
    start = css.find("{", idx)
    end = css.find("}", start)
    return css[start : end + 1]


def test_same_turn_consecutive_left_6pt() -> None:
    assert "static let sameTurn: CGFloat = 6" in MARKDOWN
    assert "spacing: AssistantBubbleGap.sameTurn" in CHAT
    assert "SAME_TURN_LEFT_GAP_PX = 6" in DESKTOP_BUBBLES
    stack = _block(DESKTOP_CSS, ".assistant-bubbles")
    assert "gap: 6px" in stack
    assert "gap: 4px" not in stack
    assert "gap: 12px" not in stack
    bubbles_for = CHAT.find("ForEach(Array(leftBubbles.enumerated())")
    assert bubbles_for > 0
    stack_at = CHAT.rfind("VStack(alignment: .leading, spacing:", 0, bubbles_for)
    assert stack_at > 0
    assert "AssistantBubbleGap.sameTurn" in CHAT[stack_at : bubbles_for]


def test_different_turn_after_tool_widget_approve_connect_12pt() -> None:
    assert "static let differentTurn: CGFloat = 12" in MARKDOWN
    assert "return differentTurn" in MARKDOWN
    assert "AssistantBubbleGap.turnSpacing" in CHAT
    assert "DIFFERENT_TURN_GAP_PX = 12" in DESKTOP_BUBBLES
    left_new = _block(DESKTOP_CSS, ".turn.left.new-sender")
    left_same = _block(DESKTOP_CSS, ".turn.left.same-sender")
    assert "margin-top: 12px" in left_new
    assert "margin-top: 12px" in left_same
    assert "isToolLine" in CHAT
    assert "isWidget" in CHAT
    assert "isApprove" in CHAT
    assert "isConnect" in CHAT
    assert "after-tool" in DESKTOP_BUBBLES
    assert "after-widget" in DESKTOP_BUBBLES
    assert "after-approve" in DESKTOP_BUBBLES
    assert "after-connect" in DESKTOP_BUBBLES


def test_mid_stream_unchanged_user_right_unchanged() -> None:
    assert "if !completed { return [text] }" in MARKDOWN
    assert "if (!completed) return [src]" in DESKTOP_BUBBLES
    assert 'case "mid-stream"' in DESKTOP_BUBBLES
    assert "static let userSameSender: CGFloat = 4" in MARKDOWN
    assert "static let userNewSender: CGFloat = 16" in MARKDOWN
    user_same = _block(DESKTOP_CSS, ".turn.same-sender")
    user_new = _block(DESKTOP_CSS, ".turn.new-sender")
    assert "margin-top: 4px" in user_same
    assert "margin-top: 16px" in user_new
    user_idx = CHAT.find("MentionLabel(text: message.displayContent")
    assert user_idx > 0
    user_slice = CHAT[user_idx : user_idx + 400]
    assert "MarkdownSplit.bubbles" not in user_slice
    assert "AssistantMarkdown" not in user_slice
    assert 'className="bubble user"' in DESKTOP_APP


def test_openapi_0180_and_intact_stack() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.54" in OPENAPI
    assert "v0.54" in RUNTIME_OPENAPI
    assert "v0.54" in DESKTOP_OPENAPI
    assert "0.19" not in OPENAPI.split("version:", 1)[-1][:40]
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static func insert(" in OPT
    assert "static func shouldOffer" in STOP
    assert "static func shouldShow" in WAITING
    assert "StreamingCaretChrome" in CARET or "shouldShow" in CARET
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "UIKeyCommand" in COMPOSER
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MARKDOWN
    assert "/v1/bubbles" not in MARKDOWN
    assert "/v1/cancel" not in OPENAPI


def main() -> int:
    tests = [
        test_same_turn_consecutive_left_6pt,
        test_different_turn_after_tool_widget_approve_connect_12pt,
        test_mid_stream_unchanged_user_right_unchanged,
        test_openapi_0180_and_intact_stack,
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
