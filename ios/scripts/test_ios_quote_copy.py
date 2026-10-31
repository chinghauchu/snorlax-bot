#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.35 copy a blockquote.

A completed assistant blockquote offers Copy. Desktop reveals the
12px control on hover or keyboard focus and keeps it visible while
it reads Copied. iOS shows a 12pt button at the top-right, because
the quote body is a text view whose long-press is already selection.
Tap or click copies the lines that quote was split from, including
the quote markers, then the control reads Copied for 1.5s. The
display text, with markers removed, is not the clipboard. A nested
quote has its own control. Streaming stays plain text. Message Copy
still copies the whole reply. No new animation. No new shortcut.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "QuoteCopy.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
SPLITTER = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "quoteCopy.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.35 copy a blockquote"


def shows_copy(completed: bool, source: str) -> bool:
    return completed and source != ""


def test_rules() -> None:
    assert shows_copy(True, "> quoted") is True
    assert shows_copy(False, "> quoted") is False
    assert shows_copy(True, "") is False
    assert shows_copy(True, ">") is True
    assert 'static let copyLabel = "Copy"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let copyAria = "Copy quote"' in SWIFT
    assert 'static let copiedAria = "Copied"' in SWIFT
    assert "static let feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "static func showsCopy(completed: Bool, source: String)" in SWIFT
    assert "completed && !source.isEmpty" in SWIFT
    assert "static func clipboardText(_ source: String) -> String" in SWIFT
    assert "return nil" in SWIFT
    assert "No new HTTP" in SWIFT or "No new shortcut" in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "QUOTE_COPY_MS = 1500" in DESKTOP
    assert 'QUOTE_COPY_ARIA = "Copy quote"' in DESKTOP
    assert "export function showQuoteCopy" in DESKTOP
    assert "export function quoteClipboardText" in DESKTOP
    assert "return source" in DESKTOP
    assert "Never animate" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP
    assert "case quote(String, source: String)" in SPLITTER
    assert 'lines[start..<index].joined(separator: "\\n")' in SPLITTER


def test_clients_copy_the_quote_lines() -> None:
    block = MARKDOWN.split("struct MarkdownQuoteBlock", 1)[1].split(
        "struct MarkdownTaskList", 1
    )[0]
    assert "QuoteCopy.showsCopy(completed: completed, source: markdown)" in block
    assert "QuoteCopy.label(copied: copied)" in block
    assert "QuoteCopy.accessibilityLabel(copied: copied)" in block
    assert "QuoteCopy.clipboardText(markdown)" in block
    assert "UIPasteboard.general.string = text" in block
    assert "QuoteCopy.feedbackNanoseconds" in block
    assert "focusable(false)" in block
    assert "copied = false" in block
    assert "withAnimation" not in block
    assert ".focus(" not in block
    assert "case .quote(let text, let source)" in MARKDOWN
    assert "markdown: source" in MARKDOWN
    tasks = MARKDOWN.split("struct MarkdownTaskList", 1)[1].split(
        "struct MarkdownTaskRow", 1
    )[0]
    assert "QuoteCopy" not in tasks
    assert "showQuoteCopy({ completed, source: block.source })" in BODY
    assert "<QuoteCopyButton source={block.source} />" in BODY
    assert "quoteClipboardText(source)" in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert 'className={copied ? "md-quote-copy is-copied" : "md-quote-copy"}' in BODY
    assert "copyText(reply.content)" in APP
    assert "Copy quote" not in SHORTCUTS
    assert "/v1/" not in block


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 235. v2.35" in SPEC
    assert "test_ios_quote_copy.py" in CI
    assert "quoteCopy.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rules()
    test_clients_copy_the_quote_lines()
    test_docs_and_openapi()
    print("ios quote copy ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
