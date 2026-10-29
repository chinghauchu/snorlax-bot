#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.15 edit an earlier message as a new draft.

Every settled user message with text can refill the composer on
desktop and iOS. Escape restores the text from immediately before
that action. Up-arrow still recalls only the latest message into
an empty composer. No new HTTP. OpenAPI stays 0.18.0.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "EditEarlierMessage.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "editEarlierMessage.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.15 edit an earlier message as a new draft"


def offers(from_user: bool, kind_message: bool, content: str, pending: bool) -> bool:
    return (not pending) and from_user and kind_message and len(content) > 0


def draft(current: str, message_text: str) -> dict | None:
    if len(message_text) == 0:
        return None
    return {"text": message_text, "caret": len(message_text), "restore": current}


def test_rules() -> None:
    user = dict(from_user=True, kind_message=True, content="earlier", pending=False)
    assert offers(**user) is True
    assert offers(**{**user, "pending": True}) is False
    assert offers(**{**user, "content": ""}) is False
    assert offers(**{**user, "from_user": False}) is False
    assert offers(**{**user, "kind_message": False}) is False
    assert draft("keep", "earlier") == {
        "text": "earlier",
        "caret": len("earlier"),
        "restore": "keep",
    }
    assert draft("keep", "") is None
    assert 'static let label = "Edit as new message"' in SWIFT
    assert "static func offers" in SWIFT
    assert "static func draft(current:" in SWIFT
    assert "static func restoredCaret" in SWIFT
    assert 'export const EDIT_EARLIER_LABEL = "Edit as new message"' in DESKTOP
    assert "export function offersEditAsNew" in DESKTOP
    assert "export function editAsNewDraft" in DESKTOP
    assert "export function restoredComposerCaret" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in DESKTOP
    assert "computerPane.ts" not in SWIFT


def test_clients_wire_every_settled_user_message() -> None:
    assert "EditEarlierMessage.offers(" in CHAT
    assert "showEditAsNew: EditEarlierMessage.offers(" in CHAT
    assert "OptimisticSend.isOptimistic(message.id)" in CHAT
    assert "model.failedSend(id: message.id) == nil" in CHAT
    assert "model.editAsNewMessage(message.content)" in CHAT
    assert "Button(RecallDraft.editAsNewMessage)" in CHAT
    assert "showEditAsNew: index == recallIdx" not in CHAT
    assert "func editAsNewMessage" in MODEL
    assert "EditEarlierMessage.draft(current: draft, messageText: text)" in MODEL
    assert "recallRestore = next.restore" in MODEL
    assert "wantsComposerFocus = true" in MODEL
    assert "let restore = recallRestore" in MODEL
    assert "EditEarlierMessage.restoredCaret(restore)" in MODEL
    assert "func recallLastSentFromArrowUp" in MODEL
    recall = MODEL.split("func recallLastSentFromArrowUp()", 1)[1].split(
        "func quoteIntoComposer(", 1
    )[0]
    assert 'recallRestore = ""' in recall
    assert "RecallDraft.arrowUpRecalls" in recall
    assert "function editEarlierIntoComposer" in APP
    assert "editAsNewDraft(draftRef.current, text)" in APP
    assert "recallRestoreRef.current = next.restore" in APP
    assert "function clearRecalledDraft" in APP
    assert "const restore = recallRestoreRef.current" in APP
    assert "setDraft(restore)" in APP
    assert "offersEditAsNew(" in APP
    assert "{EDIT_AS_NEW_MESSAGE}" in APP
    assert '<UserMessageCopy content={message.content} />' in APP
    edit = APP.split("function editEarlierIntoComposer(", 1)[1].split(
        "function quoteIntoComposer(", 1
    )[0]
    assert "onSend(" not in edit
    assert "queueFollowUp" not in edit
    assert "if (takeoverOpen) return" in edit


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "OpenAPI stays **0.18.0**" in SPEC
    assert "python3 ios/scripts/test_ios_edit_earlier_message.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules,
        test_clients_wire_every_settled_user_message,
        test_openapi_roadmap_ci_no_computer_pane,
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
    sys.exit(main())
