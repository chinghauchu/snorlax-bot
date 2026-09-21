#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.49 iOS optimistic user-RIGHT bubble on Send.

On Send: immediately show an optimistic user-RIGHT bubble. On success,
reconcile with the server/turn message (no duplicate). On failure: drop
the optimistic bubble, restore composer text, muted Couldn't send. hint.
Keep v0.47 stick-to-bottom and v0.48 multi-bubbles. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
MODELS = (IOS / "Models.swift").read_text(encoding="utf-8")
OPT = (IOS / "OptimisticSend.swift").read_text(encoding="utf-8")
STICK = (IOS / "StickToBottom.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_SEND = (ROOT / "desktop" / "src" / "optimisticSend.ts").read_text(
    encoding="utf-8"
)
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")

COULDNT = "Couldn't send."


def _fn(src: str, name: str) -> str:
    marker = f"func {name}"
    start = src.index(marker)
    nxt = src.find("\n    func ", start + len(marker))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(marker))
    return src[start:nxt] if nxt > 0 else src[start:]


def test_insert_optimistic_user_right() -> None:
    assert 'static let idPrefix = "local-"' in OPT
    assert "static func insert(" in OPT
    assert "static func optimisticUser(" in MODELS
    assert "OptimisticSend.idPrefix" in MODELS
    assert "kind: .message" in MODELS
    assert 'senderId: "user"' in MODELS
    send = _fn(MODEL, "send()")
    assert "Message.optimisticUser(" in send
    assert "OptimisticSend.insert(messages, user)" in send
    assert "optimisticUserMessage(" in DESKTOP_APP
    assert "insertOptimistic(" in DESKTOP_APP
    assert 'COULDNT_SEND = "Couldn\'t send."' in DESKTOP_SEND


def test_success_reconcile_no_duplicate() -> None:
    assert "static func reconcile(listed:" in OPT
    assert "static func absorb(" in OPT
    send = _fn(MODEL, "send()")
    assert "OptimisticSend.reconcile(listed: listed)" in send
    assert "isOptimistic($0.id)" in OPT
    handle = MODEL[MODEL.find("case .done(let message)") :]
    handle = handle[: handle.find("case .error")]
    assert "OptimisticSend.absorb(messages, incoming: message)" in handle
    assert "reconcileOptimistic(" in DESKTOP_APP
    assert "absorbServerUser(" in DESKTOP_APP


def test_failure_restore_and_couldnt_send() -> None:
    assert f'static let couldntSend = "{COULDNT}"' in OPT
    assert "static func fail(" in OPT
    send = _fn(MODEL, "send()")
    assert "OptimisticSend.fail(messages, id: user.id)" in send
    assert "draft = content" in send
    assert "pendingAttachments = chips" in send
    assert "composerError = failed.hint" in send
    assert "OptimisticSend.composerHint(error:" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert ".foregroundStyle(.secondary)" in CHAT
    assert "failOptimistic(" in DESKTOP_APP
    assert "if (content) setDraft(content)" in DESKTOP_APP
    assert "COULDNT_SEND" in DESKTOP_APP
    assert "composerSendHint" in DESKTOP_APP
    assert 'className="composer-hint"' in DESKTOP_APP


def test_stick_multi_bubbles_openapi_no_computer_pane() -> None:
    assert "static let nearBottom: CGFloat = 64" in STICK
    assert "static func bubbles(in text: String, completed: Bool)" in MARKDOWN
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.49" in OPENAPI
    assert "v0.49" in RUNTIME_OPENAPI
    assert "v0.49" in DESKTOP_OPENAPI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in OPT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "/v1/chats/" not in OPT
    assert "/v1/optimistic" not in CHAT


def main() -> int:
    tests = [
        test_insert_optimistic_user_right,
        test_success_reconcile_no_duplicate,
        test_failure_restore_and_couldnt_send,
        test_stick_multi_bubbles_openapi_no_computer_pane,
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
