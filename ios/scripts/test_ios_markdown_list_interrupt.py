#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.56 CommonMark lists do not interrupt a paragraph in completed assistant replies.

A completed LEFT kind=message keeps 9. / 14. / 2) / 01. in the
paragraph, and keeps an empty 1. or * in the paragraph too. 1. and
1) and a bullet with text still start a list. A blank line, a
heading, or a fence lets any start number begin a list. Streaming
stays the markdown string. Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.56 CommonMark lists do not interrupt a paragraph "
    "in completed assistant replies"
)


def test_interrupt_rule() -> None:
    assert "v1.56" in SWIFT
    assert "private static func markerInterruptsParagraph" in SWIFT
    assert 'marker.digits != "1"' in SWIFT
    assert "marker.text.isEmpty" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "v1.56" in DESKTOP
    assert "function markerInterruptsParagraph" in DESKTOP
    assert 'marker.digits !== "1"' in DESKTOP
    assert 'marker.text === ""' in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "MarkdownList.split(source, completed: completed)" in MARKDOWN
    assert "copyText(reply.content)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.56 " in ROADMAP
    assert "## 156. v1.56" in SPEC
    assert "lists do not interrupt a paragraph in completed assistant replies" in SPEC
    assert "test_ios_markdown_list_interrupt.py" in CI
    assert "markdownListInterrupt.test.ts" in (
        ROOT / "desktop" / "package.json"
    ).read_text(encoding="utf-8")
    assert not PANE.exists()
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def main() -> int:
    test_interrupt_rule()
    test_docs_and_openapi()
    print("ios markdown list interrupt ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
