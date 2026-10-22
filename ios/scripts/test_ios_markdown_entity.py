#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.61 CommonMark character references inside raw HTML.

A completed LEFT kind=message already decodes named and numeric
character references outside code (v1.40). A reference does not
become emphasis or a heading. Code stays literal. v1.60 stashes a
raw HTML tag in the same §§SBE token. When that tag already holds
an entity token, restore repeats until the character shows. Link
destinations and titles decode. Streaming stays plain. Copy still
copies markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
HTML = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
HTML_DESKTOP = (ROOT / "desktop" / "src" / "markdownHtmlLiteral.ts").read_text(encoding="utf-8")
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
    "v1.61 CommonMark character references stay characters inside raw HTML "
    "in completed assistant replies"
)


def test_restore_unwraps_a_stash_around_an_entity() -> None:
    assert "v1.61" in SWIFT
    assert "v1.61" in HTML
    assert "v1.61" in DESKTOP
    assert "v1.61" in HTML_DESKTOP
    assert "for _ in 0..<8" in SWIFT
    assert "for (let pass = 0; pass < 8; pass += 1)" in DESKTOP
    assert "static func restoreString" in SWIFT
    assert "func restoreURL" in SWIFT
    assert "export function restoreMarkdownEscapes" in DESKTOP
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "/v1/" not in DESKTOP
    assert "computerPane" not in DESKTOP


def test_both_clients_decode_before_the_parser_and_restore_after() -> None:
    protect = "MarkdownEscape.protect(src, completed: completed)"
    literal = "MarkdownHtmlLiteral.literalize("
    restore = "MarkdownEscape.restore(parsed)"
    assert protect in MARKDOWN
    assert literal in MARKDOWN
    assert restore in MARKDOWN
    # literalize(protect(...)) is written outer-first. Protect runs first.
    assert MARKDOWN.index(literal) < MARKDOWN.index(protect) < MARKDOWN.index(restore)
    assert "restoreMarkdownEscapes(href ?? \"\")" in BODY
    assert "copyText(reply.content)" in APP
    assert "protectMarkdownEscapes(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.61 " in ROADMAP
    assert "## 161. v1.61" in SPEC
    assert "character references stay characters inside raw HTML" in SPEC
    assert "&#42;foo&#42;" in SPEC
    assert "&#35;" in SPEC
    assert "[a](/u?x=1&amp;y=2)" in SPEC
    assert "test_ios_markdown_entity.py" in CI
    assert "markdownEntity.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_restore_unwraps_a_stash_around_an_entity()
    test_both_clients_decode_before_the_parser_and_restore_after()
    test_docs_and_openapi()
    print("ios markdown entity ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
