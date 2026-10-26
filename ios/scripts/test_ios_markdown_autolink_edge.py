#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.85 GFM extended autolink edge cases in completed assistant replies.

Checked cmark-gfm's autolink extension on main first. www trailing
punctuation, balanced parentheses, angle endings, letter entities, and
underscores in the last two www segments already matched. Code spans,
existing links, and HTML blocks already skip autolinks. ftp and other
schemes stay plain. This cut is the http(s) domain scan, digit
entities, and emails that end in a digit. An underscore in the last
two segments stays plain. &hl1; keeps the digits. foo@bar.com2 stays
plain. Exact mailto: stays in the link. Streaming stays plain text.
Copy keeps markdown source. No animation. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "linkify.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.85 GFM extended autolink edge cases in completed assistant replies"


def test_scan_matches_cmark_edges() -> None:
    assert "v1.85" in LINKS
    assert "v1.85" in DESKTOP
    assert "allowShort: true" in LINKS
    assert "checkDomain(text, hostStart, true)" in DESKTOP
    assert "func isAsciiAlpha" in LINKS
    assert "function isAsciiAlpha" in DESKTOP
    assert "func isMailtoCaseVariant" in LINKS
    assert "function isMailtoCaseVariant" in DESKTOP
    assert 'prefix == "mailto:"' in LINKS
    assert '!== "mailto:"' in DESKTOP
    assert "isAsciiAlpha(chars[k])" in LINKS
    assert "isAsciiAlpha(text[k]!)" in DESKTOP
    assert "isAutolinkHostChar" in LINKS
    assert "function isAutolinkHostChar" in DESKTOP
    assert 'pattern: "https?://[^\\\\s<]+"' in LINKS
    assert "https?:\\/\\/[^\\s<]+" in DESKTOP
    assert "func checkDomain" in LINKS
    assert "function checkDomain" in DESKTOP
    assert "/v1/" not in LINKS
    assert "withAnimation" not in LINKS
    assert "UIPasteboard" not in LINKS
    assert "xmpp" not in LINKS
    assert "computerPane" not in LINKS
    assert not PANE.exists()


def test_completed_replies_link_and_copy_stays_source() -> None:
    assert "WebLinks.applyingLinks(parsed, streaming: false)" in MARKDOWN
    assert "splitWebUrls(text, { streaming, emails })" in BODY
    assert "href={linkHref(piece.value)}" in BODY
    assert "copyText(reply.content)" in APP
    assert "splitWebUrls(reply.content" not in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.85 " in ROADMAP
    assert "## 185. v1.85" in SPEC
    assert "GFM extended autolink edge cases" in SPEC
    assert "test_ios_markdown_autolink_edge.py" in CI
    assert "markdownAutolinkEdge.test.ts" in PKG


if __name__ == "__main__":
    test_scan_matches_cmark_edges()
    test_completed_replies_link_and_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
