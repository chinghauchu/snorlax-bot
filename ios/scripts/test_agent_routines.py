#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.33 iOS: agent-created routines stay kind=widget; long URLs wrap.

Create / delete confirm cards reuse WidgetCard (no ApproveCard fork).
User-right bubbles wrap unbroken URLs. OpenAPI stays 0.18.0.
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
WIDGET = (IOS / "WidgetCard.swift").read_text(encoding="utf-8")
APPROVE = (IOS / "ApproveCard.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")


def test_routine_confirm_reuses_widget_card() -> None:
    assert "struct WidgetCardView" in WIDGET
    assert "WidgetCardView(message: message)" in CHAT
    assert "kind == .widget" in MODELS or "isWidget" in MODELS
    assert "case widget" in TYPES
    assert "ApproveCard" not in WIDGET
    assert "kind=approve" in APPROVE or "struct ApproveCardView" in APPROVE
    assert "routineConfirm" not in CHAT
    assert "kind == .routine" not in MODELS
    assert "create_routine" not in CLIENT
    assert "pause_routine" not in CLIENT
    assert "/v1/chats/" not in CLIENT
    assert "version: 0.18.0" in OPENAPI
    assert "0.18.0" in TYPES
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in WIDGET
    assert "v0.33" in OPENAPI
    assert "create_routine" in OPENAPI
    assert "delete_routine" in OPENAPI


def test_user_bubble_wraps_long_unbroken_url() -> None:
    assert "byCharWrapping" in COMPONENTS
    assert ".lineLimit(nil)" in COMPONENTS
    assert ".fixedSize(horizontal: false, vertical: true)" in COMPONENTS
    assert ".frame(minWidth: 0, alignment: .leading)" in COMPONENTS
    assert "MentionLabel" in CHAT
    assert ".frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)" in CHAT
    assert "byCharWrapping" in MARKDOWN
    assert ".lineLimit(nil)" in MARKDOWN
    assert "overflow-x" not in MARKDOWN.lower() or "ScrollView(.horizontal" in MARKDOWN
    assert "ScrollView(.horizontal" in MARKDOWN
    assert "computerPane.ts" not in COMPONENTS
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    tests = [
        test_routine_confirm_reuses_widget_card,
        test_user_bubble_wraps_long_unbroken_url,
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
