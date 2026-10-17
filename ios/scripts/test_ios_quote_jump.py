#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.27 jump from a sent quote to the message it replies to.

A quote of a user or completed assistant message remembers that
message with the draft. After Send, each matching quote block in the
user message is a thin control that scrolls to the source. Clearing
the draft drops the pending link. Hardware command-' / control-'
jumps to the quote nearest the reading line. A key repeat does not
jump again. The composer may keep its text. The apostrophe is not
inserted. IME and overlays keep the key. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "QuoteJump.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "quoteJump.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
SHORTCUTS = (ROOT / "desktop" / "src" / "chatShortcuts.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.27 jump from a sent quote to the message it replies to (quoting a user-RIGHT or completed "
    "assistant-LEFT kind=message remembers that message locally; after Send, each matching quote "
    "block in that user message is a thin control that scrolls to the quoted message; clearing the "
    "draft drops the pending link; a sent message that no longer contains the quote does not keep "
    "it; Cmd/Ctrl-' jumps to the quoted message for the quote nearest the reading line; a key "
    "repeat does not jump again; the composer may keep its text and the apostrophe is not inserted; "
    "IME composition keeps the key; find, the quick switcher, the shortcuts overlay, rename, the "
    "lightbox, a modal or overlay text field, and a focused widget, approve, or connect card keep "
    "the key; stick-to-bottom, the Jump chip, per-chat reading place, the sticky day header, "
    "collapsed long messages, muted chats, and the New messages divider stay; Reduce Motion adds no "
    "animation; the shortcuts list includes Cmd/Ctrl ' to jump to the quoted message; iOS hardware "
    "command-' and control-' jump the same way and Gestures & shortcuts lists the chord; desktop "
    "localStorage and iOS UserDefaults; no new HTTP)"
)

EPSILON = 8


def quoteable(text: str) -> str | None:
    trimmed = text.replace("\u00a0", " ").replace("\r\n", "\n").replace("\r", "\n").strip()
    return trimmed or None


def is_chord(key: str, characters: str, command=False, control=False, option=False, shift=False) -> bool:
    if option or shift:
        return False
    if command == control:
        return False
    token = characters if characters else key
    return token == "'" or key == "'"


def blocks(content: str) -> list[str]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    found: list[str] = []
    current: list[str] = []

    def flush() -> None:
        text = "\n".join(current).strip()
        if text:
            found.append(text)
        current.clear()

    for line in normalized.split("\n"):
        if line == ">" or line.startswith("> "):
            current.append("" if line == ">" else line[2:])
            continue
        flush()
    flush()
    return found


def adding(links: list[tuple[str, str]], text: str, source_id: str) -> list[tuple[str, str]]:
    body = quoteable(text)
    if not body or not source_id:
        return links
    next_links = [link for link in links if link[0] != body]
    next_links.append((body, source_id))
    return next_links


def still_in_content(content: str, links: list[tuple[str, str]]) -> list[tuple[str, str]]:
    present = set(blocks(content))
    return [link for link in links if link[0] in present and link[1]]


def targets(content: str, links: list[tuple[str, str]], loaded: set[str]) -> list[tuple[str, str]]:
    by_text = {text: source for text, source in links if source in loaded}
    found: list[tuple[str, str]] = []
    for block in blocks(content):
        source = by_text.get(block)
        if source:
            found.append((block, source))
    return found


def parts(content: str, linked: list[tuple[str, str]]) -> list[tuple[str, str, str]]:
    """('quote', text, source) or ('text', text, '')."""
    if not linked:
        return [("text", content, "")]
    by_text = {text: source for text, source in linked}
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    out: list[tuple[str, str, str]] = []
    text_lines: list[str] = []
    quote_lines: list[str] | None = None

    def flush_text() -> None:
        if not text_lines:
            return
        out.append(("text", "\n".join(text_lines), ""))
        text_lines.clear()

    def flush_quote() -> None:
        nonlocal quote_lines
        if quote_lines is None:
            return
        body = "\n".join(quote_lines).strip()
        source = by_text.get(body)
        if source:
            flush_text()
            out.append(("quote", body, source))
        else:
            for line in quote_lines:
                text_lines.append(">" if line == "" else f"> {line}")
        quote_lines = None

    for line in lines:
        if line == ">" or line.startswith("> "):
            if quote_lines is None:
                quote_lines = []
            quote_lines.append("" if line == ">" else line[2:])
            continue
        flush_quote()
        text_lines.append(line)
    flush_quote()
    flush_text()
    return out or [("text", content, "")]


