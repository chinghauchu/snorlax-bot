#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.57 CommonMark bullet list markers in completed assistant replies.

A completed LEFT kind=message treats `-`, `*`, and `+` as different
lists, matching desktop react-markdown. The same bullet stays one
list. A nested marker of another character stays inside the item.
A blank line between different bullets splits bubbles. Streaming
stays the markdown string. Copy controls keep markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownList.swift").read_text(encoding="utf-8")
LOOSE = (IOS / "MarkdownLooseList.swift").read_text(encoding="utf-8")
TASKS = (IOS / "MarkdownQuoteTask.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownList.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.57 CommonMark bullet list markers in completed assistant replies"


def test_bullet_character_splits_the_list() -> None:
    assert "v1.57" in SWIFT
    assert "marker.bullet == first.bullet" in SWIFT
    assert "var bullet = \"\"" in SWIFT
    assert "bullet = token" in SWIFT
    assert "bullet: bullet" in SWIFT
    assert "if !completed { return [.markdown(src)] }" in SWIFT
    assert "markdown source" in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "marker.bullet === first.bullet" in DESKTOP
    assert "v1.57" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "marker.bullet" not in LOOSE
    assert "marker.bullet" not in TASKS
    assert "MarkdownLooseList.isLoose" in TASKS
    assert "MarkdownList.split(source, completed: completed)" in MARKDOWN
    assert "MarkdownList.listEnd(lines, start: index)" in MARKDOWN


def test_copy_stays_source() -> None:
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.57 " in ROADMAP
    assert "## 157. v1.57" in SPEC
    assert "CommonMark bullet list markers in completed assistant replies" in SPEC
    assert "test_ios_markdown_bullet_list.py" in CI
    assert "markdownBulletList.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_bullet_character_splits_the_list()
    test_copy_stays_source()
    test_docs_and_openapi()
    print("ios markdown bullet list ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
