#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.91 cmark-gfm backslash escapes.

Checked cmark-gfm 0.29.0.gfm.13 section 2.4 on main first.
ASCII punctuation, literal non-punctuation backslashes, hard
breaks, code, link destinations, titles, and fence info strings
already matched. The unshipped gap was an angle autolink and
raw HTML, where a backslash was still an escape, and a
reference label that dropped the backslash before matching.
Streaming stays plain. Copy keeps markdown source. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
REF = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
DESKTOP_REF = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.91 cmark-gfm backslash escapes in completed assistant replies"


def test_autolinks_and_raw_html_keep_a_backslash() -> None:
    assert "v1.91" in SWIFT
    assert "v1.91" in DESKTOP
    assert "func autolinkSpans" in SWIFT
    assert "func slashLiteralSpans" in SWIFT
    assert "func rawHtmlBlockSpans" in SWIFT
    assert "MarkdownList.htmlBlockLineEnd" in SWIFT
    assert "MarkdownHtmlLiteral.htmlTagEnd" in SWIFT
    assert "isEmailAutolink" in SWIFT
    assert "isSchemeAutolink" in SWIFT
    assert "function autolinkRanges" in DESKTOP
    assert "function slashLiteralRanges" in DESKTOP
    assert "function rawHtmlBlockRanges" in DESKTOP
    assert "htmlTagEnd" in DESKTOP
    assert "htmlBlockEnd" in DESKTOP
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert "copyText(reply.content)" in APP
    assert "protectMarkdownEscapes(reply.content" not in APP
    assert "protectMarkdownEscapes(mathText, completed)" in BODY
    assert "UIPasteboard" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP
    assert "computerPane" not in SWIFT
    assert "computerPane" not in DESKTOP


def test_label_keeps_the_backslash() -> None:
    assert "v1.91" in REF
    assert "v1.91" in DESKTOP_REF
    assert "foo\\!" in REF
    assert "foo\\!" in DESKTOP_REF
    assert "out.append(chars[i + 1])" not in REF
    assert "unicodeCaseFold(raw)" in DESKTOP_REF
    assert "MarkdownCaseFold.fold(raw)" in REF


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.91 " in ROADMAP
    assert "## 191. v1.91" in SPEC
    assert "example.com?find=" in SPEC
    assert "test_ios_markdown_backslash.py" in CI
    assert "markdownBackslash.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_autolinks_and_raw_html_keep_a_backslash()
    test_label_keeps_the_backslash()
    test_docs_and_openapi()
    print("ios markdown backslash ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
