#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.50 GFM single-tilde strikethrough in completed assistant replies.

A completed LEFT kind=message strikes ~text~ the same way ~~text~~
already strikes. The tildes are not shown. ~~text~~ is unchanged.
An unclosed tilde, a spaced pair, a run of three or more, a tilde in
a URL or a link destination, and a tilde in code or math stay literal.
Streaming stays the markdown string. Copy keeps markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownSingleStrike.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownSingleStrike.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.50 GFM single-tilde strikethrough in completed assistant replies"


def test_promote_keeps_streaming_and_source() -> None:
    assert "static func promote(_ text: String, completed: Bool)" in SWIFT
    assert 'if !completed || text.isEmpty || !text.contains("~")' in SWIFT
    assert "v1.84 retires" in SWIFT
    assert "shieldStrayTildes" not in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "export function promoteSingleTilde" in DESKTOP
    assert "v1.84 retires" in DESKTOP
    assert "shieldStrayTildes" not in DESKTOP
    assert "markdown source" in DESKTOP
    assert "copyText" not in DESKTOP
    assert "clipboard" not in DESKTOP
    assert "/v1/" not in DESKTOP


def test_ios_and_desktop_share_the_rule() -> None:
    assert "MarkdownSingleStrike.promote(" in MARKDOWN
    assert "MarkdownHardBreak.apply(escaped, completed: completed)" in MARKDOWN
    assert MARKDOWN.index("MarkdownEscape.protect(src, completed: completed)") < MARKDOWN.index(
        "MarkdownSingleStrike.promote("
    )
    assert "promoteSingleTilde(" in BODY
    assert BODY.count("promoteSingleTilde(") == 3
    assert "remarkStrikethrough" in BODY
    assert "copyText(reply.content)" in APP
    assert "promoteSingleTilde(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.50 " in ROADMAP
    assert "## 150. v1.50" in SPEC
    assert "single-tilde strikethrough in completed assistant replies" in SPEC
    assert "test_ios_markdown_single_strike.py" in CI
    assert "markdownSingleStrike.test.ts" in (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
    assert not PANE.exists()


def main() -> int:
    test_promote_keeps_streaming_and_source()
    test_ios_and_desktop_share_the_rule()
    test_docs_and_openapi()
    print("ios markdown single strike ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
