#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.86 GFM table edge cases in completed assistant replies.

Checked cmark-gfm 0.29.0.gfm.13 on main first. Delimiter column
counts, alignment colons, optional outer pipes, short-row padding,
long-row clipping, escaped pipes, blank lines, and the other block
starts already ended a table. Empty cells and inline emphasis
already rendered. A table already interrupted a paragraph. A fully
quoted table already stayed in the quote. This cut is the rest:
an unescaped pipe inside a code span splits the row, a footnote
definition ends the table, a table stays inside a list item, and a
lazy delimiter or lazy body line does not extend one. Streaming
stays plain text. Copy keeps markdown source. No animation.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownTable.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownTable.ts").read_text(encoding="utf-8")
LIST_TS = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
QUOTE_TS = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.86 GFM table edge cases in completed assistant replies"


def test_edges_match_cmark() -> None:
    assert "v1.86" in SWIFT
    assert "v1.86" in DESKTOP
    assert "isFootnoteDefinition" in SWIFT
    assert "isFootnoteDefinition" in DESKTOP
    assert "quoteLineInTable" in SWIFT
    assert "quoteLineInTable" in DESKTOP
    assert "MarkdownList.listEnd" in SWIFT
    assert "markdownListEnd" in DESKTOP
    assert "code = 0" in SWIFT
    assert "code = 0" in DESKTOP
    assert 'chars[index + 1] == "|"' in SWIFT
    assert 'current.append("|")' in SWIFT
    assert "lazyContinuationMark" in LISTS
    assert "LAZY_CONTINUATION_MARK" in LIST_TS
    assert "quoteLineInTable" in QUOTE
    assert "LAZY_CONTINUATION_MARK" in QUOTE_TS
    assert "textHasTableInList" in BODY
    assert "TightParagraphContext" in BODY
    assert "/v1/" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert not PANE.exists()


def test_copy_stays_source() -> None:
    assert "copyText(reply.content)" in APP
    assert "computerPane" not in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.86 " in ROADMAP
    assert "## 186. v1.86" in SPEC
    assert "GFM table edge cases in completed assistant replies" in SPEC
    assert "test_ios_markdown_table_edge.py" in CI
    assert "markdownTableEdge.test.ts" in PKG


if __name__ == "__main__":
    test_edges_match_cmark()
    test_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
