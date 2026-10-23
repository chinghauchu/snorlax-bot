#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.72 CommonMark tab stops for indented code inside list items.

Lazy blockquote continuation already shipped in v1.47. A backtick
in a fence info string, and a longer tilde closer, already shipped
in v1.52. This cut is the tab stop inside a list item. A tab is
measured on the original line. A tab that crosses the code indent
becomes the leftover spaces, and a later tab stays a tab. An open
paragraph is not code. A fence under four columns stays a fence.
Streaming stays plain text. Copy keeps markdown source. No
animation. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
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
    "v1.72 CommonMark tab stops for indented code inside list items "
    "in completed assistant replies"
)


def test_tab_stop_is_measured_on_the_original_line() -> None:
    assert "v1.72" in LIST
    assert "v1.72" in DESKTOP
    assert "func listItemIndentedCode" in LIST
    assert "export function listItemIndentedCode" in DESKTOP
    assert "contentColumn + 4" in LIST
    assert "contentColumn + 4" in DESKTOP
    assert 'String(repeating: " ", count: 4)' in LIST
    assert "`    ${code}`" in DESKTOP or '`    ${openingCode}`' in DESKTOP
    assert "paragraph = false" in LIST
    assert "if !paragraph, let code = listItemIndentedCode" in LIST
    assert "!paragraph" in DESKTOP
    assert "listItemIndentedCode(line, marker.contentColumn)" in DESKTOP
    read_item = LIST.split("private static func readItem", 1)[1].split(
        "private static func sameList", 1
    )[0]
    assert read_item.index("paragraph = false") < read_item.index(
        "if !paragraph, let code = listItemIndentedCode"
    )
    assert "/v1/" not in LIST
    assert "withAnimation" not in LIST
    assert "UIPasteboard" not in LIST
    assert "computerPane" not in LIST
    assert not PANE.exists()


def test_completed_replies_split_lists_and_copy_stays_source() -> None:
    assert "MarkdownList.split(" in MARKDOWN
    assert "MarkdownIndentedCode.split(" in MARKDOWN
    assert "listItemIndentedCode" not in PLAIN
    assert "copyText(reply.content)" in APP
    assert "splitMarkdownLists(reply.content" not in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.72 " in ROADMAP
    assert "## 172. v1.72" in SPEC
    assert "tab stops for indented code inside list items" in SPEC
    assert "test_ios_markdown_list_code_tab.py" in CI
    assert "markdownListCodeTab.test.ts" in PKG


if __name__ == "__main__":
    test_tab_stop_is_measured_on_the_original_line()
    test_completed_replies_split_lists_and_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
