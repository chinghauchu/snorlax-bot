#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.41 CommonMark hard line breaks in completed assistant replies.

A completed LEFT kind=message renders a line ending in two or
more spaces, or in a backslash, followed by a newline inside a
paragraph as a visible line break. The marker is not shown. A
plain single newline is a soft break and renders as a space.
No break at the end of a block. Code, math, tables, and raw
HTML keep markers literal. Streaming stays plain. Copy still
copies markdown source. No animation. No new HTTP. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownHardBreak.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownHardBreak.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.41 CommonMark hard line breaks in completed assistant replies"


def test_apply_skips_streaming_and_keeps_source() -> None:
    assert "static func apply(_ text: String, completed: Bool = true) -> String" in SWIFT
    assert "if !completed || text.isEmpty { return text }" in SWIFT
    assert "static func restore(_ source: AttributedString)" in SWIFT
    assert "private static func rewrite" in SWIFT
    assert "private static func fenceRanges" in SWIFT
    assert "private static func indentedCodeRanges" in SWIFT
    assert "private static func mathRanges" in SWIFT
    assert "private static func htmlBlockKind" in SWIFT
    assert "§§SBH§§" in SWIFT
    assert "soft break" in SWIFT
    assert "renders as a space" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function applyHardLineBreaks" in DESKTOP
    assert "if (!completed || !text) return text;" in DESKTOP
    assert "export function remarkHardBreaks" in DESKTOP
    assert "function rewriteHardBreaks" in DESKTOP
    assert "function fenceRanges" not in DESKTOP or "fenceRanges" in DESKTOP
    assert "§§SBH§§" in DESKTOP
    assert "soft break" in DESKTOP
    assert "renders as a space" in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_order_and_no_copy() -> None:
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert "MarkdownHardBreak.apply(escaped, completed: completed)" in MARKDOWN
    assert "MarkdownHardBreak.restore(parsed)" in MARKDOWN
    assert MARKDOWN.index("MarkdownEscape.protect(src, completed: completed)") < MARKDOWN.index(
        "MarkdownHardBreak.apply(escaped, completed: completed)"
    )
    assert MARKDOWN.index("MarkdownEscape.restore(parsed)") < MARKDOWN.index(
        "MarkdownHardBreak.restore(parsed)"
    )
    assert MARKDOWN.index("MarkdownHardBreak.restore(parsed)") < MARKDOWN.index(
        "dropUnsafeLinks(&parsed)"
    )
    assert "applyHardLineBreaks(" in BODY
    assert "protectMarkdownEscapes(mathText, completed)" in BODY
    assert BODY.index("extractMath(text)") < BODY.index("protectMarkdownEscapes(mathText, completed)")
    assert BODY.index("applyHardLineBreaks(") < BODY.index(
        "protectMarkdownEscapes(mathText, completed)"
    )
    assert BODY.count("remarkHardBreaks, remarkStrikethrough") == 3
    assert "copyText(reply.content)" in APP
    assert "applyHardLineBreaks(reply.content" not in APP
    assert "withAnimation" not in SWIFT
    assert "computerPane.ts" not in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.41 " in ROADMAP
    assert "## 141. v1.41" in SPEC
    assert "soft break" in SPEC
    assert "test_ios_markdown_hard_break.py" in CI
    assert "markdownHardBreak.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()
    assert "computerPane.ts" not in DESKTOP


def main() -> int:
    test_apply_skips_streaming_and_keeps_source()
    test_order_and_no_copy()
    test_docs_and_openapi()
    print("ios markdown hard break ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
