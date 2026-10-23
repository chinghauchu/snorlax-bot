#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.76 CommonMark link text in completed assistant replies.

Reference links and inline images already shipped (v1.39, v1.52).
Angle-bracket destinations shipped in v1.74. Safe inline HTML
shipped in v1.75. Those cuts already matched on both clients for
the cases they named. The gap is link text that contains brackets.

`[link [foo [bar]]](/uri)` is one link whose text is `link [foo [bar]]`.
`[link [bar](/uri)` is literal `[link ` plus the inner link.
`[link \\[bar](/uri)` is one link whose text is `link [bar`.
A link may not contain another link. `[foo [bar](/uri)][ref]` is
the inner link plus the reference, not one outer link. The same
rule applies to `[foo [bar](/u)](/v)`. An undefined `[bar]` in
`[foo][bar]` does not fall back to the shortcut for `foo`.
Code spans, autolinks, and raw HTML bind tighter than brackets, so
a `]` inside a code span does not close the link.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
HTML = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownReferenceLink.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.76 CommonMark link text in completed assistant replies"


def test_link_text_matches_cmark() -> None:
    assert "v1.76" in SWIFT
    assert "v1.76" in DESKTOP
    assert "noLinkOpeners" in SWIFT
    assert "noLinkOpeners" in DESKTOP
    assert "bracketAfter" in SWIFT
    assert "bracketAfter" in DESKTOP
    assert "func autolinkEnd" in SWIFT
    assert "function autolinkEnd" in DESKTOP
    assert "MarkdownHtmlLiteral.htmlTagEnd" in SWIFT
    assert "htmlTagEnd" in DESKTOP
    assert "static func htmlTagEnd" in HTML
    assert "may not contain another link" in SWIFT
    assert "links may not contain" in DESKTOP or "may not contain" in DESKTOP
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_render_path_and_copy() -> None:
    assert "resolveReferenceLinks(replyBody, completed)" in APP
    assert "copyText(reply.content)" in APP
    assert "static func resolve(_ text: String, completed: Bool) -> String" in SWIFT


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.76 " in ROADMAP
    assert "## 176. v1.76" in SPEC
    assert "link text in completed assistant replies" in SPEC
    assert "test_ios_markdown_link_text.py" in CI
    assert "markdownLinkText.test.ts" in PKG


if __name__ == "__main__":
    test_link_text_matches_cmark()
    test_render_path_and_copy()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
