#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.81 CommonMark link reference definition edge cases.

Checked ATX headings on main before this cut. The CommonMark ATX
examples already match cmark-gfm on the desktop pipeline, and iOS
uses the same block detectors. The unshipped gap was link reference
definitions: they interrupted paragraphs, and labels used a simple
lowercase instead of the Unicode case fold.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
FOLD = (IOS / "MarkdownCaseFold.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.81 CommonMark link reference definition edge cases "
    "in completed assistant replies"
)


def test_edge_rules_are_shared() -> None:
    assert "v1.81" in SWIFT
    assert "v1.81" in DESKTOP
    assert "closesOpenParagraph" in SWIFT
    assert "closesOpenParagraph" in DESKTOP
    assert "MarkdownCaseFold.fold" in SWIFT
    assert "unicodeCaseFold" in DESKTOP
    assert "raw.count > 1000" in SWIFT
    assert "raw.length > 1000" in DESKTOP
    assert '0x00DF: "ss"' in FOLD
    assert '0x1E9E: "ss"' in FOLD
    assert '0x03C2: "σ"' in FOLD
    assert '0xFB01: "fi"' in FOLD
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.81 " in ROADMAP
    assert "## 181. v1.81" in SPEC
    assert "link reference definition edge cases" in SPEC
    assert "test_ios_markdown_reference_edge.py" in CI
    assert "markdownReferenceEdge.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_edge_rules_are_shared()
    test_docs_ci_and_openapi()
    print("ios markdown reference edge ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
