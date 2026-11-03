#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.43 collapse long heading sections.

A completed assistant heading whose body is longer than 14 lines shows
the heading and a muted Show more. Tap expands that section and the
control becomes Show less. Lines under the heading hide, including
lines in later bubbles. Copy and Save still use the full section. An
active find hit inside the section keeps it open. The control does not
take focus. No new animation. No new shortcut. No new HTTP. OpenAPI
stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "SectionCollapse.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "sectionCollapse.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.43 collapse long heading sections"


def test_rules() -> None:
    assert "static let bodyLines = 14" in SWIFT
    assert 'static let showMore = "Show more"' in SWIFT
    assert 'static let showLess = "Show less"' in SWIFT
    assert 'static let showMoreAria = "Show more section"' in SWIFT
    assert 'static let showLessAria = "Show less section"' in SWIFT
    assert "static func plan(" in SWIFT
    assert "static func findKeepsOpen(" in SWIFT
    assert "static func lastPaintedBubble(" in SWIFT
    assert "return nil" in SWIFT
    assert "No new HTTP" in SWIFT
    assert "not saved" in SWIFT
    assert "/v1/" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert "SECTION_COLLAPSE_LINES = 14" in DESKTOP
    assert "Show more section" in DESKTOP
    assert "localStorage" not in DESKTOP


def test_chrome() -> None:
    assert "SectionCollapse.plan(" in CHAT
    assert "sectionPlan.hidden.contains(offset)" in CHAT
    assert "footnoteBubble" in CHAT
    assert 'separator: "#"' in CHAT
    assert "expandedSections = []" in CHAT
    assert "SectionCollapse.pieceHidden(" in MARKDOWN
    assert "SectionCollapse.label(expanded: expanded)" in MARKDOWN
    assert "SectionCollapse.visibleText(" in MARKDOWN
    assert "focusable(false)" in MARKDOWN
    assert "SectionCopy.clipboardText(markdown)" in MARKDOWN
    assert "SectionSave.bodyText(markdown)" in MARKDOWN
    assert "Show more section" not in SHORTCUTS
    assert "UserDefaults" not in CHAT


def test_docs() -> None:
    for text in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in text
        assert "version: 0.19" not in text
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 243. v2.43" in SPEC
    assert "test_ios_section_collapse.py" in CI
    assert not PANE.exists()


if __name__ == "__main__":
    test_rules()
    test_chrome()
    test_docs()
    print("ok")
