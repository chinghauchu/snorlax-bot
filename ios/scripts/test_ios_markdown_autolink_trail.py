#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.62 GFM extended autolink trailing punctuation.

A completed LEFT kind=message leaves trailing ?, !, ., ,, :, *, _, and
~ outside a bare www. or http(s) autolink. A trailing ) is excluded only
when parentheses are unbalanced. A trailing entity-like &hl; is excluded.
< ends the link. www. already used that delimiter. http(s) now uses it
too, on desktop and iOS. Streaming still leaves an end-of-buffer URL
plain. Copy keeps markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LINKS = (IOS / "WebLinks.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
PLAIN = (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "linkify.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v1.62 GFM extended autolink trailing punctuation in completed assistant replies"
)


def test_http_uses_the_www_delimiter() -> None:
    assert "v1.62" in LINKS
    assert "v1.62" in DESKTOP
    assert "func trimTrailing" in LINKS
    assert "function trimTrailingPunctuation" in DESKTOP
    assert "autolinkDelim(chars, 0, end)" in LINKS
    assert "autolinkDelim(url, 0, end)" in DESKTOP
    trail = LINKS.split("let trail:", 1)[1].split("]", 1)[0]
    www = DESKTOP.split("const WWW_TRAIL", 1)[1].split(";", 1)[0]
    for mark in ("?", "!", ".", ",", ":", "*", "_", "~"):
        assert f'"{mark}"' in trail
        assert f'"{mark}"' in www
    assert 'chars[k] == "&"' in LINKS
    assert 'text[k] === "&"' in DESKTOP
    assert "closing <= opening" in LINKS
    assert "closing <= opening" in DESKTOP
    assert 'chars[rawEnd] != "<"' in LINKS
    assert 'text[rawEnd] !== "<"' in DESKTOP
    assert "\\u{201C}" in LINKS
    assert "\\u201c" in DESKTOP
    http = LINKS.split("func splitHttp", 1)[1].split("static func attributed", 1)[0]
    assert http.index("streaming && range.upperBound") < http.index("trimTrailing")
    desktop_http = DESKTOP.split("function splitHttp", 1)[1].split("const WWW_TRAIL", 1)[0]
    assert desktop_http.index("streaming && idx + raw.length") < desktop_http.index(
        "trimTrailingPunctuation"
    )
    assert "/v1/" not in LINKS
    assert "withAnimation" not in LINKS
    assert "UIPasteboard" not in LINKS
    assert "computerPane" not in LINKS
    assert "computerPane" not in DESKTOP


def test_completed_replies_link_and_copy_stays_source() -> None:
    assert "WebLinks.applyingLinks(parsed, streaming: false)" in MARKDOWN
    assert "WebLinks.attributed(text, streaming: true)" in PLAIN
    assert "splitWebUrls(text, { streaming, emails })" in BODY
    assert "href={linkHref(piece.value)}" in BODY
    assert "copyText(reply.content)" in APP
    assert "splitWebUrls(reply.content" not in APP
    left = CHAT.split("LongMessageBody(", 1)[1].split("if showCopy || showSpeak", 1)[0]
    assert "AssistantMarkdown(" in left
    assert "MidStreamPlaintextView(" in left
    assert "copyText(reply.content)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.62 " in ROADMAP
    assert "## 162. v1.62" in SPEC
    assert "GFM extended autolink trailing punctuation" in SPEC
    assert "test_ios_markdown_autolink_trail.py" in CI
    assert "markdownAutolinkTrail.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_http_uses_the_www_delimiter()
    test_completed_replies_link_and_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown autolink trail ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
