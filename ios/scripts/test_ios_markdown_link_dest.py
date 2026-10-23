#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.79 CommonMark link and image destination entities.

Checked v1.78 on main before this cut. Link titles already match
cmark-gfm. Destinations did not: the escape pass decoded a small
named set before the parser, so the href percent-encoding disagreed
with cmark-gfm. A completed assistant reply now trims, decodes the
HTML5 named set and in-range numeric references, unescapes ASCII
punctuation, and percent-encodes the destination. Over-long numeric
references stay the source characters. Desktop and iOS share that
pass.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MarkdownLinkDest.swift").read_text(encoding="utf-8")
ENTITIES = (IOS / "MarkdownCmarkEntities.swift").read_text(encoding="utf-8")
ESCAPE = (IOS / "MarkdownEscape.swift").read_text(encoding="utf-8")
REF = (IOS / "MarkdownReferenceLink.swift").read_text(encoding="utf-8")
IMAGE = (IOS / "MarkdownImage.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownLinkDest.ts").read_text(encoding="utf-8")
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

PHRASE = (
    "v1.79 CommonMark link and image destination entities "
    "in completed assistant replies"
)


def test_destination_scan_matches_cmark() -> None:
    assert "v1.79" in SWIFT
    assert "v1.79" in DESKTOP
    assert "static func prepare" in SWIFT
    assert "static func href" in SWIFT
    assert "function prepareLinkDestinations" in DESKTOP
    assert "function cmarkLinkHref" in DESKTOP
    assert "&#38;" in SWIFT and "&#38;" in DESKTOP
    assert "&#x27;" in SWIFT and "&#x27;" in DESKTOP
    assert "digits > maxDigits" in SWIFT
    assert "digits > max" in DESKTOP
    assert "ouml" in ENTITIES
    assert "CounterClockwiseContourIntegral" in ENTITIES
    assert "MarkdownCmarkEntities.named" in SWIFT
    assert "CMARK_NAMED_ENTITIES" in DESKTOP
    assert "MarkdownLinkDest.spans" in ESCAPE
    assert "linkDestinationSpans" in (ROOT / "desktop" / "src" / "markdownEscape.ts").read_text(
        encoding="utf-8"
    )
    assert "v1.79" in REF
    assert "v1.79" in IMAGE
    assert "if !completed" in SWIFT
    assert "completed = true" in DESKTOP or "completed = true" in DESKTOP
    assert "/v1/" not in SWIFT
    assert "withAnimation" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "computerPane" not in SWIFT
    assert not PANE.exists()


def test_render_path_copy_and_openapi() -> None:
    assert "MarkdownLinkDest.prepare(self.source, completed: completed)" in MARKDOWN
    assert "prepareLinkDestinations(sourceText, completed)" in BODY
    assert "prepareLinkDestinations" not in APP
    assert "copyText(reply.content)" in APP
    assert "MarkdownLinkDest" not in (IOS / "MidStreamPlaintext.swift").read_text(encoding="utf-8")
    assert PHRASE in ROADMAP
    assert "/ v1.79 " in ROADMAP
    assert "## 179. v1.79" in SPEC
    assert "destination entities in completed assistant replies" in SPEC
    assert "test_ios_markdown_link_dest.py" in CI
    assert "markdownLinkDest.test.ts" in PKG
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI


if __name__ == "__main__":
    test_destination_scan_matches_cmark()
    test_render_path_copy_and_openapi()
    print("ok")
