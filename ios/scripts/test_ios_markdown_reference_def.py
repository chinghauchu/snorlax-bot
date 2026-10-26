#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.92 cmark-gfm link reference definitions.

Checked cmark-gfm 0.29.0.gfm.13 sections 4.7 and 6.3 on main
first. Multi-line labels, destinations, and titles, the rule
that a definition cannot interrupt a paragraph, first
definition wins, Unicode case fold, escaped brackets, a
1000-character label, and a definition after a setext
underline already matched. The unshipped gap was an empty
pointy destination, a title on a later line with trailing
text, and a definition that is the body of a list item or
blockquote. Streaming stays plain. Copy keeps markdown
source. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.92 cmark-gfm link reference definitions in completed assistant replies"


def test_container_definitions_match() -> None:
    assert "v1.92" in SWIFT
    assert "v1.92" in DESKTOP
    assert "parseContainerDefinition" in SWIFT
    assert "parseContainerDefinition" in DESKTOP
    assert "StoredDef" in SWIFT
    assert "StoredDef" in DESKTOP
    assert "beforeTitle" in SWIFT
    assert "beforeTitle" in DESKTOP
    assert "MarkdownList.listMarkerPadding" in SWIFT
    assert "listMarkerPadding" in DESKTOP
    assert "lazy continuation" in SWIFT
    assert "lazy continuation" in DESKTOP
    assert "UIPasteboard" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP
    assert "computerPane" not in SWIFT
    assert "computerPane" not in DESKTOP
    assert not PANE.exists()


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.92 " in ROADMAP
    assert "## 192. v1.92" in SPEC
    assert "[foo]: <>" in SPEC
    assert "test_ios_markdown_reference_def.py" in CI
    assert "markdownReferenceDef.test.ts" in PKG


def main() -> int:
    test_container_definitions_match()
    test_docs_and_openapi()
    print("ios markdown reference def ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
