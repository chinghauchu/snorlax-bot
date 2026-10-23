#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.75 CommonMark safe inline HTML in completed assistant replies.

A completed LEFT kind=message renders a bare <br>, <kbd>, <sub>, or
<sup> and shows every other raw tag as text. Attributes and event
handlers are not copied. Code, fences, indented code, and math stay
literal. Streaming stays the markdown string. Copy keeps markdown
source. No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownHtmlLiteral.ts").read_text(encoding="utf-8")
HARD = (ROOT / "desktop" / "src" / "markdownHardBreak.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.75 CommonMark safe inline HTML in completed assistant replies"


def test_allowlist_is_shared() -> None:
    assert "v1.75" in SWIFT
    assert "static func restoreSafeTags" in SWIFT
    assert "static func safeAnimation" in SWIFT
    assert 'if reduceMotion { return nil }' in SWIFT
    assert 'private static let safeBreak = "§§SBH§§"' in SWIFT
    assert '"kbd", "sub", "sup"' in SWIFT
    assert "Nothing in the tag is copied" in SWIFT
    assert "§§SBO" in SWIFT or "§§SB\\(kind)" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "export function classifySafeInline" in DESKTOP
    assert "export function applySafeInlineHtml" in DESKTOP
    assert "export function safeInlineHtmlAnimates" in DESKTOP
    assert 'SAFE_BREAK = "§§SBH§§"' in DESKTOP
    assert "Nothing in the tag is copied" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane" not in DESKTOP
    assert "applySafeInlineHtml(tree)" in HARD


def test_ios_paints_after_the_hard_break() -> None:
    assert "MarkdownHtmlLiteral.restoreSafeTags(parsed)" in MARKDOWN
    assert "MarkdownHardBreak.restore(parsed)" in MARKDOWN
    assert MARKDOWN.index("MarkdownHardBreak.restore(parsed)") < MARKDOWN.index(
        "MarkdownHtmlLiteral.restoreSafeTags(parsed)"
    )
    assert "copyText(reply.content)" in APP
    assert "literalizeRawHtml(reply.content" not in APP
    assert "applySafeInlineHtml" not in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.75 " in ROADMAP
    assert "## 175. v1.75" in SPEC
    assert "safe inline HTML in completed assistant replies" in SPEC
    assert "test_ios_markdown_inline_html.py" in CI
    assert "markdownInlineHtml.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_allowlist_is_shared()
    test_ios_paints_after_the_hard_break()
    test_docs_and_openapi()
    print("ios markdown inline html ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
