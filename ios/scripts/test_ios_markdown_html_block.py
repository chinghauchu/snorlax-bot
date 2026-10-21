#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.58 CommonMark HTML blocks in completed assistant replies.

A completed LEFT kind=message ends a list or a lazy blockquote at
a CommonMark HTML block of types 1-6, matching desktop react-markdown.
A type 7 tag such as <br> stays in the item or quote and ends further
lazy lines. A marker inside the block is not a list. Blank lines
inside a comment, script, style, pre, or textarea stay in that bubble.
Tags stay literal text. Streaming stays the markdown string. Copy
controls keep markdown source. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
QUOTES = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
DESKTOP_QUOTES = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
BUBBLES = (ROOT / "desktop" / "src" / "assistantBubbles.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.58 CommonMark HTML blocks in completed assistant replies"


def test_html_blocks_end_lists_and_quotes() -> None:
    assert "v1.58" in SWIFT
    assert "func htmlBlockInterrupts" in SWIFT
    assert "func htmlLazyTag" in SWIFT
    assert "func htmlUntilBlockEnd" in SWIFT
    assert "if htmlLazyTag(line) { sawBlank = true }" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function htmlBlockInterrupts" in DESKTOP
    assert "export function htmlLazyTag" in DESKTOP
    assert "export function htmlUntilBlockEnd" in DESKTOP
    assert "v1.58" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "MarkdownList.htmlBlockInterrupts" in QUOTES
    assert "MarkdownList.htmlLazyTag" in QUOTES
    assert "htmlBlockInterrupts" in DESKTOP_QUOTES
    assert "MarkdownList.htmlUntilBlockEnd" in MARKDOWN
    assert "htmlUntilBlockEnd" in BUBBLES


def test_copy_stays_source() -> None:
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.58 " in ROADMAP
    assert "## 158. v1.58" in SPEC
    assert "CommonMark HTML blocks in completed assistant replies" in SPEC
    assert "test_ios_markdown_html_block.py" in CI
    assert "markdownHtmlBlock.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_html_blocks_end_lists_and_quotes()
    test_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
