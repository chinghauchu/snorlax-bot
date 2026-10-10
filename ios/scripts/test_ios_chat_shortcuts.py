#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.73 keyboard shortcuts help.

Desktop Cmd/Ctrl-/ or ? (outside a text field) opens an overlay of
the chat shortcuts that already exist. Esc or a click outside closes
it. iOS shows a Gestures & shortcuts sheet from the chat screen:
long-press actions, plus hardware keys from UIKeyCommand and
.keyboardShortcut. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
APPROVE = (IOS / "ApproveCard.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "chatShortcuts.ts").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.73 keyboard shortcuts (Cmd/Ctrl-/ or ? outside a text field "
    "opens a small overlay of the chat shortcuts that already exist; "
    "Esc or a click outside closes it; iOS Gestures & shortcuts sheet "
    "on the chat screen lists long-press actions and hardware-keyboard "
    "shortcuts; no new HTTP)"
)


def test_sheet_lists_existing_gestures_and_keys() -> None:
    assert "Gestures & shortcuts" in SHEET
    assert "Long-press a message" in SHEET
    assert "Copy, Speak, Regenerate, or the time" in SHEET
    assert "RecallDraft.editAsNewMessage" in SHEET
    assert "Copy the command" in SHEET
    assert "Hardware keyboard" in SHEET
    assert 'keys: "Return"' in SHEET
    assert 'keys: "Shift Return"' in SHEET
    assert 'keys: "Esc"' in SHEET
    assert "Recall last message" in SHEET
    assert "Find in chat" in SHEET
    assert "Stop, close, or jump" in SHEET
    assert "Next or previous match" in SHEET
    assert "No HTTP" in SHEET
    assert "/v1/" not in SHEET
    assert "Cmd/Ctrl K" not in SHEET
    assert "Switch chat" not in SHEET
    assert "computerPane.ts" not in SHEET
    # The sheet only names shortcuts the iOS handlers already implement.
    assert "UIKeyCommand" in SHEET
    assert ".keyboardShortcut" in SHEET


def test_chat_screen_reaches_the_sheet() -> None:
    assert "ChatShortcuts.title" in CHAT
    assert "ChatShortcutsSheet()" in CHAT
    assert "questionmark.circle" in CHAT
    assert 'keyboardShortcut("f"' in CHAT
    assert "magnifyingglass" in CHAT
    assert 'Button("Copy")' in CHAT
    assert "Speak.label" in CHAT
    assert 'Button("Regenerate")' in CHAT
    assert "RecallDraft.editAsNewMessage" in CHAT
    assert "onLongPressGesture" in APPROVE
    assert "UIKeyCommand.inputEscape" in COMPOSER
    assert "UIKeyCommand.inputUpArrow" in COMPOSER
    assert "keyboardReturn" in COMPOSER
    assert "keyboardReturnOrEnter" in COMPOSER
    assert ".shift" in COMPOSER


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    for doc in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in doc
        assert "version: 0.19" not in doc
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_shortcuts.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "isShortcutsChord" in DESKTOP
    assert "isShortcutsQuestion" in DESKTOP
    assert "escapeClosesShortcuts" in DESKTOP


def main() -> int:
    tests = [
        test_sheet_lists_existing_gestures_and_keys,
        test_chat_screen_reaches_the_sheet,
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
