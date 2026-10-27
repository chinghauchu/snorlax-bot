#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.94 cmark-gfm emphasis delimiter runs in completed assistant replies.

Checked cmark-gfm 0.29.0.gfm.13 section 6.4 on main first. The rule
of 3, punctuation flanking, intraword underscore, and the
process-emphasis stack already matched. This scanner is the
whitespace set those left, plus the image-alt flanking call.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownEmphasis.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
ALT = (IOS / "MarkdownImageAlt.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownEmphasis.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.94 cmark-gfm emphasis delimiter runs in completed assistant replies"


def code_list(text: str, name: str) -> list[int]:
    match = re.search(name + r"[^=]*=\s*\[([^\]]+)\]", text, re.S)
    assert match is not None, name
    return [int(part, 16) for part in re.findall(r"0x[0-9A-Fa-f]+", match.group(1))]


def test_space_sets_match() -> None:
    non_swift = code_list(SWIFT, "nonCmarkSpaces")
    non_desk = code_list(DESKTOP, "NON_CMARK_SPACE_CODES")
    cmark_swift = code_list(SWIFT, "cmarkSpaces")
    cmark_desk = code_list(DESKTOP, "CMARK_SPACE_CODES")
    assert non_swift == non_desk == [0x000B, 0x0085, 0x2028, 0x2029, 0xFEFF]
    assert cmark_swift == cmark_desk
    assert 0x00A0 in cmark_swift
    assert 0x000B not in cmark_swift
    assert set(non_swift).isdisjoint(cmark_swift)
    assert "static func isCmarkSpace" in SWIFT
    assert "static func protect(_ text: String, completed: Bool) -> String" in SWIFT
    assert "opaqueSpans" in SWIFT
    assert "inLinkDestination" in SWIFT
    assert "inUrlOrEmail" in SWIFT
    assert "\\u{E000}SBW" in SWIFT
    assert "stronglyEmphasized" in SWIFT
    assert "markdown source" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT


def test_call_sites() -> None:
    assert "MarkdownEmphasis.protect(symbols, completed: true)" in ESCAPE
    assert "MarkdownEmphasis.restoreString" in ESCAPE
    assert "MarkdownEmphasis.isCmarkSpace" in ALT
    assert "properties.isWhitespace" not in ALT
    assert "isCmarkUnicodeSpace" in (ROOT / "desktop" / "src" / "markdownImageAlt.ts").read_text(
        encoding="utf-8"
    )
    assert "flattenNestedStrong" in (ROOT / "desktop" / "src" / "markdownHardBreak.ts").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.94 " in ROADMAP
    assert "## 194. v1.94" in SPEC
    assert "emphasis delimiter runs" in SPEC
    assert "test_ios_markdown_emphasis.py" in CI
    assert "markdownEmphasis.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_space_sets_match()
    test_call_sites()
    test_docs_ci_and_openapi()
    print("ios markdown emphasis ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
