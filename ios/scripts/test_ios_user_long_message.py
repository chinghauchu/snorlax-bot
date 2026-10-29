#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.16 collapse long user messages.

A settled user message taller than about 14 lines shows the first
chunk and a muted Show more. Tap expands it and the control becomes
Show less. An in-flight optimistic send stays open. A failed send
can collapse. An active find match stays fully visible. Assistant
collapse is unchanged. No new HTTP. OpenAPI stays 0.18.0.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "UserLongMessage.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LONG = (IOS / "LongMessage.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "userLongMessage.ts").read_text(encoding="utf-8")
VIEW = (ROOT / "desktop" / "src" / "UserMessageClamp.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.16 collapse long user messages"


def settled(from_user: bool, kind_message: bool, has_text: bool, pending: bool) -> bool:
    return from_user and kind_message and has_text and (not pending)


def test_rules() -> None:
    user = dict(from_user=True, kind_message=True, has_text=True, pending=False)
    assert settled(**user) is True
    assert settled(**{**user, "pending": True}) is False
    assert settled(**{**user, "has_text": False}) is False
    assert settled(**{**user, "from_user": False}) is False
    assert settled(**{**user, "kind_message": False}) is False
    assert "static func settled(" in SWIFT
    assert "fromUser && kindMessage && hasText && !pending" in SWIFT
    assert "LongMessageBody(" in SWIFT
    assert "completed: settled" in SWIFT
    assert "activeFind: activeFind" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "export function userLongMessageSettled" in DESKTOP
    assert "if (input.pending) return false" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "completed={settled}" in VIEW
    assert "activeFind={activeFind}" in VIEW
    assert "<LongMessageBody" in VIEW
    assert "focusComposer" not in VIEW
    assert ".focus(" not in VIEW
    assert 'static let showMore = "Show more"' in LONG
    assert 'static let showLess = "Show less"' in LONG
    assert "static let lines: CGFloat = 14" in LONG


def test_clients_clamp_settled_user_bubbles() -> None:
    user = CHAT.split("} else if isUser {", 1)[1].split("} else {", 1)[0]
    assert "UserMessageClamp(" in user
    assert "UserLongMessage.settled(" in user
    assert "message.isFromUser" in user
    assert "message.isKindMessage" in user
    assert "OptimisticSend.isOptimistic(message.id)" in user
    assert "model.failedSend(id: message.id) == nil" in user
    assert "ChatFind.queryActive(find.query)" in user
    assert "MentionLabel(" in user
    assert "links: true" in user
    assert "userQuoteBody" in user
    assert "LongMessageBody" not in user
    assert CHAT.index("UserMessageClamp(") < CHAT.index("LongMessageBody(")
    assert ".focusable(false)" in LONG
    desktop_user = APP.split('className="bubble user"', 1)[1].split(
        'className="assistant-md"', 1
    )[0]
    assert "<UserMessageClamp" in desktop_user
    assert "userLongMessageSettled(" in desktop_user
    assert "isUserKindMessage(message)" in desktop_user
    assert "userCopyPending(" in desktop_user
    assert 'findRowActive(message.id) === "true"' in desktop_user
    assert "<pre>" in desktop_user
    assert "LongMessageBody" not in desktop_user
    assert "Regenerate" not in desktop_user
    left = APP.split('className="assistant-bubbles"', 1)[1].split("showAssistantCopy", 1)[0]
    assert "<LongMessageBody" in left


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 216. v2.16" in SPEC
    assert "OpenAPI stays **0.18.0**" in SPEC
    assert "python3 ios/scripts/test_ios_user_long_message.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_rules,
        test_clients_clamp_settled_user_bubbles,
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
