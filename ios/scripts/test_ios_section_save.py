#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.38 save a heading section.

A completed assistant # / ## / ### heading offers a muted Save beside
Copy. Tap or click writes the heading line plus the lines under it,
until the next heading of the same or higher level, as section.md.
The display text is not the file. Desktop downloads the file. iOS
opens the system share sheet and does not ask for photo-library
permission. The label reads Saved for 1.5s. Copy still copies those
lines. A streaming reply hides Save. A heading inside a fence, list,
or quote does not gain this control. Blank-line bubbles stay split.
The control does not take composer focus. No new animation. No new
shortcut. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "SectionSave.swift").read_text(encoding="utf-8")
COPY = (IOS / "SectionCopy.swift").read_text(encoding="utf-8")
HEADING = (IOS / "HeadingSection.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "sectionSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
LIST = (ROOT / "desktop" / "src" / "listSave.ts").read_text(encoding="utf-8")
QUOTE = (ROOT / "desktop" / "src" / "quoteSave.ts").read_text(encoding="utf-8")
REPLY = (ROOT / "desktop" / "src" / "replyMarkdownSave.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.38 save a heading section"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save section"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "section.md"' in SWIFT
    assert "static func showsSave(completed: Bool, source: String) -> Bool" in SWIFT
    assert "static func bodyText(_ source: String) -> String" in SWIFT
    assert "static func writeFile(markdown: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-section" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "completed && !source.isEmpty" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'static let copyAria = "Copy section"' in COPY
    assert "static func clipboardText(_ source: String) -> String" in COPY
    assert "static func split" in HEADING
    assert "static func assign" in HEADING
    assert "level <= 3" in HEADING
    assert 'SECTION_SAVE_LABEL = "Save"' in DESKTOP
    assert 'SECTION_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'SECTION_SAVE_ARIA = "Save section"' in DESKTOP
    assert 'SECTION_SAVE_FILENAME = "section.md"' in DESKTOP
    assert "export function sectionSaveBody" in DESKTOP
    assert "export function showSectionSave" in DESKTOP
    assert "export function downloadSectionMarkdown" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert 'LIST_SAVE_FILENAME = "list.md"' in LIST
    assert 'QUOTE_SAVE_FILENAME = "quote.md"' in QUOTE
    assert 'REPLY_MARKDOWN_FILENAME = "reply.md"' in REPLY


def test_save_beside_copy() -> None:
    block = _slice(MARKDOWN, "struct HeadingSectionBlock", "struct MarkdownTablePieces")
    assert "SectionSave.showsSave(completed: completed, source: markdown)" in block
    assert "SectionSave.bodyText(markdown)" in block
    assert "SectionSave.label(saved: saved)" in block
    assert "SectionSave.accessibilityLabel(saved: saved)" in block
    assert "SectionSave.feedbackNanoseconds" in block
    assert "SectionSave.writeFile(markdown: text, filename: SectionSave.filename)" in block
    assert "SectionSave.keepsSection()" in block
    assert "SectionCopy.clipboardText(markdown)" in block
    assert "focusable(false)" in block
    assert "UIActivityViewController" in block
    assert "saved = false" in block
    assert "PHPhotoLibrary" not in block
    assert "withAnimation" not in block
    assert ".focus(" not in block
    save = _slice(block, "private func saveSection", "private struct SectionMarkdownShareSheet")
    assert "UIPasteboard" not in save
    assert "HeadingSection.assign" in CHAT
    assert "headingSections:" in CHAT
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "SectionSave" not in user
    button = _slice(BODY, "function SectionActions(", "function ListActions(")
    assert "showSectionSave(" in button
    assert "sectionSaveBody(source)" in button
    assert "downloadSectionMarkdown(" in button
    assert 'className={saved ? "md-section-save is-saved" : "md-section-save"}' in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "sectionSaveKeepsSection()" in button
    assert "sectionClipboardText(source)" in button
    assert "Save section" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 238. v2.38" in SPEC
    assert "test_ios_section_save.py" in CI
    assert "sectionSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios section save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
