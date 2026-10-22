#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.69 over-long numeric character references stay literal.

A completed LEFT kind=message already decodes in-range references
(&amp;, &copy;, &#169;, &#x1F600;) on both clients. A reference with
more digits than CommonMark allows stayed raw in the source, so
desktop micromark showed the characters and iOS cmark-gfm did not:
&#87654321; became U+FFFD and &#x0001F600; became an emoji. Both
clients now stash that source before the parser. A missing
semicolon, an unknown name, and code stay literal. &#0; is still
U+FFFD. Streaming stays plain. Copy still copies markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
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
    "v1.69 CommonMark over-long numeric character references stay literal "
    "in completed assistant replies"
)


def test_overlong_digits_are_stashed_as_text() -> None:
    assert "v1.69" in SWIFT
    assert "v1.69" in DESKTOP
    assert "if digits > max" in SWIFT
    assert "if (digits > max)" in DESKTOP
    assert "&#87654321;" in SWIFT
    assert "&#x0001F600;" in SWIFT
    assert "&#87654321;" in DESKTOP
    assert "&#x0001F600;" in DESKTOP
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "/v1/" not in DESKTOP
    assert "computerPane" not in DESKTOP


def test_both_renderers_protect_before_the_parser() -> None:
    assert "MarkdownEscape.protect(src, completed: completed)" in MARKDOWN
    assert BODY.count("protectMarkdownEscapes(mathText, completed)") == 3
    assert "copyText(reply.content)" in APP
    assert "protectMarkdownEscapes(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.69 " in ROADMAP
    assert "## 169. v1.69" in SPEC
    assert "&#87654321;" in SPEC
    assert "&#x0001F600;" in SPEC
    assert "test_ios_markdown_entity_digits.py" in CI
    assert "markdownEntityDigits.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_overlong_digits_are_stashed_as_text()
    test_both_renderers_protect_before_the_parser()
    test_docs_and_openapi()
    print("ios markdown entity digits ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
