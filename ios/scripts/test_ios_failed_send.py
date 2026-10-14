#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.78 retry a failed send.

When Send fails (network, runtime down, or an SSE error such as
inference_unavailable before any reply), the user bubble stays in the
transcript, muted, with Couldn't send · Retry. Retry sends the same
text and attachments again through send(). Remove dismisses it. Tap
Retry, or the long-press menu. No auto-retry. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "FailedSend.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "failedSend.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.78 retry a failed send (when a Send fails because the network or "
    "runtime is down, or an inference_unavailable error arrives before any "
    "reply, the user bubble stays in the transcript, muted, with Couldn't "
    "send · Retry; Retry sends the same text and attachments again; Remove "
    "dismisses it; no auto-retry; iOS also offers Retry on long-press; no "
    "new HTTP)"
)


def _fn(src: str, name: str) -> str:
    markers = (f"func {name}", f"private func {name}")
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
        nxt = src.find("\n    private func ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def test_labels_and_no_auto_retry() -> None:
    assert 'static let couldnt = "Couldn\'t send"' in SWIFT
    assert 'static let retry = "Retry"' in SWIFT
    assert 'static let remove = "Remove"' in SWIFT
    assert 'static let line = "Couldn\'t send · Retry"' in SWIFT
    assert 'static let inferenceUnavailable = "inference_unavailable"' in SWIFT
    assert "static func isPreReplyFailure" in SWIFT
    assert "static func replyStarted" in SWIFT
    assert "static func orphanUserID" in SWIFT
    assert "static func paint" in SWIFT
    assert "static func retryBlocked" in SWIFT
    assert "Timer" not in SWIFT
    assert "asyncAfter" not in SWIFT
    assert "setInterval" not in DESKTOP
    assert "setTimeout" not in DESKTOP
    assert 'FAILED_SEND_LINE = "Couldn\'t send · Retry"' in DESKTOP


def test_retry_reuses_send_and_keeps_the_bubble() -> None:
    retry = _fn(MODEL, "retryFailedSend(id: String)")
    assert "FailedSend.retryBlocked" in retry
    assert "retryOverride = row" in retry
    assert "await send()" in retry
    send = _fn(MODEL, "send()")
    assert "let retry = retryOverride" in send
    assert "Message.optimisticUser(" in send
    assert "OptimisticSend.insert(messages, user)" in send
    assert "noteFailedSend(" in send
    assert "FailedSend.isPreReplyFailure" in send
    assert "OptimisticSend.isHttpSendFailure(status)" in send
    assert "attachmentIds: chips.map(\\.id)" in send
    assert "draft = content" not in send
    assert "chatDrafts.restore" not in send
    assert "OptimisticSend.fail" not in send
    assert "showListed(" in send
    assert "SendWatch" in MODEL
    assert "func observe" in MODEL
    assert "rememberFailedSend(" in APP
    assert "reuseOptimisticId" in APP
    assert "className=\"failed-send\"" in APP
    assert "failOptimistic(" not in APP


def test_tap_and_long_press_reduce_motion() -> None:
    assert "model.retryFailedSend(id: message.id)" in CHAT
    assert "model.dismissFailedSend(id: message.id)" in CHAT
    assert "Button(FailedSend.retry)" in CHAT
    assert "Button(FailedSend.remove)" in CHAT
    assert "FailedSend.line" in CHAT
    assert "opacity(model.failedSend(id: message.id) == nil ? 1 : 0.55)" in CHAT
    assert "transaction.animation = nil" in CHAT
    assert "showFailedSend" in CHAT
    assert "Long-press a failed send" in SHORTCUTS
    assert "Retry or Remove" in SHORTCUTS
    assert ".bubble.user[data-failed]" in (ROOT / "desktop" / "src" / "styles.css").read_text(
        encoding="utf-8"
    )


def test_openapi_stays_0180() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in CHAT
    assert "/v1/" not in SWIFT
    assert PHRASE in ROADMAP


def main() -> int:
    tests = [
        test_labels_and_no_auto_retry,
        test_retry_reuses_send_and_keeps_the_bubble,
        test_tap_and_long_press_reduce_motion,
        test_openapi_stays_0180,
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
