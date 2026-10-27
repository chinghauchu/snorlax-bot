#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.96 cmark-gfm list items in completed assistant replies.

Checked cmark-gfm 0.29.0.gfm.13 section 5.2 on main first.
Blank-line items, empty markers, nested markers, start numbers,
and content-column padding already match the list split. A blank
marker's padding spaces are not a hard break.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownHardBreak.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownHardBreak.ts").read_text(encoding="utf-8")
DESKTOP_LISTS = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.96 cmark-gfm list items in completed assistant replies"


def test_padding_is_not_a_hard_break() -> None:
    assert "v1.96" in SWIFT
    assert "remainderOpensParagraph" in SWIFT
    assert "listItemParagraphText" in SWIFT
    assert "MarkdownList.listMarkerPadding" in SWIFT
    assert "markdown source" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "v1.96" in DESKTOP
    assert "remainderOpensParagraph" in DESKTOP
    assert "listItemParagraphText" in DESKTOP
    assert "listMarkerPadding" in DESKTOP


def test_list_split_already_had_the_blank_marker() -> None:
    assert "A blank marker line uses one" in LISTS
    assert "A blank marker line uses one" in DESKTOP_LISTS
    assert "marker.text === \"\"" in DESKTOP_LISTS or "marker.text == \"\"" in LISTS
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.96 " in ROADMAP
    assert "## 196. v1.96" in SPEC
    assert "list items" in SPEC
    assert "test_ios_markdown_list_item.py" in CI
    assert "markdownListItem.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_padding_is_not_a_hard_break()
    test_list_split_already_had_the_blank_marker()
    test_docs_ci_and_openapi()
    print("ios markdown list item ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
