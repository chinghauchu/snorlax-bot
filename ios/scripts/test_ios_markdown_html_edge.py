#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.87 cmark-gfm HTML block edges in completed assistant replies.

Desktop and iOS share cmark-gfm 0.29.0.gfm.13 start and end rules
for HTML block types 1-7. `source` is type 6. `search` is not.
A type 1 block ends on any of the four raw end tags. A type 6
tag needs a space, `>`, or `/>`. A margin type 7 tag ends a list
or a lazy quote. An indented type 7 tag stays in the item.
Streaming stays plain text. Copy keeps markdown source.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
QUOTE = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
LOOSE = (IOS / "MarkdownLooseList.swift").read_text(encoding="utf-8")
HARD = (IOS / "MarkdownHardBreak.swift").read_text(encoding="utf-8")
HTML = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
DESKTOP_LIST = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
DESKTOP_QUOTE = (ROOT / "desktop" / "src" / "markdownQuoteTask.ts").read_text(encoding="utf-8")
DESKTOP_LOOSE = (ROOT / "desktop" / "src" / "markdownLooseList.ts").read_text(encoding="utf-8")
DESKTOP_HARD = (ROOT / "desktop" / "src" / "markdownHardBreak.ts").read_text(encoding="utf-8")
DESKTOP_HTML = (ROOT / "desktop" / "src" / "markdownHtmlLiteral.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"


def test_scanners_match() -> None:
    for source in (LIST, DESKTOP_LIST):
        assert "source" in source
        assert '"search"' not in source
        assert "htmlBlockStarts" in source
        assert "htmlLineIsCompleteTag" in source
        assert "htmlSourceBlockLine" in source
        assert "htmlSearchBlockLine" in source
        assert "</script>" in source and "</pre>" in source
        assert "</style>" in source and "</textarea>" in source
        assert "v1.87" in source
        assert "/v1/" not in source
        assert "computerPane" not in source
    assert "UIPasteboard" not in LIST
    assert "MarkdownList.htmlBlockStarts" in QUOTE
    assert "htmlBlockStarts" in DESKTOP_QUOTE
    assert "MarkdownList.htmlBlockStarts" in LOOSE
    assert "htmlBlockStarts" in DESKTOP_LOOSE
    assert "MarkdownList.htmlBlockLineEnd" in HARD
    assert "htmlBlockEnd" in DESKTOP_HARD
    assert "htmlSourceBlockLine" in HTML
    assert "htmlSourceBlockLine" in DESKTOP_HTML
    assert "listSplitByCmarkHtml" in BODY
    assert "copyText(reply.content)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "v1.87 cmark-gfm HTML block edges" in ROADMAP
    assert "/ v1.87 " in ROADMAP
    assert "## 187. v1.87" in SPEC
    assert "test_ios_markdown_html_edge.py" in CI
    assert "markdownHtmlEdge.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_scanners_match()
    test_docs_and_openapi()
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
