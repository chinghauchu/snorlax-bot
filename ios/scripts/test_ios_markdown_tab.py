#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.89 cmark-gfm tab stops when a container marker partly consumes a tab.

Spec 2.2 tab stops already matched on both clients (v1.48, v1.53,
v1.54, v1.72, v1.73): a leading tab is indented code, a tab inside
that code stays a tab, and a heading, thematic break, quote, or
list marker may consume part of a later tab. The unshipped gap is
fence_offset. A quote or list marker that stops inside a tab counts
that tab as one whitespace byte. The leftover columns become spaces
in the fence code. A space-only fence is unchanged. Streaming stays
plain text. Copy keeps markdown source. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
FENCE = (IOS / "MarkdownFenceIndent.swift").read_text(encoding="utf-8")
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
DESKTOP_FENCE = (ROOT / "desktop" / "src" / "markdownFenceIndent.ts").read_text(encoding="utf-8")
DESKTOP_LIST = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
DESKTOP_QUOTE = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"


def test_offsets_match() -> None:
    for source in (FENCE, LIST, QUOTE, DESKTOP_FENCE, DESKTOP_LIST, DESKTOP_QUOTE):
        assert "v1.89" in source
        assert "tabFenceOpen" in source
        assert "tabFenceCodeLine" in source
        assert "tabFenceCloses" in source
        assert "/v1/" not in source
        assert "computerPane" not in source
    assert "fenceLiteral" in LIST
    assert "fenceLiteral" in DESKTOP_LIST
    assert "listSplitByTabFence" in DESKTOP_LIST
    assert "listSplitByTabFence" in BODY
    assert "markers: true" in QUOTE
    assert "markers = true" in DESKTOP_QUOTE or ", true)" in DESKTOP_QUOTE
    assert "UIPasteboard" not in FENCE
    assert "UIPasteboard" not in LIST
    assert "UIPasteboard" not in QUOTE
    assert "copyText(reply.content)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "v1.89 cmark-gfm tab stops when a container marker partly consumes a tab" in ROADMAP
    assert "/ v1.89 " in ROADMAP
    assert "## 189. v1.89" in SPEC
    assert "test_ios_markdown_tab.py" in CI
    assert "markdownTab.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()


def main() -> int:
    test_offsets_match()
    test_docs_and_openapi()
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
