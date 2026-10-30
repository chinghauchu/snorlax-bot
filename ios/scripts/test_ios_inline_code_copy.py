#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.28 copy inline code.

A completed assistant inline code span offers Copy. Desktop shows
a muted control on hover or keyboard focus and copies the span
text, not the backticks. iOS offers Copy code on the edit menu
when the selection lies inside one span and copies that whole
span, then shows Copied for 1.5s. A code fence keeps its own
Copy. Streaming and user bubbles hide it. No new animation. No
new shortcut. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "InlineCodeCopy.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "inlineCodeCopy.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.28 copy inline code"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_clipboard_and_confirmation() -> None:
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert 'static let menuLabel = "Copy code"' in SWIFT
    assert 'static let copyAria = "Copy inline code"' in SWIFT
    assert "static func clipboardText(_ text: String) -> String" in SWIFT
    assert "static func spanText(" in SWIFT
    assert "static func noteCopied()" in SWIFT
    assert 'Notification.Name("snorlax.inlineCodeCopied")' in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "return nil" in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'INLINE_CODE_COPY_LABEL = "Copy"' in DESKTOP
    assert 'INLINE_CODE_COPY_ARIA = "Copy inline code"' in DESKTOP
    assert 'INLINE_CODE_MENU_LABEL = "Copy code"' in DESKTOP
    assert "export function inlineCodeClipboardText" in DESKTOP
    assert "export function showInlineCodeCopy" in DESKTOP
    assert "export function inlineCodeSpanText" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_menu_and_desktop_control() -> None:
    menu = _slice(QUOTE, "editMenuForTextIn range: NSRange", "func textView(")
    assert "InlineCodeCopy.spanText(in: attributed, selection: range)" in menu
    assert "InlineCodeCopy.clipboardText(span)" in menu
    assert "InlineCodeCopy.noteCopied()" in menu
    assert "InlineCodeCopy.menuLabel" in menu
    assert "UIPasteboard.general.string" in menu
    assert "QuoteSelection.label" in menu
    assert "extras + [quote] + suggestedActions" in menu
    inline = _slice(BODY, "function InlineCode(", "function InlineCodeCopyButton(")
    assert "showInlineCodeCopy({ completed, block, text })" in inline
    assert 'className="md-code-inline-wrap"' in inline
    assert "inlineCodeClipboardText(text)" in inline
    button = _slice(BODY, "function InlineCodeCopyButton(", "function CodeFence(")
    assert "inlineCodeClipboardText(text)" in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    fence = _slice(BODY, "function FenceBar(", "function NumberedCode(")
    assert "InlineCodeCopyButton" not in fence
    assert "md-code-inline-copy" not in fence
    assert "snorlaxInlineCode = InlineCodeCopy.mark" in MARKDOWN
    assert "InlineCodeCopy.apply(&parsed, ranges: codeSpans)" in MARKDOWN
    confirm = _slice(CHAT, "if inlineCodeCopied {", "private func applyJumpChipPaint")
    assert "Text(InlineCodeCopy.copiedLabel)" in confirm
    assert "InlineCodeCopy.copiedAria" in confirm
    assert "noteInlineCodeCopied()" in CHAT
    assert "snorlax.inlineCodeCopied" in SWIFT
    assert "Copy inline code" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    for text in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in text
        assert "version: 0.19" not in text
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 228. v2.28" in SPEC
    assert "python3 ios/scripts/test_ios_inline_code_copy.py" in CI
    assert "inlineCodeCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


if __name__ == "__main__":
    test_clipboard_and_confirmation()
    test_menu_and_desktop_control()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
