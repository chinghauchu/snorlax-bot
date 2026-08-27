#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.29 iOS composer IME: Enter does not send while marked text is composing."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")


def test_marked_text_range_ignored() -> None:
    assert "markedTextRange" in COMPOSER
    assert "shouldChangeTextIn" in COMPOSER
    assert "keyboardReturn" in COMPOSER
    assert "modifierFlags.contains(.shift)" in COMPOSER
    assert "onReturnSend" in COMPOSER
    assert "onReturnSend" in CHAT
    assert "computerPane.ts" not in COMPOSER
    assert "computerPane.ts" not in CHAT


def test_roster_refreshes_on_create_tools() -> None:
    assert "create_agent" in MODEL
    assert "create_channel" in MODEL
    assert "refreshRosterQuietly" in MODEL


def main() -> int:
    tests = [test_marked_text_range_ignored, test_roster_refreshes_on_create_tools]
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
