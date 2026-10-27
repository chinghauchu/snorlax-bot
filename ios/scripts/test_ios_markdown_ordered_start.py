#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.01 cmark-gfm nested ordered list start numbers.

Checked cmark-gfm 0.29.0.gfm.13 on main first. A list item that
interrupts a paragraph still opens an ordered list at any start
when that marker is the item's first block. iOS already re-parses
the item through MarkdownList. Desktop react-markdown left the
marker as text and now uses the same splitter.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP_LIST = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.01 cmark-gfm nested ordered list start numbers in completed assistant replies"


def test_rules_match() -> None:
    for source in (LIST, DESKTOP_LIST):
        assert "v2.01" in source
        assert "first block of a list item is not a paragraph" in source
        assert "/v1/" not in source
        assert "computerPane" not in source
    assert "AssistantMarkdown" in LIST
    assert "listNeedsCmarkOrderedItemStart" in DESKTOP_LIST
    assert "listNeedsCmarkOrderedItemStart(sourceText)" in BODY
    assert "completed &&" in BODY
    assert "MarkdownList.split(source, completed: completed)" in MARKDOWN
    assert "text: item" in MARKDOWN
    assert "copyText(reply.content)" in APP
    assert "UIPasteboard" not in LIST
    assert "withAnimation" not in LIST
    assert not PANE.exists()


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.01 " in ROADMAP
    assert "## 201. v2.01" in SPEC
    assert "test_ios_markdown_ordered_start.py" in CI
    assert "markdownOrderedStart.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )


def main() -> int:
    test_rules_match()
    test_docs_and_openapi()
    print("ios markdown ordered start ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
