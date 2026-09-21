#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.62 iOS focus composer after Jump.

When Jump to latest runs (chip tap or Esc=Jump), return focus to the
composer — but only when a hardware keyboard is attached. Do not force
the software keyboard up. Same focus helper as Stop (v0.59). Natural
complete / error / empty leave focus alone. Esc=Jump when frozen (v0.60)
and Esc=Stop while generating (v0.53) stay intact. No new HTTP. OpenAPI
stays 0.18.0. Keep v0.47–v0.61 intact. Never reintroduce computerPane.ts.
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
        f"const {name}",
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
    if nxt < 0:
        nxt = src.find("\n    const ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def _jump_chip() -> str:
    start = CHAT.find("Button(StickToBottom.jumpLabel)")
    if start < 0:
        raise AssertionError("missing Jump chip button")
    end = CHAT.find(".accessibilityLabel(StickToBottom.jumpLabel)", start)
    return CHAT[start:end] if end > start else CHAT[start:]


def _desktop_on_jump() -> str:
    start = DESKTOP_APP.find("const onJumpLatest = useCallback")
    if start < 0:
        raise AssertionError("missing onJumpLatest")
    end = DESKTOP_APP.find("useLayoutEffect", start)
    return DESKTOP_APP[start:end] if end > start else DESKTOP_APP[start:]


def test_chip_click_focuses_composer() -> None:
    chip = _jump_chip()
    assert "snapToBottom(proxy)" in chip
    assert "StopGenerating.shouldFocusComposerAfterAbort" in chip
    assert "hardwareKeyboardAttached: StopGenerating.hardwareKeyboardAttached" in chip
    assert "wantsComposerFocus = true" in chip
    assert "composerFocused = true" not in chip
    desktop_jump = _desktop_on_jump()
    assert "onJumpToLatest()" in desktop_jump
    assert "scrollTop = el.scrollHeight" in desktop_jump
    assert "shouldFocusComposerAfterAbort()" in desktop_jump
    assert "focusComposer()" in desktop_jump
    assert "onClick={onJumpLatest}" in DESKTOP_APP
    assert 'className="jump-latest"' in DESKTOP_APP
    jump_at = desktop_jump.index("onJumpToLatest()")
    scroll_at = desktop_jump.index("scrollTop = el.scrollHeight")
    gate_at = desktop_jump.index("shouldFocusComposerAfterAbort()")
    focus_at = desktop_jump.index("focusComposer()")
    assert jump_at < scroll_at < gate_at < focus_at


def test_esc_jump_focuses_composer() -> None:
    from_jump = _fn(MODEL, "jumpToLatestFromEscape(composing: Bool, showJump: Bool)")
    assert "StickToBottom.escapeJumps(" in from_jump
    assert "stickBump += 1" in from_jump
    assert "shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true)" in from_jump
    assert "wantsComposerFocus = true" in from_jump
    bump_at = from_jump.index("stickBump += 1")
    focus_at = from_jump.index("shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true)")
    assert bump_at < focus_at
    assert "stopGenerating()" not in from_jump
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "model.jumpToLatestFromEscape(composing: composing, showJump: showJump)" in CHAT
    jump_at = DESKTOP_APP.find("escapeJumpsToLatest({")
    jump_block = DESKTOP_APP[jump_at : jump_at + 500]
    assert "onJumpLatest()" in jump_block
    desktop_jump = _desktop_on_jump()
    assert "shouldFocusComposerAfterAbort()" in desktop_jump
    assert "focusComposer()" in desktop_jump


def test_esc_generating_is_stop_not_jump() -> None:
    jump = _fn(STICK, "escapeJumps")
    assert "!busy" in jump
    from_stop = _fn(MODEL, "stopGeneratingFromEscape(composing: Bool)")
    assert "stopGenerating()" in from_stop
    assert "stickBump" not in from_stop
    from_jump = _fn(MODEL, "jumpToLatestFromEscape(composing: Bool, showJump: Bool)")
    assert "busy: isSending" in from_jump
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


def test_complete_error_empty_do_not_steal_focus() -> None:
    settle = _fn(STOP, "shouldFocusComposerOnSettle")
    assert "false" in settle
    desktop_settle = _fn(DESKTOP_STOP, "shouldFocusComposerOnSettle")
    assert "return false" in desktop_settle
    send = _fn(MODEL, "send()")
    defer_at = send.index("defer {")
    defer_end = send.index("}", defer_at)
    defer = send[defer_at : defer_end + 1]
    assert "isSending = false" in defer
    assert "StopGenerating.shouldFocusComposerOnSettle()" in defer
    assert "wantsComposerFocus = true" in defer
    assert defer.index("shouldFocusComposerOnSettle") < defer.index(
        "wantsComposerFocus = true"
    )
    submit_start = DESKTOP_APP.find("async function submitTurn")
    submit = DESKTOP_APP[
        submit_start : DESKTOP_APP.find("function onStopGenerating()", submit_start)
    ]
    finally_at = submit.rfind("finally {")
    finally_block = submit[finally_at:]
    assert "setBusy(false)" in finally_block
    assert "shouldFocusComposerOnSettle()" in finally_block
    assert "focusComposer()" in finally_block
    assert finally_block.index("shouldFocusComposerOnSettle()") < finally_block.index(
        "focusComposer()"
    )
    before_gate = finally_block[: finally_block.index("shouldFocusComposerOnSettle()")]
    assert "focusComposer()" not in before_gate


def test_ios_hardware_keyboard_only_no_soft_keyboard_force() -> None:
    assert "import GameController" in STOP
    assert "GCKeyboard.coalesced" in STOP
    hw = _fn(STOP, "hardwareKeyboardAttached")
    assert "GCKeyboard.coalesced != nil" in hw
    after = _fn(STOP, "shouldFocusComposerAfterAbort")
    assert "hardwareKeyboardAttached" in after
    assert "Jump to latest" in STOP
    desktop_after = _fn(DESKTOP_STOP, "shouldFocusComposerAfterAbort")
    assert "hardwareKeyboardAttached = true" in desktop_after
    chip = _jump_chip()
    assert "StopGenerating.hardwareKeyboardAttached" in chip
    assert "composerFocused = true" not in chip
    sending = CHAT[CHAT.find("onChange(of: model.isSending)") :]
    sending = sending[: sending.find(".simultaneousGesture")]
    assert "composerFocused" not in sending
    assert "wantsComposerFocus" not in sending
    assert "do not force the software keyboard" in STOP
    assert "do not force the software keyboard" in DESKTOP_STOP


def test_openapi_stays_0180_and_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert 'static let jumpLabel = "Jump to latest"' in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static func insert(" in OPT
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func whileGenerating(busy: Bool)" in MUTED
    assert "N tools" in COMPACT or "toolsLabel" in COMPACT
    assert "static func shouldRenderMarkdown" in PLAIN
    assert "shouldFocusComposerAfterAbort" in STOP
    assert "escapeJumps" in STICK
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.62" in OPENAPI
    assert "v0.62" in RUNTIME_OPENAPI
    assert "v0.62" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "/v1/cancel" not in STICK
    assert "/v1/cancel" not in MODEL
    assert "/v1/cancel" not in DESKTOP_STOP
    assert "computerPane.ts" not in STICK
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert not DESKTOP_PANE.exists()
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "escapeJumpsToLatest" in DESKTOP_APP
    assert "shouldFocusComposerAfterAbort" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP
    assert "copiedFeedbackLabel" in DESKTOP_APP
    assert "WAITING_DOT" in DESKTOP_APP


def main() -> int:
    tests = [
        test_chip_click_focuses_composer,
        test_esc_jump_focuses_composer,
        test_esc_generating_is_stop_not_jump,
        test_complete_error_empty_do_not_steal_focus,
        test_ios_hardware_keyboard_only_no_soft_keyboard_force,
        test_openapi_stays_0180_and_intact_stack,
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
