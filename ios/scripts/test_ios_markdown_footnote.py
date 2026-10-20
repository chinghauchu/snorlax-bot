#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.38 GFM footnotes in completed assistant replies.

A completed LEFT kind=message reference like [^1] renders as a
superscript marker. The matching [^1]: definition leaves the body
and shows in a muted numbered Footnotes list. Desktop click scrolls
to the note and a back-link returns to the reference. iOS tap shows
the note and does not change http(s) link handling. Unmatched
references and definitions stay plain text. Code spans and fences
stay literal. Streaming stays plain. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownFootnote.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "QuoteSelection.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownFootnote.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.38 GFM footnotes in completed assistant replies"


def test_extract_keeps_streaming_and_source() -> None:
    assert "static func extract(_ text: String, completed: Bool)" in SWIFT
    assert "if !completed { return Prepared(text: text, notes: []) }" in SWIFT
    assert "static func isMarker(_ url: URL) -> Bool" in SWIFT
    assert "snorlax-fn://" in SWIFT
    assert "§§SBFN" in SWIFT
    assert 'static let title = "Footnotes"' in SWIFT
    assert 'static let showLabel = "Show footnote"' in SWIFT
    assert "static func animation(reduceMotion: Bool) -> Animation?" in SWIFT
    assert "return nil" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function extractFootnotes" in DESKTOP
    assert "export function footnoteAnimates" in DESKTOP
    assert "return false" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_marker_and_list_do_not_steal_links() -> None:
    assert "MarkdownFootnote.applyMarkers(&parsed, baseSize: metrics.body)" in MARKDOWN
    assert "MarkdownFootnote.note(for: url, in: markdownFootnotes)" in MARKDOWN
    assert "WebLinks.allows(url)" in MARKDOWN
    assert "openURL(url)" in MARKDOWN
    assert ".popover(item: $shownFootnote)" in MARKDOWN
    assert "presentationCompactAdaptation(.popover)" in MARKDOWN
    assert "struct MarkdownFootnoteList" in SWIFT
    assert "struct MarkdownFootnotePopover" in SWIFT
    assert "MarkdownFootnoteList(" in MARKDOWN
    assert "showFootnotes && !markdownFootnotes.isEmpty" in MARKDOWN
    assert "markdownFootnotes" in CHAT
    assert "showFootnotes:" in CHAT
    assert "MarkdownFootnote.extract" in CHAT
    assert "MarkdownSplit.bubbles(in: message.displayContent, completed: completed)" in CHAT
    assert "MarkdownFootnote.isMarker(url)" in QUOTE
    assert "WebLinks.allows(url)" in QUOTE
    assert "LinkPreview.configuration" in QUOTE
    assert 'className="md-fn-ref"' in BODY
    assert 'className="md-footnotes"' in BODY
    assert 'className="md-fn-back"' in BODY
    assert "focusFootnote(" in BODY
    assert "color: var(--text-muted);" in CSS
    assert "vertical-align: super;" in CSS
    assert "prefers-reduced-motion: reduce" in CSS
    assert "extractFootnotes" in APP
    assert "splitAssistantBubbles" in APP
    assert "copyText(reply.content)" in APP
    assert "withAnimation" not in SWIFT.split("struct MarkdownFootnoteList", 1)[1]


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.38 " in ROADMAP
    assert "## 138. v1.38" in SPEC
    assert "GFM footnotes in completed assistant replies" in SPEC
    assert "test_ios_markdown_footnote.py" in CI
    assert "markdownFootnote.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_extract_keeps_streaming_and_source()
    test_ios_marker_and_list_do_not_steal_links()
    test_docs_and_openapi()
    print("ios markdown footnote ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
