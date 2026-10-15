#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.13 copy the open chat transcript from the keyboard.

Hardware command-shift-E or control-shift-E copies the open chat's
loaded transcript as plain text. User and assistant kind=message
bodies stay in order, separated by a blank line. Tool, widget,
approve, connect, and handoff rows are skipped. A streaming
kind=message is included when it already has text. Whitespace-only
bodies are skipped. Muted Copied sits beside the chat name for 1.2s.
No toast. The composer does not own the chord and does not insert the
letter. A key repeat does not copy again. IME and any other text
field do. Nothing is copied when no chat is open or nothing useful
is loaded. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CopyTranscript.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "copyTranscript.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.13 copy the open chat transcript from the keyboard (Cmd/Ctrl-Shift-E copies "
    "the open chat's loaded transcript to the clipboard as plain text; user and "
    "assistant kind=message bodies in order, separated by a blank line; tool, "
    "widget, approve, connect, and handoff rows are skipped; a streaming "
    "kind=message is included when it already has text; whitespace-only bodies "
    "are skipped; muted Copied sits beside the chat name for 1.2s; no toast; the "
    "chord still works from the composer and does not insert text; a key repeat "
    "does not copy again and does not insert; IME composition keeps the key; "
    "find, the quick switcher, the shortcuts list, rename, the lightbox, a modal "
    "or overlay text field, and a focused widget, approve, or connect card keep "
    "the key; nothing is copied when no chat is open or the loaded transcript has "
    "nothing useful to copy; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-L, Cmd/Ctrl-N, "
    "Cmd/Ctrl-Shift-C, Cmd/Ctrl-Shift-A, Cmd/Ctrl-Shift-Backspace, "
    "Cmd/Ctrl-Shift-P, Cmd/Ctrl-Shift-M, Cmd/Ctrl-Shift-U, Cmd/Ctrl-Shift-R, "
    "Cmd/Ctrl-Shift-D, Cmd/Ctrl-/, Cmd/Ctrl-1..9, Alt+Up/Down, PageUp/PageDown, "
    "Cmd/Ctrl-Home/End, Esc, and Up-arrow recall stay; the shortcuts list "
    "includes Cmd/Ctrl Shift E; iOS hardware command-shift-E copies that "
    "transcript and is listed in Gestures & shortcuts; no new HTTP)"
)


def is_chord(key, command=False, control=False, option=False, shift=False, characters=""):
    if option or not shift:
        return False
    if command == control:
        return False
    if key.lower() == "e":
        return True
    return characters.lower() == "e"


def should_ignore_repeat(is_repeat):
    return is_repeat


def overlay_owns(text_field, composer):
    return text_field and not composer


def plain_text(rows):
    parts = []
    for kind, content in rows:
        if kind not in (None, "message"):
            continue
        body = (content or "").strip()
        if not body:
            continue
        parts.append(body)
    if not parts:
        return None
    return "\n\n".join(parts)


def test_chord_and_plain_text() -> None:
    assert is_chord("e", command=True, shift=True) is True
    assert is_chord("E", control=True, shift=True) is True
    assert is_chord("e", command=True, shift=True, characters="e") is True
    assert is_chord("e") is False
    assert is_chord("e", command=True) is False
    assert is_chord("e", command=True, shift=True, option=True) is False
    assert is_chord("e", command=True, control=True, shift=True) is False
    assert is_chord("d", command=True, shift=True) is False
    assert is_chord("c", command=True, shift=True) is False
    assert should_ignore_repeat(True) is True
    assert should_ignore_repeat(False) is False
    assert overlay_owns(True, True) is False
    assert overlay_owns(True, False) is True
    assert overlay_owns(False, False) is False
    copied = plain_text(
        [
            ("message", "  hello  "),
            ("tool", "Ran ls"),
            ("message", "world"),
            ("widget", "Pick one"),
            ("approve", "rm"),
            ("connect", "Slack"),
            ("handoff", "ask"),
            ("message", "   "),
            (None, "default kind"),
        ]
    )
    assert copied == "hello\n\nworld\n\ndefault kind"
    assert "Ran ls" not in (copied or "")
    assert plain_text([("tool", "Ran ls"), ("message", " ")]) is None
    assert 'static let keysLabel = "⌘⇧E"' in SWIFT
    assert 'static let action = "Copy the transcript"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_200_000_000" in SWIFT
    assert "func plainText" in SWIFT
    assert "isKindMessage" in SWIFT
    assert 'joined(separator: "\\n\\n")' in SWIFT
    assert "shouldIgnoreRepeat" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "isCopyTranscriptChord" in DESKTOP
    assert "transcriptPlainText" in DESKTOP
    assert "copyTranscriptBlocked" in DESKTOP
    assert "copyTranscriptShouldRun" in DESKTOP
    assert 'join("\\n\\n")' in DESKTOP
    assert "No new HTTP" in DESKTOP


