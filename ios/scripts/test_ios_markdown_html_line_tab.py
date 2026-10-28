#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.07 cmark-gfm HTML tag line tabulation.

Checked cmark-gfm 0.29.0.gfm.13 on main first. v1.94 stashes U+000B
before the HTML scan, so `<a\\vhref="*bar*">` emphasized and
`<a href=x\\v*bar*>` hid the emphasis. cmark-gfm counts that character
as spacechar: the first stays raw, the second emphasizes, and a line
that is an HTML block only because of the line tab stays raw. The
v1.94 stash is that spacechar. A line tab inside quotes stays a tag
and still paints U+000B. `<br\\v>` is not a bare break. `*\\va\\v*`
stays emphasis.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
HTML = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
EMPHASIS = (IOS / "MarkdownEmphasis.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownHtmlLiteral.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.07 cmark-gfm HTML tag line tabulation in completed assistant replies"


def test_rules_match() -> None:
    for source in (HTML, DESKTOP):
        assert "v2.07" in source
        assert "lineTabOpensBlock" in source
        assert "isLineTabUnquotedTag" in source
        assert "U+000B" in source
        assert '<a\\vhref="*bar*">' in source
        assert '<a href=x\\v*bar*>' in source
        assert "/v1/" not in source
        assert "computerPane" not in source
    assert r"\u{000B}" in HTML
    assert "lineTabLength" in LIST
    assert "lineTabToken" in EMPHASIS
    assert 'token("<")' in HTML
    assert 'stashMarkdownText("<")' in DESKTOP
    assert "literalizeRawHtml(" in BODY
    assert "copyText(reply.content)" in APP
    assert "UIPasteboard" not in HTML
    assert "withAnimation" not in HTML
    assert not PANE.exists()


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.07 " in ROADMAP
    assert "## 207. v2.07" in SPEC
    assert "test_ios_markdown_html_line_tab.py" in CI
    assert "markdownHtmlLineTab.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )


def main() -> int:
    test_rules_match()
    test_docs_and_openapi()
    print("ios markdown html line tab ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
