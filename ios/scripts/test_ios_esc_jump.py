#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.60 iOS Esc = Jump when frozen.

When the Jump to latest chip is visible and no assistant turn is in
flight, hardware Escape (UIKeyCommand) activates Jump — same as
tapping the chip. While generating, Esc still Stop (v0.53). Skip Esc
when IME is composing (markedTextRange), or when a pending widget /
approve / connect card is up. Focus-after-Stop (v0.59) stays intact.
No new HTTP. OpenAPI stays 0.18.0. Keep v0.47–v0.59 intact. Never
reintroduce computerPane.ts.
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
MUTED = (IOS / "SendMuted.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
COMPACT = (IOS / "CompactToolTraces.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_STICK = (ROOT / "desktop" / "src" / "stickToBottom.ts").read_text(
    encoding="utf-8"
)
DESKTOP_STOP = (ROOT / "desktop" / "src" / "stopGenerating.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")


def _fn(src: str, name: str) -> str:
    markers = (
        f"func {name}",
        f"static func {name}",
        f"static var {name}",
        f"async function {name}",
        f"function {name}",
        f"export function {name}",
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
        nxt = src.find("\n    static var ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    async function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    export function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def test_esc_chip_visible_idle_activates_jump() -> None:
    jump = _fn(STICK, "escapeJumps")
    assert "showJump" in jump
    assert "!busy" in jump
    assert "func jumpToLatestFromEscape(composing: Bool, showJump: Bool)" in MODEL
    from_jump = _fn(MODEL, "jumpToLatestFromEscape(composing: Bool, showJump: Bool)")
    assert "StickToBottom.escapeJumps(" in from_jump
    assert "showJump: showJump" in from_jump
    assert "stickBump += 1" in from_jump
    assert "stopGenerating()" not in from_jump
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "model.stopGeneratingFromEscape(composing: composing)" in CHAT
    assert "model.jumpToLatestFromEscape(composing: composing, showJump: showJump)" in CHAT
    assert "showJump: stick.showJump" in CHAT
    assert "escapeJumpsToLatest" in DESKTOP_STICK
    assert "escapeJumpsToLatest" in DESKTOP_APP
    jump_at = DESKTOP_APP.find("escapeJumpsToLatest({")
    jump_block = DESKTOP_APP[jump_at : jump_at + 500]
    assert "onJumpLatest()" in jump_block
    assert "onClick={onJumpLatest}" in DESKTOP_APP
    assert 'className="jump-latest"' in DESKTOP_APP
    # Same as tapping the chip: snap + re-arm via stickBump / onJumpLatest.
    assert "onChange(of: model.stickBump)" in CHAT
    assert "snapToBottom(proxy)" in CHAT


def test_esc_generating_is_stop_not_jump() -> None:
    jump = _fn(STICK, "escapeJumps")
    assert "!busy" in jump
    esc = _fn(STOP, "escapeStops")
    assert "shouldOffer(busy: busy)" in esc
    from_stop = _fn(MODEL, "stopGeneratingFromEscape(composing: Bool)")
    assert "StopGenerating.escapeStops(" in from_stop
    assert "stopGenerating()" in from_stop
    assert "stickBump" not in from_stop
    assert "shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true)" in from_stop
    from_jump = _fn(MODEL, "jumpToLatestFromEscape(composing: Bool, showJump: Bool)")
    assert "busy: isSending" in from_jump
    assert "stickBump += 1" in from_jump
    # Composer calls Stop first, then Jump; Jump is a no-op while busy.
    esc_chat = CHAT[
        CHAT.find("onEscapeStop:") : CHAT.find(
            "sendMuted:", CHAT.find("onEscapeStop:")
        )
    ]
    stop_call = esc_chat.find("model.stopGeneratingFromEscape(composing: composing)")
    jump_call = esc_chat.find("model.jumpToLatestFromEscape(")
    assert stop_call >= 0 and jump_call > stop_call
    desktop_stop_at = DESKTOP_APP.find("escapeStopsGenerating({")
    desktop_jump_at = DESKTOP_APP.find("escapeJumpsToLatest({")
    assert desktop_stop_at >= 0 and desktop_jump_at > desktop_stop_at
    stop_branch = DESKTOP_APP[desktop_stop_at:desktop_jump_at]
    assert "onStopGenerating()" in stop_branch
    assert "return;" in stop_branch
    assert "onJumpLatest()" not in stop_branch
    desktop_jump = _fn(DESKTOP_STICK, "escapeJumpsToLatest")
    assert "if (input.busy) return false" in desktop_jump


def test_esc_ignored_during_ime_and_pending_cards() -> None:
    jump = _fn(STICK, "escapeJumps")
    assert "!composing" in jump
    assert "!pendingWidget" in jump
    assert "!pendingApprove" in jump
    assert "!pendingConnect" in jump
    handler = _fn(COMPOSER, "stopGeneratingFromEscape()")
    assert "markedTextRange" in handler
    assert "onEscapeStop?(composing)" in handler
    from_jump = _fn(MODEL, "jumpToLatestFromEscape(composing: Bool, showJump: Bool)")
    assert "composing: composing" in from_jump
    assert "StopGenerating.pendingWidget(in: messages)" in from_jump
    assert "StopGenerating.pendingApprove(in: messages)" in from_jump
    assert "StopGenerating.pendingConnect(in: messages)" in from_jump
    desktop_jump = _fn(DESKTOP_STICK, "escapeJumpsToLatest")
    assert "if (input.composing) return false" in desktop_jump
    assert "pendingWidget" in desktop_jump
    assert "pendingApprove" in desktop_jump
    assert "pendingConnect" in desktop_jump
    jump_call = DESKTOP_APP[
        DESKTOP_APP.find("escapeJumpsToLatest({") : DESKTOP_APP.find(
            "})", DESKTOP_APP.find("escapeJumpsToLatest({")
        )
        + 2
    ]
    assert "isComposerComposing(event)" in jump_call
    assert "isPendingWidget" in jump_call
    assert "isPendingApprove" in jump_call
    assert "isPendingConnect" in jump_call
    # v0.53 skips still stand for Stop.
    esc = _fn(STOP, "escapeStops")
    assert "!composing" in esc
    assert "!pendingWidget" in esc


def test_no_new_http_openapi_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert 'static let jumpLabel = "Jump to latest"' in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func insert(" in OPT
    assert "static func whileGenerating" in MUTED
    assert "shouldFocusComposerAfterAbort" in STOP
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.60" in OPENAPI
    assert "v0.60" in RUNTIME_OPENAPI
    assert "v0.60" in DESKTOP_OPENAPI
    assert "/v1/cancel" not in STICK
    assert "/v1/cancel" not in COMPOSER
    assert "/v1/cancel" not in CHAT
    assert "/v1/cancel" not in DESKTOP_STICK
    assert "/v1/cancel" not in DESKTOP_APP
    assert "/v1/cancel" not in OPENAPI
    assert "computerPane.ts" not in STICK
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in COMPOSER
    assert not DESKTOP_PANE.exists()
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "shouldFocusComposerAfterAbort" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP
    assert "from \"./compactToolTraces\"" in DESKTOP_APP or 'from "./compactToolTraces"' in DESKTOP_APP
    assert "from \"./midStreamPlaintext\"" in DESKTOP_APP or 'from "./midStreamPlaintext"' in DESKTOP_APP


def main() -> int:
    tests = [
        test_esc_chip_visible_idle_activates_jump,
        test_esc_generating_is_stop_not_jump,
        test_esc_ignored_during_ime_and_pending_cards,
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
