#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.07 clear the composer draft from the keyboard.

Hardware command-shift-delete or control-shift-delete clears the open
chat's composer draft: unsent text and pending chips. Nothing is sent.
An already empty composer is a no-op. The composer does not own the
chord. IME and any other text field do. Nothing is cleared when no
chat is open. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ClearComposerDraft.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "clearComposerDraft.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.07 clear the composer draft from the keyboard (Cmd/Ctrl-Shift-Backspace "
    "clears the open chat's composer draft, text and pending chips, without "
    "sending; an already empty composer is a no-op; the chord still works from "
    "the composer; IME composition keeps the key; find, the quick switcher, the "
    "shortcuts list, rename, the lightbox, a modal or overlay text field, and a "
    "focused widget, approve, or connect card keep the key; nothing is cleared "
    "when no chat is open; plain Backspace still removes the last chip when the "
    "field is empty; Esc, Up-arrow recall, Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, "
    "Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-/, Cmd/Ctrl-1..9, "
    "Alt+Up/Down, PageUp/PageDown, and Cmd/Ctrl-Home/End stay; the shortcuts "
    "list includes Cmd/Ctrl Shift Backspace; iOS hardware command-shift-delete "
    "clears that draft the same way and is listed in Gestures & shortcuts; no "
    "new HTTP)"
)


def is_chord(command=False, control=False, option=False, shift=False, delete=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if delete:
        return True
    return characters == "\u0008"


def already_empty(text, chip_count):
    return text == "" and chip_count == 0


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_and_empty() -> None:
    assert is_chord(command=True, shift=True, delete=True) is True
    assert is_chord(control=True, shift=True, delete=True) is True
    assert is_chord(command=True, shift=True, characters="\u0008") is True
    assert is_chord(delete=True) is False
    assert is_chord(command=True, delete=True) is False
    assert is_chord(command=True, shift=True, option=True, delete=True) is False
    assert is_chord(command=True, control=True, shift=True, delete=True) is False
    assert is_chord(command=True, shift=True) is False
    assert already_empty("", 0) is True
    assert already_empty("hello", 0) is False
    assert already_empty(" ", 0) is False
    assert already_empty("", 2) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧⌫"' in SWIFT
    assert 'static let action = "Clear the draft"' in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isClearComposerDraftChord" in DESKTOP
    assert "clearComposerDraftBlocked" in DESKTOP
    assert "composerDraftAlreadyEmpty" in DESKTOP
    assert "No HTTP" in DESKTOP


def test_clears_text_and_chips() -> None:
    start = CHAT.index("func clearComposerDraftKey")
    end = CHAT.index("func clearComposerDraftFromComposer", start)
    key = CHAT[start:end]
    assert "ClearComposerDraft.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "model.clearComposerDraftFromChord()" in key
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "model.clearComposerDraftFromChord()" in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    clear = MODEL[
        MODEL.index("func clearComposerDraftFromChord()") : MODEL.index(
            "func removeLastPendingChipFromBackspace"
        )
    ]
    assert "ClearComposerDraft.alreadyEmpty" in clear
    assert "pendingAttachments = []" in clear
    assert 'draft = ""' in clear
    assert "send()" not in clear
    commands = COMPOSER[
        COMPOSER.index("func clearComposerDraftCommands") : COMPOSER.index("func chatNavCommands")
    ]
    assert "UIKeyCommand.inputDelete" in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "func clearComposerDraftFromShortcut" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "onClearComposerDraft?()" in COMPOSER
    assert "model.send(" not in commands
    assert "const onClearComposerDraft" in APP
    assert 'setDraft("")' in APP
    assert "chatDrafts.current.clear(" in APP
    assert 'addEventListener("keydown", onClearComposerDraft, true)' in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "ClearComposerDraft.keysLabel" in SHEET
    assert "ClearComposerDraft.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.07 " in ROADMAP
    assert "## 107. v1.07" in SPEC
    assert "python3 ios/scripts/test_ios_clear_composer_draft.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_empty,
        test_clears_text_and_chips,
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
