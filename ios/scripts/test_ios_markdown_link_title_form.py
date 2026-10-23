#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.78 CommonMark link title forms in completed assistant replies.

Checked v1.46 and v1.77 on main before this cut. Basic one-line
"title", 'title', and (title) tooltips already shipped. v1.77 left
link-title quote forms out of scope. A title that spans a line
break, a reference title on the next line, an escaped quote, and an
entity reference have to match cmark-gfm, and an invalid title stays
literal text. Desktop and iOS share that scan.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownLinkTitleForm.swift").read_text(encoding="utf-8")
LINK = (IOS / "MarkdownLinkTitle.swift").read_text(encoding="utf-8")
REF = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
IMAGE = (IOS / "MarkdownImage.swift").read_text(encoding="utf-8")
ALT = (IOS / "MarkdownImageAlt.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownLinkTitleForm.ts").read_text(encoding="utf-8")
LINK_TS = (ROOT / "desktop" / "src" / "markdownLinkTitle.ts").read_text(encoding="utf-8")
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

PHRASE = "v1.78 CommonMark link title forms in completed assistant replies"


def test_title_scan_matches_cmark() -> None:
    assert "v1.78" in SWIFT
    assert "v1.78" in DESKTOP
    assert "static func read(" in SWIFT
    assert "function readCommonMarkTitle" in DESKTOP
    assert "hasBlankLine" in SWIFT and "hasBlankLine" in DESKTOP
    assert 'open == "(", ch == "("' in SWIFT
    assert 'open === "(" && ch === "("' in DESKTOP
    assert "&#38;" in SWIFT and "&#38;" in DESKTOP
    assert "func prepare" in LINK
    assert "function prepareLinkTitleForms" in LINK_TS
    assert '"\\\\["' in LINK
    assert '"\\\\["' in LINK_TS
    assert "titleAt != cursor" in LINK
    assert "titleAt !== k" in LINK_TS
    assert "MarkdownLinkTitleForm.read" in REF
    assert "MarkdownLinkTitleForm.read" in IMAGE
    assert "MarkdownLinkTitleForm.read" in ALT
    assert "func emitLink" in REF
    assert "if !completed" in LINK
    assert "completed: false" in LINK_TS
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_render_path_copy_and_openapi() -> None:
    assert "MarkdownLinkTitle.prepare(" in MARKDOWN
    assert "prepareSpacedDestinations(self.source, completed: completed)" in MARKDOWN
    assert "prepareLinkTitleForms(" in BODY
    assert "copyText(reply.content)" in APP
    assert "MarkdownLinkTitle" not in (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
    assert PHRASE in ROADMAP
    assert "v1.78" in SPEC
    assert "test_ios_markdown_link_title_form.py" in CI
    assert "markdownLinkTitleForm.test.ts" in PKG
    for openapi in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in openapi
        assert "version: 0.19" not in openapi
    print("ios markdown link title form ok")


if __name__ == "__main__":
    test_title_scan_matches_cmark()
    test_render_path_copy_and_openapi()
