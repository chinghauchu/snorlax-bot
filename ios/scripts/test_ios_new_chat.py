#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.04 new chat from the keyboard.

Hardware command-N or control-N starts a new chat through the same
createAgent path as the New agent menu item. Focus lands in the
composer. The composer does not own the chord. IME and any other
text field do. Nothing is sent. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "NewChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "newChatKey.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.04 new chat from the keyboard (Cmd/Ctrl-N starts a new chat through "
    "the same New agent path as the sidebar Create control; focus lands in "
    "the composer; the chord still works from the composer because the "
    "platform does nothing useful with it there; IME composition keeps the "
    "key; a modal or overlay text field, find, the quick switcher, the "
    "shortcuts list, rename, the lightbox, and a focused widget, approve, or "
    "connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, "
    "Cmd/Ctrl-Shift-C, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, "
    "and Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl N; iOS "
    "hardware command-N uses the same create path and is listed in Gestures "
    "& shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or shift:
        return False
    if command == control:
        return False
    if key.lower() == "n":
        return True
    return characters.lower() == "n"


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_and_composer() -> None:
    assert is_chord("n", command=True) is True
    assert is_chord("N", control=True) is True
    assert is_chord("n", command=True, characters="n") is True
    assert is_chord("n") is False
    assert is_chord("n", command=True, shift=True) is False
    assert is_chord("n", command=True, option=True) is False
    assert is_chord("n", command=True, control=True) is False
    assert is_chord("k", command=True) is False
    assert is_chord("l", command=True) is False
    assert is_chord("f", command=True) is False
    assert is_chord("c", command=True, shift=True) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘N"' in SWIFT
    assert 'static let action = "New chat"' in SWIFT
    assert "func isChord" in SWIFT
    assert "func overlayTextFieldOwnsChord" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "Cmd/Ctrl N" in DESKTOP
    assert "isNewChatChord" in DESKTOP
    assert "newChatBlocked" in DESKTOP
    assert "overlayTextFieldOwnsNewChat" in DESKTOP


def test_existing_create_path() -> None:
    start = MODEL.index("func createAgentFromChord")
    end = MODEL.index("func createChannel", start)
    chord = MODEL[start:end]
    assert "isConfigured" in chord
    assert "await createAgent()" in chord
    assert "send(" not in chord
    create = MODEL[MODEL.index("func createAgent()") : MODEL.index("func createChannel")]
    assert 'createAgent(name: "New agent")' in create
    assert "wantsComposerFocus = true" in create
    assert "func newChatKey" in CHAT
    assert "NewChat.isChord" in CHAT
    assert "createAgentFromChord()" in CHAT
    assert "composerFocused" in CHAT
    assert "findOpen" in CHAT
    assert "shortcutsOpen" in CHAT
    assert "func newChatKey" in LIST
    assert "NewChat.isChord" in LIST
    assert "createAgentFromChord()" in LIST
    assert 'Button("New agent")' in LIST
    assert "showCreateChannel" in LIST
    assert "renamingID" in LIST
    commands = COMPOSER[
        COMPOSER.index("func newChatCommands") : COMPOSER.index("func chatNavCommands")
    ]
    assert 'input: "n"' in commands
    assert "modifierFlags: .command" in commands
    assert "modifierFlags: .control" in commands
    assert "func newChatFromShortcut" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "onNewChat?()" in COMPOSER
    assert "model.send(" not in commands
    assert "const onNewChatKey" in APP
    assert "createFromShortcutRef.current()" in APP
    assert "void onCreate()" in APP
    assert 'createAgent(session, "New agent")' in APP
    assert 'addEventListener("keydown", onNewChatKey, true)' in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "NewChat.keysLabel" in SHEET
    assert "NewChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.04 " in ROADMAP
    assert "## 104. v1.04" in SPEC
    assert "python3 ios/scripts/test_ios_new_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_composer,
        test_existing_create_path,
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
    sys.exit(main())
