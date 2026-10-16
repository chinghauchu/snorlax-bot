#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.18 regenerate the last assistant reply from the keyboard.

Hardware command-shift-Y or control-shift-Y regenerates the latest
completed assistant LEFT kind=message through the same path as the
Regenerate control. A channel, a streaming reply, and a transcript
with no completed LEFT all skip. The composer does not own the chord
and does not insert the letter. A key repeat does not regenerate
again. IME and any other text field do. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "RegenerateLastReply.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "regenerateLastReply.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.18 regenerate the last assistant reply from the keyboard (Cmd/Ctrl-Shift-Y "
    "regenerates the latest completed assistant LEFT kind=message in the open chat "
    "through the same path as the Regenerate hover control, POST { regenerate: true }; "
    "only the latest completed LEFT in a 1:1 chat that already allows Regenerate; skip "
    "when no chat is open, there is no completed LEFT, a reply is still streaming, "
    "Regenerate would not be shown, or the chat is a channel; the chord still works "
    "from the composer and does not insert text; a key repeat does not regenerate again "
    "and does not insert; IME composition keeps the key; find, the quick switcher, the "
    "shortcuts list, rename, the lightbox, a modal or overlay text field, and a focused "
    "widget, approve, or connect card keep the key; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, "
    "Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, "
    "Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, "
    "Cmd/Ctrl-Shift-D, Cmd/Ctrl-Shift-E, Cmd/Ctrl-Shift-G, Cmd/Ctrl-Shift-F, "
    "Cmd/Ctrl-Shift-H, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, "
    "Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list includes "
    "Cmd/Ctrl Shift Y; iOS hardware command-shift-Y regenerates that reply and is "
    "listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if str(key).lower() == "y":
        return True
    return characters.lower() == "y"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord() -> None:
    assert is_chord("y", command=True, shift=True) is True
    assert is_chord("Y", control=True, shift=True) is True
    assert is_chord("y", command=True, shift=True, characters="y") is True
    assert is_chord("y") is False
    assert is_chord("y", command=True) is False
    assert is_chord("y", command=True, shift=True, option=True) is False
    assert is_chord("y", command=True, control=True, shift=True) is False
    assert is_chord("h", command=True, shift=True) is False
    assert is_chord("c", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧Y"' in SWIFT
    assert 'static let action = "Regenerate the last reply"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isRegenerateLastReplyChord" in DESKTOP
    assert "regenerateLastReplyBlocked" in DESKTOP
    assert "regenerateLastReplyShouldRun" in DESKTOP
    assert "regenerateLastReplyAllowed" in DESKTOP
    assert "showAssistantRegenerate" in DESKTOP
    assert "No new HTTP" in DESKTOP


def test_existing_regenerate_path() -> None:
    start = CHAT.index("func regenerateLastReplyKey")
    end = CHAT.index("func regenerateLastReplyFromComposer", start)
    key = CHAT[start:end]
    assert "RegenerateLastReply.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "regenerateLastReplyBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "regenerateLastReplyFromChord()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("regenerateLastReplyFromChord()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func focusComposerKey", end)]
    assert "regenerateLastReplyFromChord()" in follow
    assert "showsRegenerate(" in follow
    assert "await model.regenerate()" in follow
    assert "agent.isChannel" in follow
    assert "model.isSending" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "model.send(" not in follow
    assert "func regenerate() async" in MODEL
    assert "regenerate: true" in MODEL
    commands = COMPOSER[
        COMPOSER.index("func regenerateLastReplyCommands") : COMPOSER.index(
            "func chatNavCommands"
        )
    ]
    assert 'input: "y"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func regenerateLastReplyFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "regenerateLastReplyConsumed" in selector
    assert "onRegenerateLastReply?()" in selector
    assert selector.index("if regenerateLastReplyConsumed") < selector.index(
        "regenerateLastReplyConsumed = true"
    )
    assert selector.index("regenerateLastReplyConsumed = true") < selector.index(
        "onRegenerateLastReply?()"
    )
    assert "keyboardY" in COMPOSER
    assert "model.send(" not in commands
    assert "const onRegenerateLastReply" in APP
    assert "regenerateLastReplyAllowed(" in APP
    assert "onRegenerate()" in APP
    assert 'addEventListener("keydown", onRegenerateLastReply, true)' in APP
    assert "regenerateLastReplyShouldRun" in APP
    assert "regeneratePostBody()" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "RegenerateLastReply.keysLabel" in SHEET
    assert "RegenerateLastReply.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.18 " in ROADMAP
    assert "## 118. v1.18" in SPEC
    assert "python3 ios/scripts/test_ios_regenerate_last_reply.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord,
        test_existing_regenerate_path,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
