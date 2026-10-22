#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.65 GFM table rows clip to the header in completed assistant replies.

A completed LEFT kind=message table uses the header's column count.
A wider body row drops the extra cells. A shorter row pads with empty
cells, and those cells keep the delimiter alignment. Copy still copies
the original lines. A pipe-less body row is v1.66.
Streaming stays plain text. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownTable.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownTable.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.65 GFM table rows clip to the header in completed assistant replies"


def fit(cells: list[str], width: int) -> list[str]:
    """GFM: drop cells past the header, and pad a short row."""
    nxt = cells[:width]
    while len(nxt) < width:
        nxt.append("")
    return nxt


def test_row_width() -> None:
    assert fit(["bar"], 2) == ["bar", ""]
    assert fit(["bar", "baz", "boo"], 2) == ["bar", "baz"]
    assert fit(["a", "b", "c", "DROPME"], 3) == ["a", "b", "c"]
    assert fit(["only"], 3) == ["only", "", ""]
    assert fit(["`a|b`", "**x**"], 2) == ["`a|b`", "**x**"]
    assert "boo" not in fit(["bar", "baz", "boo"], 2)


def test_wiring() -> None:
    assert "v1.65" in SWIFT
    assert "let width = header.count" in SWIFT
    assert "Array(cells.prefix(width))" in SWIFT
    assert 'while next.count < width { next.append("") }' in SWIFT
    assert "Array(align.prefix(width))" in SWIFT
    assert "width = max(width, row.count)" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "v1.65" in DESKTOP
    assert "const width = header.length" in DESKTOP
    assert "cells.slice(0, width)" in DESKTOP
    assert "Math.max(width, row.length)" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "table.header.map((cell, index)" in BODY
    assert "row.map((cell, index)" in BODY
    assert "tableAlignClass(table.align[index])" in BODY
    assert "tableClipboardText(table.source)" in BODY
    assert "ForEach(Array(table.header.enumerated())" in MARKDOWN
    assert "ForEach(Array(row.enumerated())" in MARKDOWN
    assert "gridColumnAlignment(columnAlign(column))" in MARKDOWN
    assert 'literal.isEmpty ? " " : literal' in MARKDOWN
    assert "MarkdownTableCopy.clipboardText(table.source)" in MARKDOWN
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.65 " in ROADMAP
    assert "## 165. v1.65" in SPEC
    assert "GFM table rows clip to the header in completed assistant replies" in SPEC
    assert "test_ios_markdown_table_clip.py" in CI
    assert "markdownTableClip.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_row_width()
    test_wiring()
    test_docs_and_openapi()
    print("ios markdown table clip ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
