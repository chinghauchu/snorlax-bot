#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.54 CommonMark list marker padding in completed assistant replies.

A completed LEFT kind=message keeps the CommonMark content column
after a list marker. One to four spaces, or a tab, are padding, so
`-   item` and its continuation stay aligned. Five or more spaces
keep one as the separator. A marker line with no text, such as `1.`
then `   text`, uses a padding of one. A second blank line before
any text ends the item. Streaming stays the markdown string. Copy
controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
LOOSE = (IOS / "MarkdownLooseList.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
LOOSE_TS = (ROOT / "desktop" / "src" / "markdownLooseList.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.54 CommonMark list marker padding in completed assistant replies"


def test_padding_keeps_streaming_and_source() -> None:
    assert "static func listMarkerPadding(" in SWIFT
    assert "spacesAfter >= 5 || spacesAfter < 1 || blank" in SWIFT
    assert "markerColumn + 1" in SWIFT
    assert "v1.54" in SWIFT
    assert "static func lazyItemLine" in SWIFT
    assert "if !sawContent { break }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function listMarkerPadding" in DESKTOP
    assert "spacesAfter >= 5 || spacesAfter < 1 || blank" in DESKTOP
    assert "contentColumn: markerColumn + 1" in DESKTOP
    assert "v1.54" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "MarkdownList.listMarkerPadding" in LOOSE
    assert "sawContent" in LOOSE
    assert "listMarkerPadding" in LOOSE_TS
    assert "sawContent" in LOOSE_TS


def test_copy_stays_source() -> None:
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in LOOSE


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.54 " in ROADMAP
    assert "## 154. v1.54" in SPEC
    assert "list marker padding in completed assistant replies" in SPEC
    assert "test_ios_markdown_list_padding.py" in CI
    assert "markdownListPadding.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_padding_keeps_streaming_and_source()
    test_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown list padding ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
