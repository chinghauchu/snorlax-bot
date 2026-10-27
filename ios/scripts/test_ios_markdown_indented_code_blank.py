#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.95 cmark-gfm indented code blocks in completed assistant replies.

Checked cmark-gfm 0.29.0.gfm.13 section 4.4 on main first. Basic
indent, chunks of blank lines, trailing blanks, paragraph interrupt,
list precedence, headings, rules, fences, and tab stops already
matched. An interior blank now keeps columns past the fourth.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownIndentedCode.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownIndentedCode.ts").read_text(encoding="utf-8")
DESKTOP_LISTS = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.95 cmark-gfm indented code blocks in completed assistant replies"


def test_blank_lines_keep_extra_columns() -> None:
    assert "v1.95" in SWIFT
    assert "dedentCodeLine(lines[index])" in SWIFT
    assert 'collected.append("")' not in SWIFT
    assert 'if isBlank(line) { return "" }' not in SWIFT
    assert "Columns past the fourth stay" in SWIFT
    assert "static func dedentCodeLine" in SWIFT
    assert "markdown source" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "v1.95" in DESKTOP
    assert "dedentCodeLine(lines[i]" in DESKTOP
    assert 'collected.push("")' not in DESKTOP
    assert 'if (isBlank(line)) return "";' not in DESKTOP


def test_list_items_keep_the_same_remainder() -> None:
    assert "v1.95" in LISTS
    assert "inIndentedCode" in LISTS
    assert "listItemIndentedCode(line, contentColumn: marker.contentColumn)" in LISTS
    assert "v1.95" in DESKTOP_LISTS
    assert "inIndentedCode" in DESKTOP_LISTS
    assert "listItemIndentedCode(line, marker.contentColumn)" in DESKTOP_LISTS
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.95 " in ROADMAP
    assert "## 195. v1.95" in SPEC
    assert "indented code blocks" in SPEC
    assert "test_ios_markdown_indented_code_blank.py" in CI
    assert "markdownIndentedCodeBlank.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_blank_lines_keep_extra_columns()
    test_list_items_keep_the_same_remainder()
    test_docs_ci_and_openapi()
    print("ios markdown indented code blank ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
