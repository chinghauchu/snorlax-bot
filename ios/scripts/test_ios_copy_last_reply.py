#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.00 copy the last assistant reply.

Hardware command-shift-C or control-shift-C copies the latest
completed assistant LEFT kind=message. A streaming reply is skipped.
An empty reply copies nothing. Plain command-C is not this chord.
Find, the shortcuts sheet, and the lightbox keep their keys.
Nothing is sent. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CopyLastReply.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "copyLastReply.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"
COMPACT = (ROOT / "desktop" / "src" / "compactToolTraces.ts").read_text(encoding="utf-8")

PHRASE = (
    "v1.00 copy the last assistant reply (Cmd/Ctrl-Shift-C copies the latest "
    "completed assistant LEFT kind=message, the same text as Copy; a reply "
    "still streaming is skipped; an empty reply copies nothing; muted Copied "
    "sits beside that Copy for 1.2s; the composer may stay focused; plain "
    "Cmd/Ctrl-C still copies a selection; find, the quick switcher, the "
    "shortcuts list, rename, the lightbox, and a focused widget, approve, or "
    "connect card stay; IME stays; nothing is sent; the shortcuts list "
    "includes Cmd/Ctrl Shift C; iOS hardware command-shift-C copies that reply "
    "and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "c":
        return True
    return characters.lower() == "c"


def last_reply(messages, sending, live_index):
    for index in range(len(messages) - 1, -1, -1):
        row = messages[index]
        if row["from_user"] or not row["kind_message"]:
            continue
        if sending and live_index is not None and index == live_index:
            continue
        if not row["content"].strip():
            continue
        return row
    return None


def test_chord_and_which_reply() -> None:
    assert is_chord("c", command=True, shift=True) is True
    assert is_chord("C", control=True, shift=True) is True
    assert is_chord("c", command=True, characters="c", shift=True) is True
    assert is_chord("c", command=True) is False
    assert is_chord("c", shift=True) is False
    assert is_chord("c", command=True, control=True, shift=True) is False
    assert is_chord("c", command=True, shift=True, option=True) is False
    assert is_chord("l", command=True, shift=True) is False
    messages = [
        {"from_user": True, "kind_message": True, "content": "hi"},
        {"from_user": False, "kind_message": True, "content": "first"},
        {"from_user": False, "kind_message": False, "content": "Searching"},
        {"from_user": False, "kind_message": True, "content": "second"},
    ]
    assert last_reply(messages, False, None)["content"] == "second"
    assert last_reply(messages, True, 3)["content"] == "first"
    streaming = [
        {"from_user": True, "kind_message": True, "content": "hi"},
        {"from_user": False, "kind_message": True, "content": "partial"},
    ]
    assert last_reply(streaming, True, 1) is None
    empty = [{"from_user": False, "kind_message": True, "content": "  "}]
    assert last_reply(empty, False, None) is None
    assert 'static let keysLabel = "⌘⇧C"' in SWIFT
    assert 'static let action = "Copy the last reply"' in SWIFT
    assert "func isChord" in SWIFT
    assert "func lastReply" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "Cmd/Ctrl Shift C" in DESKTOP
    assert "isCopyLastReplyChord" in DESKTOP
    assert "lastAssistantReply" in DESKTOP
    assert "N tools" in COMPACT


def test_chat_copies_without_sending() -> None:
    start = CHAT.index("func copyLastAssistantReply")
    end = CHAT.index("private func openFind", start)
    handler = CHAT[start:end]
    assert "CopyLastReply.lastReply" in handler
    assert "UIPasteboard.general.string = reply.content" in handler
    assert "copiedReplyId = reply.id" in handler
    assert "findOpen" in handler or "copyLastReplyBlocked" in handler
    assert "model.send(" not in handler
    assert "func copyLastReplyKey" in CHAT
    assert "CopyLastReply.isChord" in CHAT
    assert "composerFocused" in CHAT[CHAT.index("func copyLastReplyKey") : CHAT.index("func focusComposerKey")]
    assert "shortcutCopied: message.id == copiedReplyId" in CHAT
    assert "copied || shortcutCopied" in CHAT
    assert "computerPane.ts" not in CHAT
    assert "const onCopyLastReply" in APP
    assert "copyLastReplyRef.current()" in APP
    assert "lastAssistantReply(visibleMessages" in APP
    assert "copyText(reply.content)" in APP
    assert 'addEventListener("keydown", onCopyLastReply, true)' in APP
    assert "shortcutCopied={shortcutCopiedId === message.id}" in APP
    assert "computerPane.ts" not in APP
    commands = COMPOSER[
        COMPOSER.index("func copyLastReplyCommands") : COMPOSER.index("func chatNavCommands")
    ]
    assert 'input: "c"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "func copyLastReplyFromShortcut" in COMPOSER
    assert "onCopyLastReply?()" in COMPOSER
    assert "markedTextRange != nil" in COMPOSER
    assert "model.send(" not in commands
    assert "CopyLastReply.keysLabel" in SHEET
    assert "CopyLastReply.action" in SHEET
    assert "FocusComposer.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.00 " in ROADMAP
    assert "## 100. v1.00" in SPEC
    assert "python3 ios/scripts/test_ios_copy_last_reply.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_which_reply,
        test_chat_copies_without_sending,
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
