#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.32 iOS shell Approve chrome lock.

Dedicated kind=approve LEFT card (not a WidgetCard fork). 240–320pt,
12pt radius/padding, 1pt separator. Command is 12pt mono, max 2 lines
+ ellipsis. Long-press copies the full command. Buttons stacked 6pt,
10pt under the command: Approve 44pt accent 28%, Deny 44pt. Trailing
× 20×20 = Deny. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
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
CARD = (IOS / "ApproveCard.swift").read_text(encoding="utf-8")
WIDGET = (IOS / "WidgetCard.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")


def test_dedicated_kind_approve_renderer() -> None:
    assert "struct ApproveCardView" in CARD
    assert "ApproveCardView(message: message)" in CHAT
    assert "isApprove" in MODELS
    assert "isApprove" in CHAT
    assert "WidgetCard" not in CARD
    assert "kind == .approve" in MODELS
    assert "case approve" in TYPES
    assert "var approve: ApproveCard?" in TYPES
    assert "var approveStatus: ApproveStatus?" in TYPES
    assert "var approveReply: ApproveReply?" in TYPES
    assert 'case denied' in TYPES or "denied" in TYPES


def test_card_chrome_240_320_12pt() -> None:
    assert ".frame(minWidth: 240, maxWidth: 320" in CARD
    assert ".padding(12)" in CARD
    assert "cornerRadius: 12" in CARD
    assert "lineWidth: 1" in CARD
    assert "Color(uiColor: .separator)" in CARD
    assert ".font(.system(size: 12, design: .monospaced))" in CARD
    assert "lineLimit(2)" in CARD
    assert "truncationMode(.tail)" in CARD
    assert "cwd" not in CARD.lower()
    assert ".onLongPressGesture" in CARD
    assert "UIPasteboard.general.string = card.command" in CARD
    assert "VStack(spacing: 6)" in CARD
    assert ".padding(.top, 10)" in CARD
    assert '.frame(height: 44)' in CARD
    assert "Color.accentColor.opacity(0.28)" in CARD
    assert 'Text("Approve")' in CARD
    assert 'Text("Deny")' in CARD
    assert ".frame(width: 20, height: 20)" in CARD
    assert 'accessibilityLabel("Deny")' in CARD
    assert 'Text("Denied")' in CARD
    assert ".font(.system(size: 12))" in CARD


def test_no_new_route_or_composer_or_settings() -> None:
    assert "func answerApprove" in MODEL
    assert "func denyApprove" in MODEL
    assert "approveReply: ApproveReply(id: id, approved: true)" in MODEL
    assert "approveReply: ApproveReply(id: id, dismissed: true)" in MODEL
    assert "approveReply: approveReply" in CLIENT
    assert "/v1/approve" not in CLIENT
    assert "/v1/approve" not in MODEL
    assert "/v1/approve" not in CHAT
    assert "computerPane.ts" not in CARD
    assert "computerPane.ts" not in CHAT
    assert "version: 0.18.0" in OPENAPI
    assert "0.18.0" in TYPES
    assert "kind=approve" in OPENAPI
    assert "approveReply" in OPENAPI


def main() -> int:
    tests = [
        test_dedicated_kind_approve_renderer,
        test_card_chrome_240_320_12pt,
        test_no_new_route_or_composer_or_settings,
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
