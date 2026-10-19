#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.33 headings, strikethrough, and thematic breaks in completed assistant replies.

Completed LEFT kind=message ATX headings render as 16/14 semibold on
iOS (UIFont on the text view). Desktop strikethrough renders struck
through. Own-line ---, ***, and ___ render as a thin muted rule on
desktop and iOS. Setext underlines stay headings. Streaming stays the
markdown string. Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownBreak.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownBreak.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.33 headings, strikethrough, and thematic breaks in completed assistant replies"


def test_split_keeps_streaming_and_source() -> None:
    assert "static func split(_ text: String, completed: Bool)" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "static func thematicBreakMarker" in SWIFT
    assert 'return nil' in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert 'replacingOccurrences(of: "~~"' not in SWIFT
    assert "export function splitThematicBreaks" in DESKTOP
    assert "export function remarkStrikethrough" in DESKTOP
    assert "export function breakAnimates" in DESKTOP
    assert "return false" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_headings_and_rules_are_styled() -> None:
    rule = MARKDOWN.split("struct MarkdownRule", 1)[1].split("struct MarkdownTableBlock", 1)[0]
    assert "MarkdownBreak.split(source, completed: completed)" in MARKDOWN
    assert "Rectangle()" in rule
    assert ".frame(height: 1)" in rule
    assert "Color(uiColor: .separator)" in rule
    assert 'accessibilityLabel("Separator")' in rule
    assert "MarkdownBreak.animation(reduceMotion: reduceMotion)" in rule
    assert "withAnimation" not in rule
    assert "uiKit.font = UIFont.systemFont(ofSize: size, weight: .semibold)" in MARKDOWN
    assert "level <= 1 ? metrics.heading : metrics.body" in MARKDOWN
    assert "interpretedSyntax = .full" in MARKDOWN
    assert "byCharWrapping" in MARKDOWN
    assert ".lineLimit(nil)" in MARKDOWN
    assert 'className="md-rule"' in BODY
    assert 'className="md-strike"' in BODY
    assert "remarkStrikethrough" in BODY
    assert "h1:" in BODY
    assert "h6:" in BODY
    assert "align-self: stretch;" in CSS
    assert "width: 100%;" in CSS
    assert "border-top: 1px solid var(--border);" in CSS
    assert "text-decoration: line-through;" in CSS
    assert "prefers-reduced-motion: reduce" in CSS
    assert "copyText(reply.content)" in APP
    assert "tableClipboardText(table.source)" in BODY
    assert "codeBlockClipboardText(source)" in BODY


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.33 " in ROADMAP
    assert "## 133. v1.33" in SPEC
    assert "headings, strikethrough, and thematic breaks in completed assistant replies" in SPEC
    assert "test_ios_markdown_break.py" in CI
    assert "markdownBreak.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_split_keeps_streaming_and_source()
    test_ios_headings_and_rules_are_styled()
    test_docs_and_openapi()
    print("ios markdown break ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
