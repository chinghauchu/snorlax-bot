#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.77 CommonMark image alt text in completed assistant replies.

Checked v1.76 on main before this cut. That slice is link text.
It left image-alt flattening out of scope because micromark already
turns `![foo *bar*](/u)` into alt "foo bar" on desktop. The same
parser still disagrees with cmark-gfm: a soft break stays a newline,
a hard break is dropped, a newline inside a code span stays a
newline, and `~~` stays in the alt because strikethrough runs after
the alt collapses. iOS `MarkdownImage.split` only decoded entities
and escapes, so the accessibility label and the failure fallback
kept asterisks, backticks, and nested link syntax.

The alt is now the plain-text flattening. Emphasis, strong,
strikethrough, and code spans contribute their text. A nested link
or image contributes its text. A soft break or a hard break is one
space. Entities and backslash escapes decode. An unknown reference
stays literal, and inside a code span they stay literal. Only a
loadable image is rewritten. The alt is one stash token. javascript:,
data:, and other literal schemes stay the original characters.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownImageAlt.swift").read_text(encoding="utf-8")
IMAGE = (IOS / "MarkdownImage.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownImageAlt.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.77 CommonMark image alt text in completed assistant replies"


def test_alt_flattening_matches_cmark() -> None:
    assert "v1.77" in SWIFT
    assert "v1.77" in DESKTOP
    assert "static func flatten" in SWIFT
    assert "function flattenImageAlt" in DESKTOP
    assert "func prepareAlts" in IMAGE
    assert "function prepareImageAlts" in DESKTOP
    assert "MarkdownImageAlt.flatten" in IMAGE
    assert "MarkdownEscape.stash" in IMAGE
    assert "stashMarkdownText" in DESKTOP
    assert "func characterReference" in ESCAPE
    assert "readCharacterReference" in DESKTOP
    assert "canOpen" in SWIFT and "canClose" in SWIFT
    assert "readCodeSpan" in SWIFT and "function readCodeSpan" in DESKTOP
    assert "~~" in SWIFT and "~~" in DESKTOP
    assert "!completed" in IMAGE
    assert "Streaming" in SWIFT
    assert "kind == .literal" in IMAGE
    assert 'hit.kind === "literal"' in DESKTOP
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_render_path_and_copy() -> None:
    assert "MarkdownImage.prepareAlts(" in MARKDOWN
    assert "prepareSpacedDestinations" in MARKDOWN
    assert "prepareImageAlts(" in BODY
    assert "prepareSpacedLinkDestinations(" in BODY
    assert "prepareLinkDestinations(sourceText, completed)" in BODY
    assert "copyText(reply.content)" in APP
    assert "UIPasteboard.general.string = reply.content" in CHAT
    assert "accessibilityLabel(label)" in IMAGE
    assert "MarkdownImage.fallback" in IMAGE


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.77 " in ROADMAP
    assert "## 177. v1.77" in SPEC
    assert "image alt text in completed assistant replies" in SPEC
    assert "test_ios_markdown_image_alt.py" in CI
    assert "markdownImageAlt.test.ts" in PKG


if __name__ == "__main__":
    test_alt_flattening_matches_cmark()
    test_render_path_and_copy()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
