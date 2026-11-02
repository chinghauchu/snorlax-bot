#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.36 save a blockquote.

A completed assistant blockquote offers a muted Save beside Copy.
Tap or click writes the lines that quote was split from as quote.md,
including the quote markers. The display text, with markers removed,
is not the file. Desktop downloads the file. iOS opens the system
share sheet and does not ask for photo-library permission. The label
reads Saved for 1.5s. Copy still copies those lines. A streaming
reply hides Save. A task list does not gain Save. A nested quote has
its own Save. The control does not take composer focus. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "QuoteSave.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "quoteSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
TABLE = (ROOT / "desktop" / "src" / "tableCsvSave.ts").read_text(encoding="utf-8")
REPLY = (ROOT / "desktop" / "src" / "replyMarkdownSave.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.36 save a blockquote"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save quote"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "quote.md"' in SWIFT
    assert "static func showsSave(completed: Bool, source: String) -> Bool" in SWIFT
    assert "static func bodyText(_ source: String) -> String" in SWIFT
    assert "static func writeFile(markdown: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-quote" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "completed && !source.isEmpty" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'QUOTE_SAVE_LABEL = "Save"' in DESKTOP
    assert 'QUOTE_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'QUOTE_SAVE_ARIA = "Save quote"' in DESKTOP
    assert 'QUOTE_SAVE_FILENAME = "quote.md"' in DESKTOP
    assert "export function quoteSaveBody" in DESKTOP
    assert "export function showQuoteSave" in DESKTOP
    assert "export function downloadQuoteMarkdown" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert 'TABLE_CSV_FILENAME = "table.csv"' in TABLE
    assert 'REPLY_MARKDOWN_FILENAME = "reply.md"' in REPLY


def test_save_beside_copy() -> None:
    quote = _slice(MARKDOWN, "struct MarkdownQuoteBlock", "struct MarkdownTaskList")
    assert "QuoteSave.showsSave(completed: completed, source: markdown)" in quote
    assert "QuoteSave.bodyText(markdown)" in quote
    assert "QuoteSave.label(saved: saved)" in quote
    assert "QuoteSave.accessibilityLabel(saved: saved)" in quote
    assert "QuoteSave.feedbackNanoseconds" in quote
    assert "QuoteSave.writeFile(markdown: text, filename: QuoteSave.filename)" in quote
    assert "QuoteSave.keepsQuote()" in quote
    assert "QuoteCopy.clipboardText(markdown)" in quote
    assert "focusable(false)" in quote
    assert "UIActivityViewController" in quote
    assert "saved = false" in quote
    assert "PHPhotoLibrary" not in quote
    assert "withAnimation" not in quote
    assert ".focus(" not in quote
    save = _slice(quote, "private func saveQuote", "private struct QuoteMarkdownShareSheet")
    assert "UIPasteboard" not in save
    tasks = _slice(MARKDOWN, "struct MarkdownTaskList", "struct MarkdownTaskRow")
    assert "QuoteSave" not in tasks
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "QuoteSave" not in user
    button = _slice(BODY, "function QuoteCopyButton(", "function QuoteTaskPieces(")
    assert "showQuoteSave(" in button
    assert "quoteSaveBody(source)" in button
    assert "downloadQuoteMarkdown(" in button
    assert 'className={saved ? "md-quote-save is-saved" : "md-quote-save"}' in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "quoteSaveKeepsQuote()" in button
    assert "quoteClipboardText(source)" in button
    assert "Save quote" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 236. v2.36" in SPEC
    assert "test_ios_quote_save.py" in CI
    assert "quoteSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios quote save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
