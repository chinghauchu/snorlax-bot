#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.99 focus the composer.

Hardware command-L or control-L focuses the composer and inserts
nothing. Plain letters are not this chord. Find, the shortcuts
sheet, and the lightbox keep their keys. Nothing auto-sends.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "FocusComposer.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "focusComposerKey.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.99 focus the composer (when the open chat is showing and focus is "
    "outside a text field, a printable character focuses the composer and "
    "lands at the end of the draft; Cmd/Ctrl-L focuses it and inserts nothing; "
    "Cmd/Ctrl, Alt, Esc, arrows, Tab, Enter, and IME are not captured; "
    "question mark still opens shortcuts; find, the quick switcher, the "
    "shortcuts list, rename, the lightbox, and a focused widget, approve, or "
    "connect card stay; nothing auto-sends; Up-arrow recall, Esc = Stop, "
    "Esc = Jump, Alt+Up/Down, and in-chat find stay; the shortcuts list "
    "includes Cmd/Ctrl L; iOS hardware command-L focuses the composer and is "
    "listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key: str, command=False, control=False, option=False, shift=False, characters=""):
    if option or shift:
        return False
    if command == control:
        return False
    if key.lower() == "l":
        return True
    return characters.lower() == "l"


def test_chord_does_not_insert() -> None:
    assert is_chord("l", command=True) is True
    assert is_chord("L", control=True) is True
    assert is_chord("l", command=True, characters="l") is True
    assert is_chord("x", command=True, characters="l") is True
    assert is_chord("l") is False
    assert is_chord("l", command=True, control=True) is False
    assert is_chord("l", command=True, shift=True) is False
    assert is_chord("l", command=True, option=True) is False
    assert is_chord("k", command=True) is False
    assert is_chord("/", command=False) is False
    assert 'static let keysLabel = "⌘L"' in SWIFT
    assert 'static let action = "Focus the composer"' in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "Cmd/Ctrl L" in DESKTOP
    assert "isFocusComposerChord" in DESKTOP
    assert "typeToFocusCharacter" in DESKTOP
    assert "appendDraftAtEnd" in DESKTOP


def test_chat_focuses_without_sending() -> None:
    start = CHAT.index("func focusComposerKey")
    end = CHAT.index("private func openFind", start)
    handler = CHAT[start:end]
    assert "FocusComposer.isChord" in handler
    assert "composerFocused = true" in handler
    assert "pendingComposerCaret" in handler
    assert "findOpen" in handler
    assert "findFieldFocused" in handler
    assert "shortcutsOpen" in handler
    assert "lightbox != nil" in handler
    assert "computerTakeoverOpen" in handler
    assert "showProfile" in handler
    assert "model.send(" not in handler
    assert "onFocusComposerKey" in APP or "const onFocusComposerKey" in APP
    assert "typeIntoComposerRef.current" in APP
    assert "appendDraftAtEnd(draftRef.current, character)" in APP
    assert 'addEventListener("keydown", onFocusComposerKey, true)' in APP
    assert "placeCaretAtEnd()" in APP
    assert "isShortcutsQuestion" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    focus = COMPOSER[COMPOSER.index("func focusComposerCommands") : COMPOSER.index("func chatNavCommands")]
    assert 'input: "l"' in focus
    assert "modifierFlags: .command" in focus
    assert "modifierFlags: .control" in focus
    assert "func focusComposerFromShortcut" in COMPOSER
    assert "func recallFromArrowUp" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "model.send(" not in focus
    assert "FocusComposer.keysLabel" in SHEET
    assert "FocusComposer.action" in SHEET
    assert "Recall last message" in SHEET
    assert "Find in chat" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v0.99 " in ROADMAP
    assert "## 99. v0.99" in SPEC
    assert "python3 ios/scripts/test_ios_focus_composer.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_does_not_insert,
        test_chat_focuses_without_sending,
        test_openapi_roadmap,
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
