#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.50 iOS Stop generating mid-stream.

While an assistant turn is in flight, offer 12pt muted Stop at the
bottom of the chat column (above Jump to latest if both show). Stop
is a client abort of the in-flight stream; keep the partial LEFT
text as completed. Hide Stop when idle. Composer stays focused.
No new HTTP. OpenAPI stays 0.18.0. Keep v0.47 stick-to-bottom,
v0.48 multi-bubbles, v0.49 optimistic Send. Never reintroduce
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
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
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
DESKTOP_API = (ROOT / "desktop" / "src" / "api.ts").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")

LABEL = "Stop"


def _fn(src: str, name: str) -> str:
    markers = (f"func {name}", f"async function {name}", f"function {name}")
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
        nxt = src.find("\n    async function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def test_stop_mid_stream_keeps_partial() -> None:
    assert f'static let label = "{LABEL}"' in STOP
    assert "static func keepPartial" in STOP
    assert "static func shouldRefetchAfterStop" in STOP
    assert "return false" in STOP
    send = _fn(MODEL, "send()")
    assert "StopGenerating.keepPartial(messages)" in send
    assert "StopGenerating.isAbort(error)" in send
    abort_at = send.index("if StopGenerating.isAbort")
    abort_end = send.index("let status:", abort_at)
    abort_block = send[abort_at:abort_end]
    assert "refreshMessages()" not in abort_block
    assert "OptimisticSend.fail" not in abort_block
    assert "keepPartialOnStop" in DESKTOP_APP
    assert "isAbortError" in DESKTOP_APP
    assert "shouldRefetchAfterStop" in DESKTOP_APP


def test_chrome_12pt_muted_stop_above_jump() -> None:
    assert 'STOP_LABEL = "Stop"' in DESKTOP_STOP
    overlay = CHAT[CHAT.find("StopGenerating.shouldOffer") :]
    overlay = overlay[: overlay.find("private func snapToBottom")]
    stop_at = overlay.find("Button(StopGenerating.label)")
    jump_at = overlay.find("Button(StickToBottom.jumpLabel)")
    assert stop_at >= 0 and jump_at > stop_at
    assert ".font(.system(size: 12))" in overlay
    assert ".foregroundStyle(.secondary)" in overlay
    assert "className=\"transcript-chips\"" in DESKTOP_APP
    assert "className=\"stop-generating\"" in DESKTOP_APP
    chips_at = DESKTOP_APP.find("className=\"transcript-chips\"")
    stop_chip = DESKTOP_APP.find("className=\"stop-generating\"", chips_at)
    jump_chip = DESKTOP_APP.find("className=\"jump-latest\"", chips_at)
    assert stop_chip > chips_at and jump_chip > stop_chip
    assert ".stop-generating" in DESKTOP_CSS
    assert "font-size: 12px" in DESKTOP_CSS[DESKTOP_CSS.find(".stop-generating") :]
    assert "stop.circle.fill" not in CHAT
    assert "className=\"send stop-generating\"" not in DESKTOP_APP
    assert '.accessibilityLabel("Send")' in CHAT
    assert 'aria-label="Send"' in DESKTOP_APP


def test_re_enables_composer_no_restart() -> None:
    assert "static func composerUsable" in STOP
    assert "static func shouldRestart" in STOP
    assert "static func shouldOffer" in STOP
    assert "func stopGenerating()" in MODEL
    assert "streamTask?.cancel()" in MODEL
    assert "streamEpoch += 1" in MODEL
    stop = _fn(MODEL, "stopGenerating()")
    assert "onSend()" not in stop
    assert "send()" not in stop.split("streamTask", 1)[-1]
    assert "wantsComposerFocus = true" in stop
    assert "StopGenerating.shouldOffer(busy: model.isSending)" in CHAT
    assert "model.stopGenerating()" in CHAT
    assert "shouldOfferStop" in DESKTOP_APP
    assert "onStopGenerating" in DESKTOP_APP
    assert "abortRef.current?.abort()" in DESKTOP_APP
    on_stop_start = DESKTOP_APP.find("function onStopGenerating()")
    on_stop = DESKTOP_APP[
        on_stop_start : DESKTOP_APP.find("async function onSend()", on_stop_start)
    ]
    assert "abortRef.current?.abort()" in on_stop
    assert "focusComposer()" in on_stop
    assert "onSend()" not in on_stop
    assert "submitTurn" not in on_stop


def test_client_abort_no_new_http() -> None:
    assert "withTaskCancellationHandler" in CLIENT
    assert "invalidateAndCancel()" in CLIENT
    assert "try Task.checkCancellation()" in CLIENT
    assert "signal?: AbortSignal" in DESKTOP_API
    assert "/v1/cancel" not in STOP
    assert "/v1/cancel" not in CLIENT
    assert "/v1/cancel" not in CHAT
    assert "/v1/cancel" not in DESKTOP_STOP
    assert "/v1/cancel" not in DESKTOP_APP
    assert "computerPane.ts" not in STOP
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert not DESKTOP_PANE.exists()


def test_stick_multi_bubbles_optimistic_openapi() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "static func insert(" in OPT
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.50" in OPENAPI
    assert "v0.50" in RUNTIME_OPENAPI
    assert "v0.50" in DESKTOP_OPENAPI
    assert "/v1/cancel" not in OPENAPI
    assert "/v1/cancel" not in RUNTIME_OPENAPI
    assert "/v1/cancel" not in DESKTOP_OPENAPI
    send = _fn(MODEL, "send()")
    assert "OptimisticSend.insert(messages, user)" in send
    assert "optimisticUser: true" in _fn(DESKTOP_APP, "onSend()")
    assert "onSendOrRegenerate" in DESKTOP_APP
    assert "splitAssistantBubbles" in DESKTOP_APP
    assert "if stick.showJump" in CHAT


def main() -> int:
    tests = [
        test_stop_mid_stream_keeps_partial,
        test_chrome_12pt_muted_stop_above_jump,
        test_re_enables_composer_no_restart,
        test_client_abort_no_new_http,
        test_stick_multi_bubbles_optimistic_openapi,
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
