#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.98 cmark-gfm fenced code that is a list item in completed assistant replies.

Checked cmark-gfm 0.29.0.gfm.13 on main first. Spec 5.1 lazy
continuation and spec 6.7 hard breaks inside quotes and list
items already match. A fence that is the text of a list marker
stays in that item when its closer sits in the first three
columns. That closer is not a second fence.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CODE = (IOS / "MarkdownCodeSpan.swift").read_text(encoding="utf-8")
LISTS = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP_MATH = (ROOT / "desktop" / "src" / "math.ts").read_text(encoding="utf-8")
DESKTOP_MD = (ROOT / "desktop" / "src" / "markdown.ts").read_text(encoding="utf-8")
DESKTOP_LISTS = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.98 cmark-gfm fenced code that is a list item in completed assistant replies"
)


def test_list_fence_stays_in_the_item() -> None:
    assert "v1.98" in CODE
    assert "struct DocumentFence" in CODE
    assert "static func step" in CODE
    assert "listMarkerFence" in CODE
    assert "case listEnded" in CODE
    assert "withAnimation" not in CODE
    assert "UIPasteboard" not in CODE
    assert "/v1/" not in CODE
    assert "computerPane" not in CODE
    assert "v1.98" in LISTS
    assert "fenceOnLine(marker.text)" in LISTS
    assert "the item text itself may be the opening fence" in LISTS
    assert "v1.98" in MARKDOWN
    assert "MarkdownCodeSpan.step" in MARKDOWN
    assert "a fence that belongs to a list item is not a segment" in MARKDOWN
    assert "guard let closer = state.top" in MARKDOWN
    assert "v1.98" in DESKTOP_MATH
    assert "export function stepDocumentFence" in DESKTOP_MATH
    assert "function listMarkerFence" in DESKTOP_MATH
    assert "if (!state.top) return src" in DESKTOP_MD
    assert "stepDocumentFence" in DESKTOP_MD
    assert "openingFence(marker.text)" in DESKTOP_LISTS
    assert "static func listEnd" in LISTS


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.98 " in ROADMAP
    assert "## 198. v1.98" in SPEC
    assert "fenced code that is a list item" in SPEC
    assert "test_ios_markdown_list_fence.py" in CI
    assert "markdownListFence.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert not PANE.exists()


def main() -> int:
    test_list_fence_stays_in_the_item()
    test_docs_ci_and_openapi()
    print("ios markdown list fence ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
