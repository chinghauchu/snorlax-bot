#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.47 iOS stick-to-bottom while streaming.

If the user is within ~64pt of the bottom, follow the stream. Scroll up
freezes — never yank mid-stream. Send and Regenerates snap and re-arm.
New assistant bubble while stuck shows a 12pt muted Jump to latest chip.
Composer focus stays after Send. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_STICK = (ROOT / "desktop" / "src" / "stickToBottom.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")


def _fn(src: str, name: str) -> str:
    marker = f"func {name}"
    start = src.index(marker)
    nxt = src.find("\n    func ", start + len(marker))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(marker))
    return src[start:nxt] if nxt > 0 else src[start:]


def test_near_bottom_64_and_jump_label() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert 'static let jumpLabel = "Jump to latest"' in STICK
    assert "NEAR_BOTTOM_PX = 64" in DESKTOP_STICK
    assert 'JUMP_TO_LATEST_LABEL = "Jump to latest"' in DESKTOP_STICK
    assert "onScrollGeometryChange" in CHAT
    assert "StickToBottom.isNearBottom" in CHAT
    assert "StickToBottom.jumpLabel" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert ".foregroundStyle(.secondary)" in CHAT


def test_stick_freeze_rearm_and_chip() -> None:
    assert "func shouldFollow" in STICK
    assert "func onUserScroll" in STICK
    assert "func onSendOrRegenerate" in STICK
    assert "func onJumpToLatest" in STICK
    assert "func onAssistantActivity" in STICK
    assert "showJump" in STICK
    assert "followStream(proxy)" in CHAT
    assert "snapToBottom(proxy)" in CHAT
    assert "if StickToBottom.shouldFollow(stick)" in CHAT
    assert "if stick.showJump" in CHAT
    old = (
        ".onChange(of: model.messages.count) { _, _ in\n"
        '                proxy.scrollTo("bottom", anchor: .bottom)\n'
        "            }"
    )
    assert old not in CHAT
    assert "onChange(of: model.stickBump)" in CHAT


def test_send_regenerate_snap_and_composer_focus() -> None:
    send = _fn(MODEL, "send()")
    regen = _fn(MODEL, "regenerate()")
    assert "wantsComposerFocus = true" in send
    assert "stickBump += 1" in send
    assert "stickBump += 1" in regen
    assert "var stickBump = 0" in MODEL
    assert "focusComposer()" in DESKTOP_APP
    assert "snapStick()" in DESKTOP_APP


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.47" in OPENAPI
    assert "v0.47" in RUNTIME_OPENAPI
    assert "v0.47" in DESKTOP_OPENAPI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in STICK
    assert "/v1/chats/" not in STICK
    assert "/v1/scroll" not in CHAT


def main() -> int:
    tests = [
        test_near_bottom_64_and_jump_label,
        test_stick_freeze_rearm_and_chip,
        test_send_regenerate_snap_and_composer_focus,
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
