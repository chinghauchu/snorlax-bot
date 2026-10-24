#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.84 GFM strikethrough flanking in completed assistant replies.

A completed LEFT kind=message matches cmark-gfm strikethrough
flanking. One tilde and two tildes both strike when the run is
left-flanking or right-flanking and the two runs are the same
length. Three or more stay literal. ~~a~ stays literal.
Punctuation flanking keeps a~~.b~~ and a~~$~~b literal.
~~foo ~~bar~~ strikes bar only. ~foo~~bar~ strikes foo~~bar.
A soft newline may sit inside the pair. A hard break still ends
the pair on desktop. The old rewrite that turned ~text~ into
~~text~~ is gone, so iOS full markdown sees the original tildes.
Streaming stays plain text. Copy keeps markdown source.
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
BREAKS = (ROOT / "desktop" / "src" / "markdownBreak.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ALT = (ROOT / "desktop" / "src" / "markdownImageAlt.ts").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.84 GFM strikethrough flanking in completed assistant replies"


def test_flanking_lives_in_the_desktop_pass() -> None:
    assert "ASCII_PUNCT" in BREAKS
    assert "end - i === 1 || end - i === 2" in BREAKS
    assert "flankFlags" in BREAKS
    assert "runInLink" in BREAKS
    assert "~foo~~bar~" in BREAKS
    assert "a~~$~~b" in BREAKS or "ASCII_PUNCT" in BREAKS
    assert "v1.84 retires" in DESKTOP
    assert "return text" in DESKTOP
    assert "shieldStrayTildes" not in DESKTOP
    assert "v1.84 retires" in SWIFT
    assert 'if !completed || text.isEmpty || !text.contains("~")' in SWIFT
    assert "return text" in SWIFT
    assert "shieldStrayTildes" not in SWIFT
    assert "~foo~~bar~" in SWIFT
    assert "markdown source" in SWIFT
    assert "markdown source" in DESKTOP
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "copyText" not in DESKTOP
    assert "/v1/" not in BREAKS
    assert "if (!strike || n === 2)" in ALT


def test_call_sites_stay_put() -> None:
    assert "MarkdownSingleStrike.promote(" in MARKDOWN
    assert "becomes ~~text~~" not in MARKDOWN
    assert BODY.count("promoteSingleTilde(") == 3
    assert "remarkStrikethrough" in BODY
    assert "copyText(reply.content)" in APP
    assert "promoteSingleTilde(reply.content" not in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN
    assert not PANE.exists()


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.84 " in ROADMAP
    assert "## 184. v1.84" in SPEC
    assert "strikethrough flanking in completed assistant replies" in SPEC
    assert "test_ios_markdown_strike_flank.py" in CI
    assert "markdownStrikeFlank.test.ts" in PKG


if __name__ == "__main__":
    test_flanking_lives_in_the_desktop_pass()
    test_call_sites_stay_put()
    test_docs_and_openapi()
    print("ok")
    sys.exit(0)
