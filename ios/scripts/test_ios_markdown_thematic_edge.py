#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.82 CommonMark thematic break edge cases.

Checked the CommonMark thematic-break examples on main before this
cut. Basic rules, spaced forms, indent, setext precedence, paragraph
interruption, and `* * *` winning over a list item already matched.
A break indented into a list item was still a top-level rule, and a
break-like line inside an HTML block was too. Desktop and iOS now
leave those lines in the list or the block.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownBreak.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownBreak.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.82 CommonMark thematic break edge cases "
    "in completed assistant replies"
)


def test_edge_rules_are_shared() -> None:
    assert "v1.82" in SWIFT
    assert "v1.82" in DESKTOP
    assert "MarkdownList.listEnd" in SWIFT
    assert "markdownListEnd" in DESKTOP
    assert "htmlBlockLineEnd" in SWIFT
    assert "htmlBlockEnd" in DESKTOP
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.82 " in ROADMAP
    assert "## 182. v1.82" in SPEC
    assert "thematic break edge cases" in SPEC
    assert "test_ios_markdown_thematic_edge.py" in CI
    assert "markdownThematicEdge.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


def main() -> int:
    test_edge_rules_are_shared()
    test_docs_ci_and_openapi()
    print("ios markdown thematic edge ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
