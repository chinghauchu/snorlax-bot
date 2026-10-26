#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.90 cmark-gfm entity and numeric character references.

Checked cmark-gfm 0.29.0.gfm.13 on main first. Ordinary text already
decoded the HTML5 named set and in-range numeric references. Invalid
references stayed literal. Code stayed literal. A reference was not
markdown syntax. Destinations and reference-definition titles already
decoded. The unshipped gap was an inline link or image title, which
rewrote an unknown name into a literal ampersand, and a fence info
string whose decoded word was clipped on the language label.
Streaming stays plain. Copy keeps markdown source. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
ENTITIES = (IOS / "MarkdownCmarkEntities.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
DESKTOP_ENTITIES = (ROOT / "desktop" / "src" / "markdownCmarkEntities.ts").read_text(
    encoding="utf-8"
)
LANG = (ROOT / "desktop" / "src" / "markdown.ts").read_text(encoding="utf-8")
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
    "v1.90 cmark-gfm entity and numeric character references "
    "in completed assistant replies"
)
NAMES = (
    "AElig",
    "Dcaron",
    "frac34",
    "HilbertSpace",
    "DifferentialD",
    "ClockwiseContourIntegral",
    "CounterClockwiseContourIntegral",
    "ngE",
    "ouml",
    "nbsp",
    "amp",
    "copy",
)


def test_both_clients_use_the_full_html5_table() -> None:
    assert "v1.90" in SWIFT
    assert "v1.90" in DESKTOP
    assert "CMARK_NAMED_ENTITIES" in DESKTOP
    assert "MarkdownCmarkEntities.named" in SWIFT
    assert "static func decodedText" in SWIFT
    assert "decodeEntities" in SWIFT
    assert "asciiPunct.contains" in SWIFT
    assert "readReference" in SWIFT
    assert "digits > max" in SWIFT
    assert "digits > max" in DESKTOP
    for name in NAMES:
        assert f'"{name}":' in ENTITIES
        assert f'"{name}":' in DESKTOP_ENTITIES
    assert "UIPasteboard" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert "/v1/" not in DESKTOP


def test_info_string_decodes_and_the_code_body_does_not() -> None:
    shown = "let shown = completed ? MarkdownEscape.decodedText(language) : language"
    assert shown in MARKDOWN
    assert "MarkdownSplit.isMermaidLanguage(shown)" in MARKDOWN
    assert "language: shown" in MARKDOWN
    assert "decodedText(source)" not in MARKDOWN
    assert "language-(\\S+)" in LANG
    assert "fenceLanguage(props.className)" in BODY
    assert "copyText(reply.content)" in APP
    assert "protectMarkdownEscapes(reply.content" not in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.90 " in ROADMAP
    assert "## 190. v1.90" in SPEC
    assert "f&ouml;&ouml;" in SPEC
    assert "&#42;foo&#42;" in SPEC
    assert "test_ios_markdown_entity_ref.py" in CI
    assert "markdownEntityRef.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_both_clients_use_the_full_html5_table()
    test_info_string_decodes_and_the_code_body_does_not()
    test_docs_and_openapi()
    print("ios markdown entity ref ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
