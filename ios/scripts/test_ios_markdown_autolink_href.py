#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.00 cmark-gfm extended autolink href percent-encoding.

Checked cmark-gfm 0.29.0.gfm.13 on main first. v1.99 left the href
unencoded. A `]` that stays inside a www link, and a non-ASCII
character in the path, were still the source bytes in the destination.

The visible text stays those characters. The href uses
houdini_escape_href: `]` is `%5D`, `ä` is `%C3%A4`, `|` is `%7C`.
`&` and `'` stay characters. A trailing `]` on http(s) stays outside
the link. Safe URLs are unchanged.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
DEST = (IOS / "MarkdownLinkDest.swift").read_text(encoding="utf-8")
DESKTOP_LINKS = (ROOT / "desktop" / "src" / "linkify.ts").read_text(encoding="utf-8")
DESKTOP_DEST = (ROOT / "desktop" / "src" / "markdownLinkDest.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v2.00 cmark-gfm extended autolink href percent-encoding "
    "in completed assistant replies"
)


def test_href_encoding_is_shared() -> None:
    assert "v2.00" in LINKS
    assert "MarkdownLinkDest.autolinkHref" in LINKS
    assert "withAnimation" not in LINKS
    assert "UIPasteboard" not in LINKS
    assert "/v1/" not in LINKS
    assert "computerPane" not in LINKS
    assert "v2.00" in DEST
    assert "static func autolinkHref" in DEST
    assert "encodeHref(value)" in DEST
    assert "withAnimation" not in DEST
    assert "/v1/" not in DEST
    assert "v2.00" in DESKTOP_LINKS
    assert "encodeCmarkHref" in DESKTOP_LINKS
    assert "export function encodeCmarkHref" in DESKTOP_DEST


def test_docs_ci_and_openapi() -> None:
    assert PHRASE in ROADMAP
    assert "/ v2.00 " in ROADMAP
    assert "## 200. v2.00" in SPEC
    assert "href percent-encoding" in SPEC
    assert "test_ios_markdown_autolink_href.py" in CI
    assert "markdownAutolinkHref.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert not PANE.exists()


def main() -> int:
    test_href_encoding_is_shared()
    test_docs_ci_and_openapi()
    print("ios markdown autolink href ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
