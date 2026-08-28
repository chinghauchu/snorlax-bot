#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.31 iOS Copy / Regenerate chrome lock.

Copy on completed LEFT kind=message (1:1 and channel). Regenerate only
on the latest completed LEFT kind=message in a 1:1. Hide while a stream
is in flight. POST body { regenerate: true }. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
MODELS = (IOS / "Models.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")


def test_copy_on_left_kind_message_not_tool_widget_connect() -> None:
    assert "showsCopy" in CHAT
    assert "isKindMessage" in MODELS
    assert "isKindMessage" in CHAT
    assert "Button(copied ? \"Copied\" : \"Copy\")" in CHAT
    assert "UIPasteboard.general.string = message.content" in CHAT
    assert "1_500_000_000" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert "HStack(spacing: 12)" in CHAT
    assert "isToolLine" in CHAT
    assert "isWidget" in CHAT
    assert "isConnect" in CHAT
    assert "isApprove" in CHAT
    assert "isFromUser" in CHAT
    assert "AssistantMarkdown" in MARKDOWN
    assert 'Button("Copy")' in MARKDOWN


def test_regenerate_last_one_to_one_only() -> None:
    assert "showsRegenerate" in CHAT
    assert 'Button("Regenerate")' in CHAT
    assert "func regenerate()" in MODEL
    assert "regenerate: true" in MODEL
    assert "dropLastAssistantTurn" in MODEL
    assert "agent.isChannel" in MODEL
    assert "!agent.isChannel" in MODEL
    assert "isChannel: agent.isChannel" in CHAT
    assert "model.isSending" in CHAT
    assert "var regenerate: Bool?" in TYPES
    assert "version: 0.18.0" in OPENAPI
    assert "0.18.0" in TYPES
    assert "/v1/chats/" not in CHAT
    assert "/v1/chats/" not in CLIENT
    assert "/v1/chats/" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CLIENT
    assert "voice" not in CHAT.lower() or "UIPasteboard" in CHAT


def main() -> int:
    tests = [
        test_copy_on_left_kind_message_not_tool_widget_connect,
        test_regenerate_last_one_to_one_only,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"{len(tests)} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
