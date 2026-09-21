#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.59 iOS focus composer after Stop.

When Stop or Esc aborts an in-flight assistant turn, return focus to
the composer immediately — but only when a hardware keyboard is
attached. Do not force the software keyboard up. Natural complete /
error / empty leave focus alone. Send re-enable timing unchanged
(v0.55). Esc=Stop skips IME composing and pending widget/approve/
connect (v0.53). No new HTTP. OpenAPI stays 0.18.0. Keep v0.47–v0.58
intact. Never reintroduce computerPane.ts.
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


def test_stop_focuses_composer() -> None:
    after = _fn(STOP, "shouldFocusComposerAfterAbort")
    assert "hardwareKeyboardAttached" in after
    stop = _fn(MODEL, "stopGenerating()")
    assert "StopGenerating.shouldFocusComposerAfterAbort" in stop
    assert "hardwareKeyboardAttached: StopGenerating.hardwareKeyboardAttached" in stop
    assert "wantsComposerFocus = true" in stop
    assert "streamTask?.cancel()" in stop
    assert "Button(StopGenerating.label)" in CHAT
    assert "model.stopGenerating()" in CHAT
    desktop_stop = _fn(DESKTOP_APP, "onStopGenerating()")
    assert "shouldFocusComposerAfterAbort()" in desktop_stop
    assert "focusComposer()" in desktop_stop
    assert "abortRef.current?.abort()" in desktop_stop


def test_esc_focuses_composer() -> None:
    from_esc = _fn(MODEL, "stopGeneratingFromEscape(composing: Bool)")
    assert "StopGenerating.escapeStops(" in from_esc
    assert "stopGenerating()" in from_esc
    assert "shouldFocusComposerAfterAbort(hardwareKeyboardAttached: true)" in from_esc
    assert "wantsComposerFocus = true" in from_esc
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "model.stopGeneratingFromEscape(composing: composing)" in CHAT
    esc_at = DESKTOP_APP.find("escapeStopsGenerating({")
    esc_block = DESKTOP_APP[esc_at - 400 : esc_at + 700]
    assert "onStopGenerating()" in esc_block
    assert 'event.key !== "Escape"' in esc_block
    desktop_stop = _fn(DESKTOP_APP, "onStopGenerating()")
    assert "shouldFocusComposerAfterAbort()" in desktop_stop
    assert "focusComposer()" in desktop_stop


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
    # Send still keeps focus after tapping Send (v0.49 / v0.47).
    after_defer = send[send.index("}", send.index("defer {")) + 1 :]
    assert "wantsComposerFocus = true" in after_defer
    on_send = _fn(DESKTOP_APP, "onSend()")
    assert "focusComposer()" in on_send


def test_ios_hardware_keyboard_only_no_soft_keyboard_force() -> None:
    assert "import GameController" in STOP
    assert "GCKeyboard.coalesced" in STOP
    hw = _fn(STOP, "hardwareKeyboardAttached")
    assert "GCKeyboard.coalesced != nil" in hw
    after = _fn(STOP, "shouldFocusComposerAfterAbort")
    assert "hardwareKeyboardAttached" in after
    desktop_after = _fn(DESKTOP_STOP, "shouldFocusComposerAfterAbort")
    assert "hardwareKeyboardAttached = true" in desktop_after
    stop = _fn(MODEL, "stopGenerating()")
    assert "StopGenerating.hardwareKeyboardAttached" in stop
    stop_btn = CHAT[CHAT.find("Button(StopGenerating.label)") :]
    stop_btn = stop_btn[: stop_btn.find("if stick.showJump")]
    assert "composerFocused = true" not in stop_btn
    assert "wantsComposerFocus" not in stop_btn
    sending = CHAT[CHAT.find("onChange(of: model.isSending)") :]
    sending = sending[: sending.find(".simultaneousGesture")]
    assert "composerFocused" not in sending
    assert "wantsComposerFocus" not in sending
    assert "becomeFirstResponder" in COMPOSER
    assert "focused.wrappedValue" in COMPOSER
    assert "do not force the software keyboard" in STOP
    assert "do not force the software keyboard" in DESKTOP_STOP


def test_send_reenable_and_esc_skip_unchanged() -> None:
    assert "static func reenabled(busy: Bool)" in MUTED
    send = _fn(MODEL, "send()")
    assert "defer {" in send
    assert "isSending = false" in send
    submit = _fn(DESKTOP_APP, "submitTurn")
    assert "setBusy(false)" in submit
    esc = _fn(STOP, "escapeStops")
    assert "!composing" in esc
    assert "!pendingWidget" in esc
    assert "!pendingApprove" in esc
    assert "!pendingConnect" in esc
    assert "markedTextRange" in COMPOSER
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "isComposerComposing(event)" in DESKTOP_APP
    assert "pendingWidget" in DESKTOP_APP
    assert "pendingApprove" in DESKTOP_APP
    assert "pendingConnect" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP


def test_openapi_stays_0180_and_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static func insert(" in OPT
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "static func whileGenerating(busy: Bool)" in MUTED
    assert "N tools" in COMPACT or "toolsLabel" in COMPACT
    assert "static func shouldRenderMarkdown" in PLAIN
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.59" in OPENAPI
    assert "v0.59" in RUNTIME_OPENAPI
    assert "v0.59" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "/v1/cancel" not in STOP
    assert "/v1/cancel" not in MODEL
    assert "/v1/cancel" not in DESKTOP_STOP
    assert "computerPane.ts" not in STOP
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert not DESKTOP_PANE.exists()
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "sendMutedWhileGenerating" in DESKTOP_APP
    assert "WAITING_DOT" in DESKTOP_APP


def main() -> int:
    tests = [
        test_stop_focuses_composer,
        test_esc_focuses_composer,
        test_complete_error_empty_do_not_steal_focus,
        test_ios_hardware_keyboard_only_no_soft_keyboard_force,
        test_send_reenable_and_esc_skip_unchanged,
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
