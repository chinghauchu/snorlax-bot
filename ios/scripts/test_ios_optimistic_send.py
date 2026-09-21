#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.49 iOS optimistic user-RIGHT bubble on Send.

On Send: immediately show an optimistic user-RIGHT bubble with text +
pending chips. Attachments upload first. Block a second Send until the
round-trip settles. Success reconciles to the server id. 4xx/5xx drop
the bubble, restore text + chips, muted Couldn't send. Regenerates
unchanged. Keep v0.47 stick-to-bottom and v0.48 multi-bubbles. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
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


def test_insert_optimistic_user_right() -> None:
    assert 'static let idPrefix = "local-"' in OPT
    assert "static func insert(" in OPT
    assert "static func optimisticUser(" in MODELS
    assert "OptimisticSend.idPrefix" in MODELS
    assert "kind: .message" in MODELS
    assert 'senderId: "user"' in MODELS
    send = _fn(MODEL, "send()")
    assert "Message.optimisticUser(" in send
    assert "chips.map(\\.asAttachment)" in send
    assert "OptimisticSend.insert(messages, user)" in send
    assert send.index("isSending = true") < send.index("OptimisticSend.insert")
    assert "wantsComposerFocus = true" in send
    assert "disabled: !(model.canCompose || model.isSending)" in CHAT
    assert "model.canCompose || model.isSending" in CHAT
    assert "fieldDisabled" in DESKTOP_APP
    assert "optimisticUserMessage(" in DESKTOP_APP
    assert "insertOptimistic(" in DESKTOP_APP
    assert "attachments: chips.map" in DESKTOP_APP
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
    assert "static func isHttpSendFailure" in OPT
    send = _fn(MODEL, "send()")
    assert "OptimisticSend.isHttpSendFailure(status)" in send
    assert "OptimisticSend.fail(messages, id: user.id)" in send
    assert "draft = content" in send
    assert "pendingAttachments = chips" in send
    assert "composerError = failed.hint" in send
    assert "OptimisticSend.composerHint(error:" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert ".foregroundStyle(.secondary)" in CHAT
    assert "failOptimistic(" in DESKTOP_APP
    assert "isHttpSendFailure" in DESKTOP_APP
    assert "if (content) setDraft(content)" in DESKTOP_APP
    assert "COULDNT_SEND" in DESKTOP_APP
    assert "composerSendHint" in DESKTOP_APP
    assert 'className="composer-hint"' in DESKTOP_APP


def test_upload_first_block_second_send_regenerate_unchanged() -> None:
    assert "var attachInFlight = 0" in MODEL
    assert "var isAttaching: Bool { attachInFlight > 0 }" in MODEL
    assert "!model.isAttaching" in CHAT
    assert "static func shouldBlockSend" in OPT
    send = _fn(MODEL, "send()")
    assert "guard !isSending, !isAttaching else { return }" in send
    add = _fn(MODEL, "addPendingFile")
    assert add.index("uploadAttachment") < add.index("pendingAttachments.append")
    assert "uploadAttachment" not in send
    assert "chips.map(\\.id)" in send
    regen = _fn(MODEL, "regenerate()")
    assert "OptimisticSend.insert" not in regen
    assert "optimisticUser" not in regen
    assert "regenerate: true" in regen
    assert "optimisticUser: true" not in _fn(DESKTOP_APP, "onRegenerate()")
    assert "shouldBlockSend" in DESKTOP_APP
    assert "attachInFlight" in DESKTOP_APP


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
        test_upload_first_block_second_send_regenerate_unchanged,
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
