#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.48 iOS short multi-bubbles on completed LEFT kind=message.

Completed assistant LEFT kind=message splits on blank lines. Mid-stream
stays one growing bubble. Copy / Speak / Regenerates only on the last
bubble of that turn. Tool / widget / approve / connect and user-right
unchanged. v0.47 stick-to-bottom stands. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_BUBBLES = (
    ROOT / "desktop" / "src" / "assistantBubbles.ts"
).read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")


def test_split_on_blank_lines_and_mid_stream_single() -> None:
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "if !completed { return [text] }" in MARKDOWN
    assert "splitAssistantBubbles" in DESKTOP_BUBBLES
    assert "if (!completed) return [src]" in DESKTOP_BUBBLES
    assert "MarkdownSplit.bubbles" in CHAT
    assert "leftBubbles" in CHAT
    assert "ForEach(Array(leftBubbles.enumerated())" in CHAT
    assert "completed: completed" in CHAT
    assert "secondarySystemFill" in CHAT
    assert "cornerRadius: 16" in CHAT
    assert 'className="assistant-bubbles"' in DESKTOP_APP
    assert "bubble agent" in DESKTOP_APP


def test_actions_only_on_last_bubble() -> None:
    bubbles_for = CHAT.find("ForEach(Array(leftBubbles.enumerated())")
    assert bubbles_for > 0
    chunk = CHAT[bubbles_for : bubbles_for + 1800]
    actions = chunk.find("if showCopy || showSpeak")
    assert actions > 0
    for_each = chunk[:actions]
    assert "Button(copied" not in for_each
    assert 'Button("Regenerate")' not in for_each
    assert "Speak.label" not in for_each
    stack = DESKTOP_APP.find("assistant-bubbles")
    assert stack > 0
    assert "MessageActions" not in DESKTOP_APP[
        stack : DESKTOP_APP.find("showAssistantCopy", stack)
    ]


def test_tool_widget_user_right_and_stick_unchanged() -> None:
    user_idx = CHAT.find("MentionLabel(text: message.displayContent")
    assert user_idx > 0
    user_slice = CHAT[user_idx : user_idx + 400]
    assert "MarkdownSplit.bubbles" not in user_slice
    assert "AssistantMarkdown" not in user_slice
    assert "isToolLine" in CHAT
    assert "isWidget" in CHAT
    assert "isConnect" in CHAT
    assert "isApprove" in CHAT
    assert "followStream(proxy)" in CHAT
    assert "if StickToBottom.shouldFollow(stick)" in CHAT
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert 'JUMP_TO_LATEST_LABEL = "Jump to latest"' in (
        ROOT / "desktop" / "src" / "stickToBottom.ts"
    ).read_text(encoding="utf-8")
    assert "shouldFollowStream" in DESKTOP_APP


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.48" in OPENAPI
    assert "v0.48" in RUNTIME_OPENAPI
    assert "v0.48" in DESKTOP_OPENAPI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MARKDOWN
    assert "/v1/bubbles" not in MARKDOWN
    assert "/v1/chats/" not in MARKDOWN
    assert "Do not rewrite" in OPENAPI or "split one Message into many" in OPENAPI


def main() -> int:
    tests = [
        test_split_on_blank_lines_and_mid_stream_single,
        test_actions_only_on_last_bubble,
        test_tool_widget_user_right_and_stick_unchanged,
        test_openapi_stays_0180_and_no_computer_pane,
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