def scroll_offset(target_top: float, sticky_inset: float, max_offset: float) -> float:
    limit = max(0.0, max_offset)
    raw = target_top - max(0.0, sticky_inset)
    if raw <= 0:
        return 0.0
    if raw >= limit:
        return limit
    return raw


def settled(top: float | None, scroll_top: float, sticky_inset: float, max_offset: float) -> bool:
    if top is None:
        return False
    view_anchor = scroll_top + sticky_inset
    if top <= view_anchor + EPSILON:
        return True
    commanded = scroll_offset(top, sticky_inset, max_offset)
    return commanded >= max_offset - EPSILON and scroll_top + EPSILON >= commanded


def pick_message_id(
    rows: list[tuple[str, float | None]],
    scroll_top: float,
    sticky_inset: float = 0,
    max_offset: float = 0,
) -> str | None:
    listed = [row for row in rows if row[0]]
    if not listed:
        return None
    last: str | None = None
    for index, (row_id, top) in enumerate(listed):
        if top is None:
            later = next((item for item in listed[index + 1 :] if item[1] is not None), None)
            if later is None:
                return last or row_id
            if settled(later[1], scroll_top, sticky_inset, max_offset):
                last = row_id
                continue
            return last or row_id
        if settled(top, scroll_top, sticky_inset, max_offset):
            last = row_id
            continue
        return last or row_id
    return last


def test_chord_and_blocks() -> None:
    assert is_chord("'", "'", command=True) is True
    assert is_chord("'", "'", control=True) is True
    assert is_chord("'", "'", command=True, shift=True) is False
    assert is_chord("'", "'", command=True, option=True) is False
    assert is_chord("'", "'", command=True, control=True) is False
    assert is_chord("'", "'") is False
    assert is_chord("l", "l", command=True) is False
    assert blocks("> hello\n> world\n\nreply") == ["hello\nworld"]
    assert blocks("> one\n\n> two\n") == ["one", "two"]
    assert blocks("no quote") == []
    assert blocks("> \n> kept") == ["kept"]
    links = adding([], "  hello\nworld  ", "src-1")
    assert links == [("hello\nworld", "src-1")]
    replaced = adding(links, "hello\nworld", "src-2")
    assert replaced == [("hello\nworld", "src-2")]
    assert adding(links, "   ", "src-3") == links
    assert adding(links, "hello", "") == links
    kept = still_in_content("> hello\n\nthanks", [("hello", "a"), ("gone", "b")])
    assert kept == [("hello", "a")]
    assert targets("> hello\n\nthanks", kept, {"a"}) == [("hello", "a")]
    assert targets("> hello", kept, set()) == []
    rendered = parts("> hello\n\nthanks", [("hello", "a")])
    assert rendered[0] == ("quote", "hello", "a")
    assert rendered[1][0] == "text"
    assert "thanks" in rendered[1][1]
    assert parts("just text", []) == [("text", "just text", "")]
    assert pick_message_id([("early", 10), ("here", 80), ("later", 200)], 80, 0, 400) == "here"
    assert pick_message_id([("below", 300), ("lower", 360)], 80, 0, 400) == "below"
    assert pick_message_id([], 80) is None
    assert 'static let storageKey = "snorlax.quoteJumps"' in SWIFT
    assert 'static let keysLabel = "⌘\'"' in SWIFT
    assert 'static let action = "Jump to the quoted message"' in SWIFT
    assert "static func isChord" in SWIFT
    assert "static func blocks" in SWIFT
    assert "static func parts" in SWIFT
    assert "static func pickMessageId" in SWIFT
    assert "command-'" in SWIFT
    assert "No HTTP" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "No HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "@keyframes" not in DESKTOP
    assert "isQuoteJumpChord" in DESKTOP
    assert "quoteJumpBlocked" in DESKTOP
    assert 'export const QUOTE_JUMP_KEY = "snorlax.quoteJumps"' in DESKTOP