def test_existing_copy_path() -> None:
    start = CHAT.index("func copyTranscriptKey")
    end = CHAT.index("func copyTranscriptFromComposer", start)
    key = CHAT[start:end]
    assert "CopyTranscript.isChord" in key
    assert "hasRealAgent" in key
    assert "composerFocused" in key
    assert "copyTranscriptBlocked()" in key
    assert "overlayTextFieldOwnsChord" in key
    assert "shouldIgnoreRepeat" in key
    assert "copyOpenTranscript()" in key
    assert key.index("shouldIgnoreRepeat") < key.index("copyOpenTranscript()")
    assert "model.send(" not in key
    follow = CHAT[end : CHAT.index("func chatNavKey", end)]
    assert "copyOpenTranscript()" in follow
    assert "CopyTranscript.plainText" in follow
    assert "visibleMessages(for: agent)" in follow
    assert "UIPasteboard.general.string = text" in follow
    assert "CopyTranscript.feedbackNanoseconds" in follow
    assert "renameChatID != nil" in follow
    assert "findOpen" in follow
    assert "shortcutsOpen" in follow
    assert "lightbox != nil" in follow
    assert "CopyTranscript.copiedLabel" in CHAT
    assert follow.index("guard let text") < follow.index("UIPasteboard.general.string = text")
    assert "model.send(" not in follow
    assert "toast" not in follow.lower()
    commands = COMPOSER[
        COMPOSER.index("func copyTranscriptCommands") : COMPOSER.index(
            "func clearComposerDraftCommands"
        )
    ]
    assert 'input: "e"' in commands
    assert "modifierFlags: [.command, .shift]" in commands
    assert "modifierFlags: [.control, .shift]" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    selector = COMPOSER[
        COMPOSER.index("func copyTranscriptFromShortcut") : COMPOSER.index("func chatNavUp")
    ]
    assert "markedTextRange != nil" in selector
    assert "copyTranscriptConsumed" in selector
    assert "onCopyTranscript?()" in selector
    assert selector.index("if copyTranscriptConsumed") < selector.index(
        "copyTranscriptConsumed = true"
    )
    assert selector.index("copyTranscriptConsumed = true") < selector.index("onCopyTranscript?()")
    assert "keyboardE" in COMPOSER
    assert "model.send(" not in commands
    assert "const onCopyTranscript" in APP
    assert "transcriptPlainText(visibleMessages)" in APP
    assert "copyText(text)" in APP
    assert "MESSAGE_COPY_FEEDBACK_MS" in APP
    assert 'className="message-copied"' in APP
    assert "copiedFeedbackLabel(transcriptCopiedId === active.id)" in APP
    assert 'addEventListener("keydown", onCopyTranscript, true)' in APP
    assert "copyTranscriptShouldRun" in APP
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP
    assert "CopyTranscript.keysLabel" in SHEET
    assert "CopyTranscript.action" in SHEET
    assert "Gestures & shortcuts" in SHEET


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.13 " in ROADMAP
    assert "## 113. v1.13" in SPEC
    assert "python3 ios/scripts/test_ios_copy_transcript.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_plain_text,
        test_existing_copy_path,
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
