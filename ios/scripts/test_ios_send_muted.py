#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.55 iOS Send muted while generating.

While an assistant turn is in flight (from Send until complete / Stop /
error / empty): Send control is muted and disabled; Enter does not send.
Composer text stays editable (draft the next message). Stop + Esc
unchanged; IME composing still skips Esc=Stop. On complete / Stop /
error / empty: Send re-enables immediately. No new HTTP. OpenAPI stays
0.18.0. Keep v0.47–v0.54 intact. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
MUTED = (IOS / "SendMuted.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
STOP = (IOS / "StopGenerating.swift").read_text(encoding="utf-8")
CARET = (IOS / "StreamingCaret.swift").read_text(encoding="utf-8")
WAITING = (IOS / "Waiting.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_MUTED = (ROOT / "desktop" / "src" / "sendMuted.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(
    encoding="utf-8"
)


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


def test_send_muted_disabled_while_generating() -> None:
    assert "static func whileGenerating(busy: Bool)" in MUTED
    while_gen = _fn(MUTED, "whileGenerating(busy: Bool)")
    assert "busy" in while_gen
    assert "static let disabledOpacity: CGFloat = 0.35" in MUTED
    assert "SendMuted.whileGenerating(busy: model.isSending)" in CHAT
    assert ".accessibilityLabel(\"Send\")" in CHAT
    send_idx = CHAT.find('.accessibilityLabel("Send")')
    send_slice = CHAT[max(0, send_idx - 500) : send_idx + 80]
    assert "SendMuted.whileGenerating(busy: model.isSending)" in send_slice
    assert "SendMuted.disabledOpacity" in send_slice
    assert ".disabled(!canSend)" in send_slice
    assert "sendMutedWhileGenerating" in DESKTOP_MUTED
    assert "sendMutedWhileGenerating(busy)" in DESKTOP_APP
    assert 'aria-label="Send"' in DESKTOP_APP
    assert "opacity: 0.35" in DESKTOP_CSS
    send_css = DESKTOP_CSS[
        DESKTOP_CSS.find(".send:disabled") : DESKTOP_CSS.find(
            ".send:disabled"
        )
        + 80
    ]
    assert "opacity: 0.35" in send_css


def test_enter_does_not_send_while_generating() -> None:
    enter = _fn(MUTED, "enterSends(busy: Bool)")
    assert "!whileGenerating(busy: busy)" in enter
    assert "sendMuted: SendMuted.whileGenerating(busy: model.isSending)" in CHAT
    assert "SendMuted.enterSends(busy: model.isSending)" in CHAT
    assert "var sendMuted = false" in COMPOSER
    presses = _fn(COMPOSER, "pressesBegan")
    assert "sendMuted" in presses
    assert "onReturnSend?()" in presses
    # Muted Return falls through to super (newline / draft), does not send.
    muted_at = presses.find("if sendMuted")
    send_at = presses.find("onReturnSend?()")
    assert muted_at >= 0 and send_at > muted_at
    assert "super.pressesBegan" in presses[muted_at:send_at]
    send = _fn(MODEL, "send()")
    assert "guard !isSending, !isAttaching else { return }" in send
    assert "enterSends" in DESKTOP_MUTED
    assert "sendMutedWhileGenerating(busy)" in DESKTOP_APP
    assert "composerEnterSends(event)" in DESKTOP_APP


def test_composer_stays_editable() -> None:
    editable = _fn(MUTED, "composerEditable")
    assert "!takeoverOpen" in editable
    assert "disabled: !(model.canCompose || model.isSending)" in CHAT
    assert "model.canCompose || model.isSending" in CHAT
    assert "view.isEditable = !disabled" in COMPOSER
    assert "<textarea" in DESKTOP_APP
    ta = DESKTOP_APP[
        DESKTOP_APP.find("<textarea") : DESKTOP_APP.find("</textarea>")
    ]
    assert "disabled={fieldDisabled}" in ta
    assert "disabled={busy}" not in ta
    assert "disabled={composerDisabled}" not in ta
    assert "composerEditableWhileGenerating" in DESKTOP_MUTED


def test_reenable_on_complete_stop_error_empty() -> None:
    reenabled = _fn(MUTED, "reenabled(busy: Bool)")
    assert "!whileGenerating(busy: busy)" in reenabled
    send = _fn(MODEL, "send()")
    assert "defer {" in send
    assert "isSending = false" in send
    assert "func stopGenerating()" in MODEL
    stop = _fn(MODEL, "stopGenerating()")
    assert "streamTask?.cancel()" in stop
    assert "sendReenabled" in DESKTOP_MUTED
    assert "setBusy(false)" in DESKTOP_APP
    submit = _fn(DESKTOP_APP, "submitTurn")
    assert "finally {" in submit
    assert "setBusy(false)" in submit
    assert "isAbortError" in submit
    assert "isHttpSendFailure" in submit or "COULDNT_SEND" in submit


def test_stop_esc_ime_widget_approve_connect_unchanged() -> None:
    assert "static func shouldOffer(busy: Bool)" in STOP
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "model.stopGenerating()" in CHAT
    assert "shouldOfferStop(busy)" in DESKTOP_APP
    assert 'className="stop-generating"' in DESKTOP_APP
    assert "static func escapeStops(" in STOP
    assert "!composing" in _fn(STOP, "escapeStops")
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "markedTextRange" in COMPOSER
    assert "escapeStopsGenerating" in DESKTOP_APP
    assert "isComposerComposing(event)" in DESKTOP_APP
    assert "!pendingWidget" in _fn(STOP, "escapeStops")
    assert "!pendingApprove" in _fn(STOP, "escapeStops")
    assert "!pendingConnect" in _fn(STOP, "escapeStops")
    assert "pendingWidget" in DESKTOP_APP
    assert "pendingApprove" in DESKTOP_APP
    assert "pendingConnect" in DESKTOP_APP


def test_no_new_http_openapi_intact_stack() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static let sameTurn: CGFloat = 6" in MARKDOWN
    assert "static func insert(" in OPT
    assert 'static let label = "Stop"' in STOP
    assert 'static let label = "···"' in WAITING
    assert "static func shouldShow(" in CARET
    assert "UIKeyCommand" in COMPOSER
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.55" in OPENAPI
    assert "v0.55" in RUNTIME_OPENAPI
    assert "v0.55" in DESKTOP_OPENAPI
    assert "0.19" not in OPENAPI.split("version:", 1)[-1][:40]
    assert "/v1/cancel" not in MUTED
    assert "/v1/cancel" not in COMPOSER
    assert "/v1/cancel" not in CHAT
    assert "/v1/cancel" not in DESKTOP_MUTED
    assert "/v1/cancel" not in DESKTOP_APP
    assert "/v1/cancel" not in OPENAPI
    assert "computerPane.ts" not in MUTED
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in COMPOSER
    assert not DESKTOP_PANE.exists()
    assert "showWaitingLine" in DESKTOP_APP
    assert "showStreamingCaret" in DESKTOP_APP
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "escapeStopsGenerating" in DESKTOP_APP


def main() -> int:
    tests = [
        test_send_muted_disabled_while_generating,
        test_enter_does_not_send_while_generating,
        test_composer_stays_editable,
        test_reenable_on_complete_stop_error_empty,
        test_stop_esc_ime_widget_approve_connect_unchanged,
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
