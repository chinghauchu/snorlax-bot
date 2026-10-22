#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.64 GFM table cells stay inline in completed assistant replies.

A completed LEFT kind=message table cell keeps bold, italic, code,
and links. A heading, list, quote, thematic break, or fence at the
start of the cell stays the characters on desktop and iOS. Escaped
pipes and pipes inside inline code already stayed one cell. Column
alignment already shipped. Intraword underscores already stay literal.
Streaming stays plain text. Copy keeps markdown source.
No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownTable.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownTable.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.64 GFM table cells stay inline in completed assistant replies"


def fence_allows(marker: str, info: str) -> bool:
    if marker.startswith("`") and "`" in info:
        return False
    return True


def protect_line(line: str) -> str:
    indent = 0
    while indent < len(line) and indent < 3 and line[indent] == " ":
        indent += 1
    if indent < len(line) and line[indent] == " ":
        return line
    rest = line[indent:]
    if not rest:
        return line
    fence = re.match(r"^(`{3,}|~{3,})(.*)$", rest)
    if fence and fence_allows(fence.group(1), fence.group(2)):
        count = len(fence.group(1))
        return line[:indent] + "".join("\\" + line[indent + n] for n in range(count)) + line[indent + count :]
    if _thematic(rest):
        out = line[:indent]
        for ch in rest:
            out += "\\" + ch if ch in "-*_" else ch
        return out
    if re.match(r"^#{1,6}(?:[ \t]|$)", rest):
        return line[:indent] + "\\" + line[indent:]
    if rest.startswith(">"):
        return line[:indent] + "\\" + line[indent:]
    if re.match(r"^[-*+](?:[ \t]|$)", rest):
        return line[:indent] + "\\" + line[indent:]
    ordered = re.match(r"^(\d{1,9})([.)])(?:[ \t]|$)", rest)
    if ordered:
        at = indent + len(ordered.group(1))
        return line[:at] + "\\" + line[at:]
    return line


def _thematic(rest: str) -> bool:
    mark = rest[0]
    if mark not in "-*_":
        return False
    count = 0
    for ch in rest:
        if ch == mark:
            count += 1
        elif ch in " \t":
            continue
        else:
            return False
    return count >= 3


def protect(text: str, completed: bool = True) -> str:
    if not completed or not text:
        return text
    src = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = src.split("\n")
    out = [protect_line(line) for line in lines]
    if out == lines:
        return src if "\r" in text else text
    return "\n".join(out)


def test_block_starts_stay_characters() -> None:
    assert protect("**bold**") == "**bold**"
    assert protect("*italic*") == "*italic*"
    assert protect("`code`") == "`code`"
    assert protect("***both***") == "***both***"
    assert protect("[docs](https://example.com)") == "[docs](https://example.com)"
    assert protect("snake_case_name") == "snake_case_name"
    assert protect("foo*bar*baz") == "foo*bar*baz"
    assert protect("- item") == "\\- item"
    assert protect("* item") == "\\* item"
    assert protect("+ item") == "\\+ item"
    assert protect("# Title") == "\\# Title"
    assert protect("#foo") == "#foo"
    assert protect("> quoted") == "\\> quoted"
    assert protect("1. **a**") == "1\\. **a**"
    assert protect("12) next") == "12\\) next"
    assert protect("1234567890. no") == "1234567890. no"
    assert protect("***") == "\\*\\*\\*"
    assert protect("* * *") == "\\* \\* \\*"
    assert protect("___") == "\\_\\_\\_"
    assert protect("```") == "\\`\\`\\`"
    assert protect("```js") == "\\`\\`\\`js"
    assert protect("```code```") == "```code```"
    assert protect("~~gone~~") == "~~gone~~"
    assert protect("~gone~") == "~gone~"
    assert protect("- item", False) == "- item"
    assert protect("# Title", False) == "# Title"
    assert protect("") == ""


def test_wiring() -> None:
    assert "v1.64" in SWIFT
    assert "static func protectCellBlocks" in SWIFT
    assert "static func cellInlineAnimation" in SWIFT
    assert "return nil" in SWIFT
    assert "MarkdownCodeSpan.fenceInfoAllowsOpen" in SWIFT
    assert "/v1/" not in SWIFT
    assert "v1.64" in DESKTOP
    assert "export function protectTableCellBlocks" in DESKTOP
    assert "export function tableCellInlineAnimates" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "protectTableCellBlocks(literalizeSetextLines(text), completed)" in BODY
    assert "literalizeSetextLines(text)" in BODY
    assert "MarkdownTable.protectCellBlocks" in MARKDOWN
    assert "MarkdownSetext.literalize(text)" in MARKDOWN
    assert "cellInlineAnimation(reduceMotion: reduceMotion)" in MARKDOWN
    assert "copyText(reply.content)" in APP
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in MARKDOWN


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.64 " in ROADMAP
    assert "## 164. v1.64" in SPEC
    assert "GFM table cells stay inline in completed assistant replies" in SPEC
    assert "test_ios_markdown_table_cell.py" in CI
    assert "markdownTableCell.test.ts" in PKG
    assert not PANE.exists()


def main() -> int:
    test_block_starts_stay_characters()
    test_wiring()
    test_docs_and_openapi()
    print("ios markdown table cell ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
