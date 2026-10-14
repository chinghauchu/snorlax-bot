#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.94 quote selection into the composer.

Select text in a user-RIGHT or completed assistant-LEFT kind=message
bubble. Desktop shows a muted Quote control near the selection. iOS
adds Quote to the long-press menu when there is a selection, and to
the selection menu. Quote inserts greater-than lines, leaves the caret
after the quote, and focuses the composer. It does not send. An empty
selection does nothing. An existing draft is kept. Tool lines, cards,
file chips, and the live LEFT stream are not quotable. Reduce Motion
adds no animation. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "quoteSelection.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.94 quote selection into the composer (select text in a user-RIGHT or "
    "assistant-LEFT kind=message bubble to show a small muted Quote control; "
    "desktop places it near the selection; iOS long-press menu includes Quote "
    "when there is a selection, and the selection menu offers Quote; activating "
    "Quote inserts greater-than lines into the composer, puts the caret after "
    "the quote, and focuses the composer; it does not send; an empty or "
    "whitespace-only selection does nothing; an existing draft is kept and the "
    "quote is appended after a blank line; tool lines, widget, approve, and "
    "connect cards, and file chips are not quotable; a streaming LEFT bubble is "
    "not quotable; Reduce Motion adds no animation; no new HTTP)"
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def quoteable(selection: str) -> str | None:
    normalized = selection.replace("\u00a0", " ").replace("\r\n", "\n").replace("\r", "\n")
    trimmed = normalized.strip()
    return trimmed or None


def quote_block(selection: str) -> str | None:
    body = quoteable(selection)
    if body is None:
        return None
    return "\n".join(">" if line == "" else f"> {line}" for line in body.split("\n"))


def append_quote(draft: str, selection: str) -> str | None:
    block = quote_block(selection)
    if block is None:
        return None
    quoted = block + "\n\n"
    if draft.strip() == "":
        return quoted
    return draft.rstrip() + "\n\n" + quoted


def surface_allowed(kind_message: bool, from_user: bool, completed: bool, file_chip: bool) -> bool:
    if file_chip or not kind_message:
        return False
    if from_user:
        return True
    return completed


def test_quote_rules() -> None:
    assert quoteable("") is None
    assert quoteable("  \n") is None
    assert quoteable("\u00a0") is None
    assert append_quote("keep", " ") is None
    assert quote_block("hello") == "> hello"
    assert quote_block("a\n\nb") == "> a\n>\n> b"
    assert append_quote("", "hello") == "> hello\n\n"
    assert append_quote("  \n", "hello") == "> hello\n\n"
    kept = append_quote("hi", "hello")
    assert kept == "hi\n\n> hello\n\n"
    assert kept.startswith("hi\n\n")
    assert append_quote("hi\n\n\n", "a\nb") == "hi\n\n> a\n> b\n\n"
    assert surface_allowed(True, True, False, False) is True
    assert surface_allowed(True, False, True, False) is True
    assert surface_allowed(True, False, False, False) is False
    assert surface_allowed(False, True, True, False) is False
    assert surface_allowed(True, True, True, True) is False
    assert "static func quoteable(" in SWIFT
    assert "static func append(draft: String, selection: String)" in SWIFT
    assert "static func surfaceAllowed(" in SWIFT
    assert 'static let label = "Quote"' in SWIFT


def test_selection_menu_and_long_press() -> None:
    assert "editMenuForTextIn range: NSRange" in SWIFT
    assert "range.length > 0" in SWIFT
    assert "quoteable(selected) != nil" in SWIFT
    assert "QuoteSelection.label" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "quoteIntoComposer" not in PLAIN
    assert "QuoteSelectableText" not in PLAIN
    assert "quoteEnabled: completed" in MARKDOWN
    assert "QuoteSelectableText(" in MARKDOWN
    insert = _slice(MODEL, "func quoteIntoComposer(", "func editAsNewMessage(")
    assert "QuoteSelection.append(draft: draft, selection: selection)" in insert
    assert "guard let next" in insert
    assert "draft = next.text" in insert
    assert "pendingComposerCaret = next.caret" in insert
    assert "wantsComposerFocus = true" in insert
    assert "computerTakeoverOpen" in insert
    assert "send(" not in insert
    assert "/v1/" not in insert
    assert "showQuote: canQuote" in CHAT
    assert "QuoteSelection.surfaceAllowed(" in CHAT
    assert "QuoteSelection.menuSelection()" in CHAT
    assert "Button(QuoteSelection.label)" in CHAT
    assert "model.quoteIntoComposer" in CHAT
    assert "Select text, then Quote" in SHORTCUTS
    assert "function quoteIntoComposer(" in APP
    assert "appendQuoteToDraft" in APP
    assert 'className="quote-selection"' in APP
    assert "onSend" not in _slice(APP, "function quoteIntoComposer(", "function clearRecalledDraft(")


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    for doc in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in doc
        assert "version: 0.19" not in doc
    assert PHRASE in ROADMAP
    assert "/ v0.94 " in ROADMAP
    assert "## 95. v0.94" in SPEC
    assert "python3 ios/scripts/test_ios_quote_selection.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "No HTTP" in DESKTOP or "No HTTP" in SWIFT


def main() -> int:
    tests = [
        test_quote_rules,
        test_selection_menu_and_long_press,
        test_openapi_roadmap_ci_no_computer_pane,
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
