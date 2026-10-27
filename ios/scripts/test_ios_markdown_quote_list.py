#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.97 cmark-gfm block quotes inside list items in completed assistant replies.

Checked cmark-gfm 0.29.0.gfm.13 section 5.1 on main first. Lazy
continuation, markers with and without a space, tabs after `>`,
blank lines, and nested laziness already match. A marker in the
first three columns that is still indented to an open bullet item
stays in that item.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.97 cmark-gfm block quotes inside list items in completed assistant replies"
)


def test_quote_stays_in_the_item() -> None:
    assert "v1.97" in SWIFT
    assert "quoteOwnedByList" in SWIFT
    assert "MarkdownList.listEnd" in SWIFT
    assert "if quoteOwnedByList(lines, index: index)" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "v1.97" in DESKTOP
    assert "function quoteOwnedByList" in DESKTOP
    assert "markdownListEnd" in DESKTOP
    assert "if (quoteOwnedByList(lines, i))" in DESKTOP
    assert "static func listEnd" in LISTS
    assert "MarkdownQuoteTask.split(" in MARKDOWN


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.97 " in ROADMAP
    assert "## 197. v1.97" in SPEC
    assert "block quotes inside list items" in SPEC
    assert "test_ios_markdown_quote_list.py" in CI
    assert "markdownQuoteList.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert not PANE.exists()


def main() -> int:
    test_quote_stays_in_the_item()
    test_docs_ci_and_openapi()
    print("ios markdown quote list ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
