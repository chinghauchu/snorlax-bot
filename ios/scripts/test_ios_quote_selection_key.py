#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.26 quote a transcript selection from the keyboard.

Hardware command-L / control-L, when a quotable transcript selection
is active, inserts it as a markdown quote and focuses the composer.
With no selection, the same chord still only focuses the composer.
A selection in the composer is not quoted. A key repeat does not
quote again. IME and overlays keep the key. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "QuoteSelectionKey.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
SCROLL = (IOS / "TranscriptScroll.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "quoteSelectionKey.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.26 quote a transcript selection from the keyboard (Cmd/Ctrl-L, when the selection sits in "
    "one user-RIGHT or completed assistant-LEFT kind=message, inserts it as a markdown quote in the "
    "composer, leaves the caret after the quote, and focuses the composer; it does not send; an "
    "existing draft is kept and the quote is appended after a blank line; an empty or whitespace-only "
    "selection does nothing and Cmd/Ctrl-L still only focuses the composer; a selection in the composer "
    "is not quoted and the caret stays; a key repeat does not quote again; IME composition keeps the "
    "key; find, the quick switcher, the shortcuts overlay, rename, the lightbox, a modal or overlay "
    "text field, and a focused widget, approve, or connect card keep the key; tool lines, widgets, "
    "approve cards, connect cards, file chips, and a streaming LEFT bubble stay unquotable; "
    "stick-to-bottom, the Jump chip, per-chat reading place, the sticky day header, and collapsed long "
    "messages stay; Reduce Motion adds no animation; Cmd/Ctrl-K, Cmd/Ctrl-F, Cmd/Ctrl-N, "
    "Cmd/Ctrl-Shift-C, and the other chords stay; the shortcuts list includes Cmd/Ctrl L to quote the "
    "selection; iOS hardware command-L and control-L quote a transcript selection the same way and "
    "Gestures & shortcuts lists the chord; no new HTTP)"
)


def quoteable(selection: str) -> str | None:
    normalized = selection.replace("\u00a0", " ").replace("\r\n", "\n").replace("\r", "\n")
    trimmed = normalized.strip()
    return trimmed or None


def selection_to_quote(in_text_field: bool, selection: str | None) -> str | None:
    if in_text_field:
        return None
    if selection is None:
        return None
    return quoteable(selection)


def is_chord(key: str, command=False, control=False, option=False, shift=False) -> bool:
    if option or shift:
        return False
    if command == control:
        return False
    return key.lower() == "l"


def test_chord_and_selection() -> None:
    assert is_chord("l", command=True) is True
    assert is_chord("L", control=True) is True
    assert is_chord("l", command=True, shift=True) is False
    assert is_chord("l", command=True, option=True) is False
    assert is_chord("l", command=True, control=True) is False
    assert is_chord("l") is False
    assert is_chord("k", command=True) is False
    assert selection_to_quote(False, "hello") == "hello"
    assert selection_to_quote(False, "  hello \n") == "hello"
    assert selection_to_quote(True, "hello") is None
    assert selection_to_quote(False, None) is None
    assert selection_to_quote(False, "  \n") is None
    assert 'static let keysLabel = "⌘L"' in SWIFT
    assert 'static let action = "Quote the selection"' in SWIFT
    assert "static func selectionToQuote" in SWIFT
    assert "static func claimTurn" in SWIFT
    assert "FocusComposer.isChord" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "selectionToQuote" in DESKTOP
    assert "quoteSelectionBlocked" in DESKTOP


def test_chat_quotes_without_sending() -> None:
    start = CHAT.index("func quoteSelectionFromChord")
    end = CHAT.index("private var quoteChordBlocked", start)
    handler = CHAT[start:end]
    assert "QuoteSelectionKey.selectionToQuote" in handler
    assert "QuoteSelectionKey.claimTurn" in handler
    assert "model.quoteIntoComposer" in handler
    assert "QuoteTextView.clearActiveSelection" in handler
    assert "press.`repeat`" in handler
    assert "nonQuoteTextFieldIsFirstResponder" in handler
    assert "model.send(" not in handler
    assert "findOpen" in CHAT[CHAT.index("private var quoteChordBlocked") : CHAT.index("private var quoteChordBlocked") + 600]
    assert "shortcutsOpen" in CHAT
    assert "renameChatID" in CHAT[CHAT.index("private var quoteChordBlocked") : CHAT.index("private func focusSidebarKey")]
    assert "showSettings" in CHAT[CHAT.index("private var quoteChordBlocked") : CHAT.index("private func focusSidebarKey")]
    assert "pendingDeleteChatID" in handler or "pendingDeleteChatID" in CHAT[CHAT.index("private var quoteChordBlocked") : CHAT.index("private func focusSidebarKey")]
    assert "skillMenuOpen" in CHAT[CHAT.index("private var quoteChordBlocked") : CHAT.index("private func focusSidebarKey")]
    assert "quoteChordBlocked" in CHAT
    assert ".environment(\\.quoteChordBlocked, quoteChordBlocked)" in CHAT
    assert "func focusComposerKey" in CHAT
    assert "composerFocused = true" in CHAT
    focus = COMPOSER[COMPOSER.index("func focusComposerFromShortcut") : COMPOSER.index("func copyLastReplyFromShortcut")]
    assert "quoteIntoComposer" not in focus
    assert "markedTextRange != nil" in focus
    assert "quoteSelectionFromHardware" in QUOTE
    assert "quoteHold" in QUOTE
    assert "clearActiveSelection" in QUOTE
    assert 'input: "l"' in QUOTE
    assert "modifierFlags: .command" in QUOTE
    assert "modifierFlags: .control" in QUOTE
    assert "wantsPriorityOverSystemBehavior = true" in QUOTE
    assert "withAnimation" not in QUOTE
    assert "nonQuoteTextFieldIsFirstResponder" in SCROLL
    assert "QuoteSelectionKey.action" in SHEET
    assert "FocusComposer.action" in SHEET
    start_app = APP.index("const onFocusComposerKey")
    end_app = APP.index('addEventListener("keydown", onFocusComposerKey, true)', start_app)
    desktop = APP[start_app:end_app]
    assert "selectionToQuote" in desktop
    assert "quoteKeyRef.current(quoted)" in desktop
    assert "quoteKeyRef.current = quoteIntoComposer" in APP
    assert "readQuoteOffer()" in desktop
    assert "quoteSelectionBlocked(gate)" in desktop
    assert "onSend(" not in desktop
    assert "onUserScroll" not in desktop
    assert "Show more" not in desktop
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.26 " in ROADMAP
    assert "## 126. v1.26" in SPEC
    assert "python3 ios/scripts/test_ios_quote_selection_key.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_selection,
        test_chat_quotes_without_sending,
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
