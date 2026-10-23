#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.73 CommonMark tab stops for blockquotes.

v1.72 matched tab stops for indented code inside list items and
left a blockquote's own tab stop out. Hard line breaks already
shipped in v1.41. Ordered-list start numbers already shipped in
v1.36, and the rule that only a list starting at 1 may interrupt
a paragraph already shipped in v1.56. This cut is the quote
marker. The optional column after `>` can eat part of a tab, so
`>\\t\\tfoo` is a blockquote whose code text is two spaces then
`foo`. A tab that crosses the code indent becomes the leftover
spaces, and a later tab stays a tab. An open paragraph is not
code. A fence stays a fence. A list inside the quote is measured
in the quote's columns. Streaming stays plain text. Copy keeps
markdown source. No animation. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
QUOTE = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.73 CommonMark tab stops for blockquotes "
    "in completed assistant replies"
)


def test_quote_tab_stop_is_measured_on_the_original_line() -> None:
    assert "v1.73" in QUOTE
    assert "v1.73" in DESKTOP
    assert "func quoteContentColumn" in QUOTE
    assert "function quoteContentColumn" in DESKTOP
    assert "func renderQuoteLine" in QUOTE
    assert "function renderQuoteLine" in DESKTOP
    assert "MarkdownList.listItemIndentedCode" in QUOTE
    assert "contentCol + openList.relative" in QUOTE
    assert "contentCol + openList.relative" in DESKTOP
    assert 'spaces(openList.relative) + "    " + code' in QUOTE
    assert '${" ".repeat(openList.relative)}    ${code}' in DESKTOP
    assert "filled" in QUOTE
    assert "openList.filled ? openList : nil" in QUOTE
    assert "openList.filled ? openList : null" in DESKTOP
    assert "/v1/" not in QUOTE
    assert "withAnimation" not in QUOTE
    assert "UIPasteboard" not in QUOTE
    assert "computerPane" not in QUOTE
    assert not PANE.exists()


def test_completed_replies_split_quotes_and_copy_stays_source() -> None:
    assert "MarkdownQuoteTask.split(" in MARKDOWN
    assert "quoteContentColumn" not in PLAIN
    assert "renderQuoteLine" not in PLAIN
    assert "copyText(reply.content)" in APP
    assert "splitQuoteAndTasks(reply.content" not in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.73 " in ROADMAP
    assert "## 173. v1.73" in SPEC
    assert "tab stops for blockquotes" in SPEC
    assert "test_ios_markdown_quote_tab.py" in CI
    assert "markdownQuoteTab.test.ts" in PKG


if __name__ == "__main__":
    test_quote_tab_stop_is_measured_on_the_original_line()
    test_completed_replies_split_quotes_and_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
