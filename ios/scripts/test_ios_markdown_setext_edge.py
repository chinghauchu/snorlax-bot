#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.80 CommonMark setext heading edge cases.

Checked v1.44 and v1.79 on main before this cut. Basic setext
headings already shipped. A lone --- was still heading text, HTML
blocks ended on the wrong line, and indented code after a block
was not code. Desktop and iOS now share the cmark-gfm edge rules.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownSetext.swift").read_text(encoding="utf-8")
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownSetext.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.80 CommonMark setext heading edge cases "
    "in completed assistant replies"
)


def test_edge_rules_are_shared() -> None:
    assert "v1.80" in SWIFT
    assert "v1.80" in DESKTOP
    assert "allowCode" in SWIFT
    assert "allowCode" in DESKTOP
    assert "htmlBlockLineEnd" in SWIFT
    assert "htmlBlockLineEnd" in LIST
    assert "htmlBlockEnd" in DESKTOP
    assert "isThematic(line)" in SWIFT
    assert "isThematic(line)" in DESKTOP
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.80 " in ROADMAP
    assert "## 180. v1.80" in SPEC
    assert "setext heading edge cases" in SPEC
    assert "test_ios_markdown_setext_edge.py" in CI
    assert "markdownSetextEdge.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_edge_rules_are_shared()
    test_docs_ci_and_openapi()
    print("ios markdown setext edge ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
