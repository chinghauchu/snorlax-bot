#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.71 GFM http(s) autolink path characters in completed assistant replies.

Task lists already shipped. This cut is the bare http(s) scan. An
interior apostrophe, quote, backtick, or greater-than stays in the
link, the same way www. and cmark-gfm already do. A trailing quote
still peels. A > that closes <https://...> stays outside. Trailing ],
}, and curly quotes still stay outside. ftp stays plain. Code spans
stay literal. Streaming still leaves an end-of-buffer URL plain.
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
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
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

PHRASE = "v1.71 GFM http(s) autolink path characters in completed assistant replies"


def test_http_scan_matches_www_path_characters() -> None:
    assert "v1.71" in LINKS
    assert "v1.71" in DESKTOP
    assert 'pattern: "https?://[^\\\\s<]+"' in LINKS
    assert "https?:\\/\\/[^\\s<]+" in DESKTOP
    assert "func clipAngleCloser" in LINKS
    assert "function clipAngleCloser" in DESKTOP
    assert 'prev == "<"' in LINKS
    assert 'text[index - 1] !== "<"' in DESKTOP
    assert '[^\\\\s<>"\'`]' not in LINKS
    assert '[^\\s<>"\'`]' not in DESKTOP
    assert '"%27"' in LINKS
    assert '"%22"' in LINKS
    assert '"%60"' in LINKS
    assert '"%3E"' in LINKS
    assert "https?://" in LINKS
    assert "ftp" not in LINKS.split("func splitHttp", 1)[1].split("func clipAngleCloser", 1)[0]
    http = LINKS.split("func splitHttp", 1)[1].split("func clipAngleCloser", 1)[0]
    assert http.index("streaming && rawEnd == text.endIndex") < http.index("trimTrailing")
    assert "closing <= opening" in LINKS
    assert "\\u{201C}" in LINKS
    assert "/v1/" not in LINKS
    assert "withAnimation" not in LINKS
    assert "UIPasteboard" not in LINKS
    assert "computerPane" not in LINKS
    assert not PANE.exists()


def test_completed_replies_link_and_copy_stays_source() -> None:
    assert "WebLinks.applyingLinks(parsed, streaming: false)" in MARKDOWN
    assert "WebLinks.attributed(text, streaming: true)" in PLAIN
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
    assert "/ v1.71 " in ROADMAP
    assert "## 171. v1.71" in SPEC
    assert "http(s) autolink path characters" in SPEC
    assert "test_ios_markdown_autolink_path.py" in CI
    assert "markdownAutolinkPath.test.ts" in PKG


if __name__ == "__main__":
    test_http_scan_matches_www_path_characters()
    test_completed_replies_link_and_copy_stays_source()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
