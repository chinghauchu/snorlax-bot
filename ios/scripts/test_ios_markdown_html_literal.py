#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.60 raw HTML stays literal text in completed assistant replies.

A completed LEFT kind=message shows inline raw HTML and a type 7
tag as the characters on desktop and iOS. A type 1-6 HTML block that
starts a line stays a block. Angle autolinks and link destinations
stay links. Code stays literal. Streaming stays the markdown string.
Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownHtmlLiteral.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.60 raw HTML stays literal text in completed assistant replies"


def test_tags_are_stashed_outside_blocks() -> None:
    assert "v1.60" in SWIFT
    assert "static func literalize" in SWIFT
    assert "static func animation" in SWIFT
    assert "return nil" in SWIFT
    assert "MarkdownEscape.opaqueSpans" in SWIFT
    assert "MarkdownList.htmlBlockLineEnd" in SWIFT
    assert "MarkdownList.htmlSourceBlockLine" in SWIFT
    assert "§§SBE" in SWIFT
    assert "markdown source" in SWIFT
    assert 'if !completed || text.isEmpty || !text.contains("<")' in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "static func opaqueSpans" in ESCAPE
    assert "export function literalizeRawHtml" in DESKTOP
    assert "export function htmlLiteralAnimates" in DESKTOP
    assert "opaqueMarkdownRanges" in DESKTOP
    assert "stashMarkdownText" in DESKTOP
    assert "htmlBlockEnd" in DESKTOP
    assert "htmlSourceBlockLine" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "computerPane" not in DESKTOP


def test_both_clients_wire_it_before_the_parser() -> None:
    assert "MarkdownHtmlLiteral.literalize(" in MARKDOWN
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert "MarkdownHardBreak.apply(escaped, completed: completed)" in MARKDOWN
    assert MARKDOWN.index("MarkdownEscape.protect(src, completed: completed)") < MARKDOWN.index(
        "MarkdownHardBreak.apply(escaped, completed: completed)"
    )
    assert BODY.count("literalizeRawHtml(") == 3
    assert BODY.count("protectMarkdownEscapes(mathText, completed)") == 3
    assert BODY.index("applyHardLineBreaks(") < BODY.index("literalizeRawHtml(")
    assert BODY.index("literalizeRawHtml(") < BODY.index(
        "protectMarkdownEscapes(mathText, completed)"
    )
    assert "copyText(reply.content)" in APP
    assert "literalizeRawHtml(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.60 " in ROADMAP
    assert "## 160. v1.60" in SPEC
    assert "raw HTML stays literal text in completed assistant replies" in SPEC
    assert "test_ios_markdown_html_literal.py" in CI
    assert "markdownHtmlLiteral.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_tags_are_stashed_outside_blocks()
    test_both_clients_wire_it_before_the_parser()
    test_docs_and_openapi()
    print("ios markdown html literal ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
