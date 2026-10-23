#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.74 CommonMark spaced angle-bracket link destinations.

GFM escaped pipes inside table cells, including inside inline code,
already shipped in v1.55. Short rows pad and wide rows drop extra
cells in v1.65. Leading and trailing pipes were already optional.
Link titles in single quotes and parentheses already shipped in
v1.39 and v1.46. This cut is the pointy destination that contains
a space or a tab. `[docs](<https://example.com/my file> 'API')`
stays one link, the destination percent-encodes the space, and the
title is API. A reference definition with that destination resolves.
An inline link is not replaced by a same-label shortcut. A backslash
before a space stays a backslash. Code stays literal. Streaming stays
plain text. Copy keeps markdown source. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
REF = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
IMAGE = (IOS / "MarkdownImage.swift").read_text(encoding="utf-8")
TITLE = (IOS / "MarkdownLinkTitle.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(encoding="utf-8")
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

PHRASE = (
    "v1.74 CommonMark spaced angle-bracket link destinations "
    "in completed assistant replies"
)


def test_pointy_destinations_keep_spaces() -> None:
    assert "v1.74" in REF
    assert "v1.74" in DESKTOP
    assert "func prepareSpacedDestinations" in REF
    assert "func encodeDestination" in REF
    assert "function prepareSpacedLinkDestinations" in DESKTOP
    assert "encodeLinkDestination" in DESKTOP
    assert "isAsciiPunct" in REF
    assert "ASCII_PUNCT.includes" in DESKTOP
    assert 'ch == "\\n" || ch == "<" || ch == " " || ch == "\\t"' not in REF
    assert "v1.74" in IMAGE
    assert "MarkdownReferenceLink.encodeDestination" in IMAGE
    assert "v1.74" in TITLE
    assert "/v1/" not in REF
    assert "withAnimation" not in REF
    assert "UIPasteboard" not in REF
    assert "computerPane" not in REF
    assert not PANE.exists()


def test_render_encodes_and_copy_stays_source() -> None:
    assert "MarkdownLinkDest.prepare(self.source, completed: completed)" in MARKDOWN
    assert "prepareSpacedDestinations(" in MARKDOWN
    assert "prepareLinkDestinations(sourceText, completed)" in BODY
    assert "prepareSpacedLinkDestinations(" in BODY
    assert "resolveReferenceLinks(" in APP
    assert "prepareSpacedLinkDestinations" not in APP
    assert "copyText(reply.content)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.74 " in ROADMAP
    assert "## 174. v1.74" in SPEC
    assert "spaced angle-bracket link destinations" in SPEC
    assert "test_ios_markdown_angle_dest.py" in CI
    assert "markdownAngleDest.test.ts" in PKG


if __name__ == "__main__":
    test_pointy_destinations_keep_spaces()
    test_render_encodes_and_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
