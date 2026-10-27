#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.99 cmark-gfm extended autolink trailing character references.

Checked cmark-gfm 0.29.0.gfm.13 on main first. Trailing punctuation,
parenthesis balancing, www boundaries, and an unknown `&hl;` tail
already match. A real HTML character reference was decoded before
the autolink scan, so the decoded character stuck to the URL.

A trailing named reference now decodes outside the link. A reference
inside the path stays the source characters. `&#38;` keeps `&#38`
inside the link and the semicolon outside. A backslash in the path
stays a backslash.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
DESKTOP_ESCAPE = (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(encoding="utf-8")
DESKTOP_LINKS = (ROOT / "desktop" / "src" / "linkify.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.99 cmark-gfm extended autolink trailing character references "
    "in completed assistant replies"
)


def test_autolink_entity_stays_out_of_the_link() -> None:
    assert "v1.99" in LINKS
    assert "extendedAutolinkSpans" in LINKS
    assert "trailingEscapeToken" in LINKS
    assert "MarkdownEscape.restoreString" in LINKS
    assert "§§SBL" in LINKS
    assert "withAnimation" not in LINKS
    assert "UIPasteboard" not in LINKS
    assert "/v1/" not in LINKS
    assert "computerPane" not in LINKS
    assert "v1.99" in ESCAPE
    assert "literalToken" in ESCAPE
    assert "extendedLiteralSpans" in ESCAPE
    assert "§§SBL" in ESCAPE
    assert "§§SB[EL]" in ESCAPE
    assert "withAnimation" not in ESCAPE
    assert "/v1/" not in ESCAPE
    assert "v1.99" in DESKTOP_ESCAPE
    assert "function literalToken" in DESKTOP_ESCAPE
    assert "§§SBL" in DESKTOP_ESCAPE
    assert "extendedAutolinkRanges" in DESKTOP_LINKS
    assert "trailingEscapeToken" in DESKTOP_LINKS


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v1.99 " in ROADMAP
    assert "## 199. v1.99" in SPEC
    assert "trailing character references" in SPEC
    assert "test_ios_markdown_autolink_entity.py" in CI
    assert "markdownAutolinkEntity.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert not PANE.exists()


def main() -> int:
    test_autolink_entity_stays_out_of_the_link()
    test_docs_ci_and_openapi()
    print("ios markdown autolink entity ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