def test_chat_jumps_without_sending() -> None:
    start = CHAT.index("func quoteJumpKey")
    end = CHAT.index("private func transcriptTextBlocked", start)
    handler = CHAT[start:end]
    assert "QuoteJump.isChord" in handler
    assert "QuoteJump.shouldIgnoreRepeat" in handler
    assert "jumpToNearestQuote" in handler
    assert "applyQuoteJump" in handler
    assert "QuoteJump.primarySource" in handler
    assert "StickToBottom.onUserScroll" in handler
    assert "TranscriptScroll.transaction" in handler
    assert "press.`repeat`" in handler
    assert "model.send(" not in handler
    assert "userMessageJumpBlocked()" in handler
    assert "quoteJumpFromComposer" in CHAT
    assert "onQuoteJump: { quoteJumpFromComposer() }" in CHAT
    assert "onQuoteJump: { sourceId in applyQuoteJump(sourceId) }" in CHAT
    assert ".environment(\\.quoteSourceId, message.id)" in CHAT
    assert "QuoteJump.highlightAnimates" in CHAT
    assert "userQuoteBody" in CHAT
    assert "accessibilityLabel(QuoteJump.action)" in CHAT
    assert "quoteJumpToken" in CHAT
    assert "withAnimation" not in SWIFT
    commands = COMPOSER[COMPOSER.index("func quoteJumpCommands") : COMPOSER.index("func quoteJumpFromShortcut")]
    assert 'input: "\'"' in commands
    assert "modifierFlags: .command" in commands
    assert "modifierFlags: .control" in commands
    assert "wantsPriorityOverSystemBehavior = true" in commands
    shortcut = COMPOSER[COMPOSER.index("func quoteJumpFromShortcut") : COMPOSER.index("quoteJumpConsumed = true")]
    assert "markedTextRange != nil" in shortcut
    assert "QuoteJump.isChord" in shortcut
    assert "onQuoteJump?()" in COMPOSER
    assert "keyboardApostrophe" in COMPOSER
    assert "quoteJumpConsumed" in COMPOSER
    assert "static func currentSourceId" in QUOTE
    assert "QuoteTextView.currentSourceId" in MODEL
    assert "var quoteSourceId" in QUOTE
    assert "quoteJumps.note" in MODEL
    assert "quoteJumps.commit" in MODEL
    assert "quoteJumps.clearPending" in MODEL
    insert = MODEL[MODEL.index("func quoteIntoComposer") : MODEL.index("func editAsNewMessage")]
    assert "QuoteSelection.append" in insert
    assert "send(" not in insert
    assert "/v1/" not in insert
    assert "Tap a sent quote" in SHEET
    assert "QuoteJump.keysLabel" in SHEET
    assert "QuoteJump.action" in SHEET
    assert 'id: "quote-jump"' in SHEET
    assert 'id: "quote-jump-key"' in SHEET
    assert 'id: "quote-jump"' in SHORTCUTS
    assert "Cmd/Ctrl '" in SHORTCUTS
    assert "isQuoteJumpChord" in APP
    assert "quoteJumpBlocked" in APP
    assert "pickQuoteJumpMessageId" in APP
    assert 'className="quote-jump"' in APP
    assert "data-quote-jump-target" in APP
    assert "data-quote-id" in APP
    assert "quoteJumps.current.note" in APP
    assert "quoteJumps.current.commit" in APP
    assert "clearPending" in APP
    assert "newMessages" in APP
    assert "chatMute" in APP
    assert ".quote-jump" in CSS
    assert "data-quote-jump-highlight" in CSS
    assert "prefers-reduced-motion: reduce" in CSS
    assert "animation: none" in CSS
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in APP


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.27 " in ROADMAP
    assert "## 127. v1.27" in SPEC
    assert "python3 ios/scripts/test_ios_quote_jump.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_chord_and_blocks,
        test_chat_jumps_without_sending,
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
    print("ios quote jump ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
