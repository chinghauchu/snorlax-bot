#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.08 pin or unpin the open chat from the keyboard.

Hardware command-shift-P or control-shift-P toggles Pin / Unpin on
the open chat through the same toggleChatPin path as the chat-list
Pin action. A new pin is appended. Unpin removes that id. The
composer does not own the chord and does not insert the letter. IME
and any other text field do. A key repeat does not flap the pin.
Nothing changes when no chat is open. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "PinOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
PINS = (IOS / "ChatPins.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "pinOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.08 pin or unpin the open chat from the keyboard (Cmd/Ctrl-Shift-P toggles "
    "Pin / Unpin on the currently open chat through the same local-state path as "
    "the v0.89 sidebar Pin action; pinned chats sit in the Pinned group in the "
    "order they were pinned; the chord still works from the composer and does not "
    "insert text; IME composition keeps the key; a key repeat does not flap the "
    "pin; find, the quick switcher, the shortcuts list, rename, the lightbox, a "
    "modal or overlay text field, and a focused widget, approve, or connect card "
    "keep the key; nothing is pinned when no chat is open; Cmd/Ctrl-K, Cmd/Ctrl-F, "
    "Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, "
    "Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, "
    "PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the "
    "shortcuts list includes Cmd/Ctrl Shift P; iOS hardware command-shift-P pins "
    "or unpins the open chat the same way and is listed in Gestures & shortcuts; "
    "no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "p":
        return True
    return characters.lower() == "p"


def should_ignore_repeat(is_repeat):
    return is_repeat


def toggle(ids, chat_id):
    if not chat_id:
        return list(ids)
    if chat_id in ids:
        return [row for row in ids if row != chat_id]
    return [row for row in ids if row != chat_id] + [chat_id]


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_repeat_and_order() -> None:
    assert is_chord("p", command=True, shift=True) is True
    assert is_chord("P", control=True, shift=True) is True
    assert is_chord("p", command=True, shift=True, characters="p") is True
    assert is_chord("p") is False
    assert is_chord("p", command=True) is False
    assert is_chord("p", command=True, shift=True, option=True) is False
    assert is_chord("p", command=True, control=True, shift=True) is False
    assert is_chord("a", command=True, shift=True) is False
    assert is_chord("c", command=True, shift=True) is False
    assert is_chord("n", command=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    pins = toggle([], "a")
    pins = toggle(pins, "b")
    assert pins == ["a", "b"]
    pins = toggle(pins, "a")
    assert pins == ["b"]
    pins = toggle(pins, "a")
    assert pins == ["b", "a"]
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧P"' in SWIFT
    assert 'static let action = "Pin or unpin this chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isPinOpenChatChord" in DESKTOP
    assert "pinOpenChatBlocked" in DESKTOP
    assert "pinOpenChatShouldToggle" in DESKTOP
    assert "overlayTextFieldOwnsPinOpenChat" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "func toggle(_ ids: [String], id: String)" in PINS


def test_existing_pin_path() -> None:
    start = CHAT.index("func pinOpenChatKey")
    end = CHAT.index("func pinOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "PinOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "shouldIgnoreRepeat" in key
    assert "model.toggleChatPin(agent.id)" in key
    assert key.index("shouldIgnoreRepeat") < key.index("model.toggleChatPin")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "model.toggleChatPin(agent.id)" in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    pin = MODEL[MODEL.index("func toggleChatPin(_ id: String)") : MODEL.index("func chatDisplayName")]
    assert "ChatPins.toggle(pinnedChatIDs, id: id)" in pin
    assert "didSet { ChatPins.write(pinnedChatIDs) }" in MODEL
    assert "model.toggleChatPin(agent.id)" in LIST
    commands = COMPOSER[
        COMPOSER.index("func pinOpenChatCommands") : COMPOSER.index("func clearComposerDraftCommands")
    ]
    assert 'input: "p"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func pinOpenChatFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "pinOpenChatConsumed" in selector
    assert "onPinOpenChat?()" in selector
    assert selector.index("if pinOpenChatConsumed") < selector.index("pinOpenChatConsumed = true")
    assert selector.index("pinOpenChatConsumed = true") < selector.index("onPinOpenChat?()")
    assert "model.send(" not in commands
    assert "const onPinOpenChat" in APP
    assert "onTogglePin(id)" in APP
    assert 'addEventListener("keydown", onPinOpenChat, true)' in APP
    assert "pinOpenChatShouldToggle" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "PinOpenChat.keysLabel" in SHEET
    assert "PinOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.08 " in ROADMAP
    assert "## 108. v1.08" in SPEC
    assert "python3 ios/scripts/test_ios_pin_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_repeat_and_order,
        test_existing_pin_path,
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
