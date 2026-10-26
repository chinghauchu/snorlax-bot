#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.88 cmark-gfm list item edges in completed assistant replies.

Desktop and iOS share cmark-gfm 0.29.0.gfm.13 list-item rules
that were still open after v1.87. An ordered marker interrupts
a paragraph when its integer start is 1, so `01.`, `001.`, and
`000000001.` do, including a nested marker. A line indented
four or more columns that is short of the item content column
stays a lazy continuation, and a block start on that line is
escaped so the next parse keeps the text. Streaming stays plain
text. Copy keeps markdown source. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
LIST = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
LOOSE = (IOS / "MarkdownLooseList.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP_LIST = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
DESKTOP_LOOSE = (ROOT / "desktop" / "src" / "markdownLooseList.ts").read_text(
    encoding="utf-8"
)
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"


def test_rules_match() -> None:
    for source in (LIST, DESKTOP_LIST):
        assert "v1.88" in source
        assert "lazyItemLine" in source
        assert "opensBlockAtMargin" in source
        assert "htmlBlockInterrupts" in source
        assert "if !completed" in source or "if (!completed)" in source
        assert "/v1/" not in source
        assert "computerPane" not in source
    assert "marker.ordered && marker.number != 1" in LIST
    assert "marker.ordered && marker.number !== 1" in DESKTOP_LIST
    assert "listNeedsCmarkOrderedOne" in DESKTOP_LIST
    assert "listNeedsCmarkOrderedOne(sourceText)" in BODY
    assert "MarkdownList.lazyItemLine(line)" in LOOSE
    assert "lazyItemLine(line)" in DESKTOP_LOOSE
    assert "leadingColumns(line).columns > 3" in LOOSE
    assert "leadingColumns(line).columns > 3" in DESKTOP_LOOSE
    assert "UIPasteboard" not in LIST
    assert "MarkdownList.split(source, completed: completed)" in MARKDOWN
    assert "copyText(reply.content)" in APP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert "v1.88 cmark-gfm list item edges" in ROADMAP
    assert "/ v1.88 " in ROADMAP
    assert "## 188. v1.88" in SPEC
    assert "test_ios_markdown_list_edge.py" in CI
    assert "markdownListEdge.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rules_match()
    test_docs_and_openapi()
    print("ios markdown list edge ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
