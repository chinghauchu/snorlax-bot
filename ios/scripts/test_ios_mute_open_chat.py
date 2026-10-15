#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.09 mute or unmute the open chat from the keyboard.

Hardware command-shift-M or control-shift-M toggles Mute / Unmute on
the open chat through the same toggleChatMute path as the chat-list
Mute action. A new mute is appended. Unmute removes that id. Muted
chats skip the unread accent and the unread count. The composer does
not own the chord and does not insert the letter. IME and any other
text field do. A key repeat does not flap Mute / Unmute. Nothing
changes when no chat is open. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MuteOpenChat.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
LIST = (IOS / "AgentListView.swift").read_text(encoding="utf-8")
MUTES = (IOS / "ChatMute.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "muteOpenChat.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.09 mute or unmute the open chat from the keyboard (Cmd/Ctrl-Shift-M toggles "
    "Mute / Unmute on the currently open chat through the same local-state path as "
    "the v1.02 sidebar Mute action; mute persists in local storage / UserDefaults; "
    "muted chats skip unread dots and unread count; the chord still works from the "
    "composer and does not insert text; IME composition keeps the key; a key repeat "
    "does not flap Mute / Unmute; find, the quick switcher, the shortcuts list, "
    "rename, the lightbox, a modal or overlay text field, and a focused widget, "
    "approve, or connect card keep the key; nothing changes when no chat is open; "
    "Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, Cmd/Ctrl-Shift-C, "
    "Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, Cmd/Ctrl-Shift-P, Cmd/Ctrl-/, "
    "Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, Cmd/Ctrl-Home/End, Esc, and "
    "Up-arrow recall stay; the shortcuts list includes Cmd/Ctrl Shift M; iOS "
    "hardware command-shift-M mutes or unmutes the open chat the same way and is "
    "listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "m":
        return True
    return characters.lower() == "m"


def should_ignore_repeat(is_repeat):
    return is_repeat


def toggle(ids, chat_id):
    if not chat_id:
        return list(ids)
    if chat_id in ids:
        return [row for row in ids if row != chat_id]
    return [row for row in ids if row != chat_id] + [chat_id]


def paints(muted, would):
    return False if muted else would


def audible(ids, muted):
    hidden = set(muted)
    return {row for row in ids if row and row not in hidden}


def overlay_owns(text_field, composer):
    return text_field and not composer


def test_chord_repeat_and_order() -> None:
    assert is_chord("m", command=True, shift=True) is True
    assert is_chord("M", control=True, shift=True) is True
    assert is_chord("m", command=True, shift=True, characters="m") is True
    assert is_chord("m") is False
    assert is_chord("m", command=True) is False
    assert is_chord("m", command=True, shift=True, option=True) is False
    assert is_chord("m", command=True, control=True, shift=True) is False
    assert is_chord("p", command=True, shift=True) is False
    assert is_chord("a", command=True, shift=True) is False
    assert is_chord("n", command=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    ids = toggle([], "a")
    ids = toggle(ids, "b")
    assert ids == ["a", "b"]
    ids = toggle(ids, "a")
    assert ids == ["b"]
    ids = toggle(ids, "a")
    assert ids == ["b", "a"]
    assert paints(True, True) is False
    assert paints(False, True) is True
    assert audible({"a", "b"}, ["a"]) == {"b"}
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    assert 'static let keysLabel = "⌘⇧M"' in SWIFT
    assert 'static let action = "Mute or unmute this chat"' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isMuteOpenChatChord" in DESKTOP
    assert "muteOpenChatBlocked" in DESKTOP
    assert "muteOpenChatShouldToggle" in DESKTOP
    assert "overlayTextFieldOwnsMuteOpenChat" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "func toggle(_ ids: [String], id: String)" in MUTES
    assert "func audible(_ ids: Set<String>, muted: [String])" in MUTES


def test_existing_mute_path() -> None:
    start = CHAT.index("func muteOpenChatKey")
    end = CHAT.index("func muteOpenChatFromComposer", start)
    key = CHAT[start:end]
    assert "MuteOpenChat.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "findOpen" in key
    assert "shortcutsOpen" in key
    assert "lightbox != nil" in key
    assert "shouldIgnoreRepeat" in key
    assert "model.toggleChatMute(agent.id)" in key
    assert key.index("shouldIgnoreRepeat") < key.index("model.toggleChatMute")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "model.toggleChatMute(agent.id)" in follow
    assert "hasRealAgent" in follow
    assert "model.send(" not in follow
    mute = MODEL[MODEL.index("func toggleChatMute(_ id: String)") : MODEL.index("func chatDisplayName")]
    assert "ChatMute.toggle(mutedChatIDs, id: id)" in mute
    assert "chatUnread.clear(id)" in mute
    assert "publishReplyUnread()" in mute
    assert "didSet { ChatMute.write(mutedChatIDs) }" in MODEL
    assert "model.toggleChatMute(agent.id)" in LIST
    commands = COMPOSER[
        COMPOSER.index("func muteOpenChatCommands") : COMPOSER.index("func clearComposerDraftCommands")
    ]
    assert 'input: "m"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func muteOpenChatFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "muteOpenChatConsumed" in selector
    assert "onMuteOpenChat?()" in selector
    assert selector.index("if muteOpenChatConsumed") < selector.index("muteOpenChatConsumed = true")
    assert selector.index("muteOpenChatConsumed = true") < selector.index("onMuteOpenChat?()")
    assert "model.send(" not in commands
    assert "const onMuteOpenChat" in APP
    assert "onToggleMute(id)" in APP
    assert 'addEventListener("keydown", onMuteOpenChat, true)' in APP
    assert "muteOpenChatShouldToggle" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "MuteOpenChat.keysLabel" in SHEET
    assert "MuteOpenChat.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.09 " in ROADMAP
    assert "## 109. v1.09" in SPEC
    assert "python3 ios/scripts/test_ios_mute_open_chat.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_repeat_and_order,
        test_existing_mute_path,
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
