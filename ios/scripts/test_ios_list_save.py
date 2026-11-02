#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.37 save a list.

A completed assistant bulleted or numbered list offers a muted Save
beside Copy. Tap or click writes the lines that list was split from
as list.md, including the bullet or number markers. The display text,
with markers removed, is not the file. Desktop downloads the file.
iOS opens the system share sheet and does not ask for photo-library
permission. The label reads Saved for 1.5s. Copy still copies those
lines. A streaming reply hides Save. A task list does not gain Save.
A nested list has its own Save. The control does not take composer
focus. No new animation. No new shortcut. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ListSave.swift").read_text(encoding="utf-8")
COPY = (IOS / "ListCopy.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "listSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
QUOTE = (ROOT / "desktop" / "src" / "quoteSave.ts").read_text(encoding="utf-8")
TABLE = (ROOT / "desktop" / "src" / "tableCsvSave.ts").read_text(encoding="utf-8")
REPLY = (ROOT / "desktop" / "src" / "replyMarkdownSave.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.37 save a list"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save list"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "list.md"' in SWIFT
    assert "static func showsSave(completed: Bool, source: String) -> Bool" in SWIFT
    assert "static func bodyText(_ source: String) -> String" in SWIFT
    assert "static func writeFile(markdown: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-list" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "completed && !source.isEmpty" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'static let copyAria = "Copy list"' in COPY
    assert "static func clipboardText(_ source: String) -> String" in COPY
    assert 'LIST_SAVE_LABEL = "Save"' in DESKTOP
    assert 'LIST_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'LIST_SAVE_ARIA = "Save list"' in DESKTOP
    assert 'LIST_SAVE_FILENAME = "list.md"' in DESKTOP
    assert "export function listSaveBody" in DESKTOP
    assert "export function showListSave" in DESKTOP
    assert "export function downloadListMarkdown" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert 'QUOTE_SAVE_FILENAME = "quote.md"' in QUOTE
    assert 'TABLE_CSV_FILENAME = "table.csv"' in TABLE
    assert 'REPLY_MARKDOWN_FILENAME = "reply.md"' in REPLY


def test_save_beside_copy() -> None:
    listed = _slice(MARKDOWN, "struct MarkdownListBlock", "struct MarkdownListItemRow")
    assert "ListSave.showsSave(completed: completed, source: group.source)" in listed
    assert "ListSave.bodyText(group.source)" in listed
    assert "ListSave.label(saved: saved)" in listed
    assert "ListSave.accessibilityLabel(saved: saved)" in listed
    assert "ListSave.feedbackNanoseconds" in listed
    assert "ListSave.writeFile(markdown: text, filename: ListSave.filename)" in listed
    assert "ListSave.keepsList()" in listed
    assert "ListCopy.clipboardText(group.source)" in listed
    assert "focusable(false)" in listed
    assert "UIActivityViewController" in listed
    assert "saved = false" in listed
    assert "PHPhotoLibrary" not in listed
    assert "withAnimation" not in listed
    assert ".focus(" not in listed
    save = _slice(listed, "private func saveList", "private struct ListMarkdownShareSheet")
    assert "UIPasteboard" not in save
    tasks = _slice(MARKDOWN, "struct MarkdownTaskList", "struct MarkdownTaskRow")
    assert "ListSave" not in tasks
    assert "ListCopy" not in tasks
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "ListSave" not in user
    button = _slice(BODY, "function ListActions(", "function CollapsibleList(")
    assert "showListSave(" in button
    assert "listSaveBody(source)" in button
    assert "downloadListMarkdown(" in button
    assert 'className={saved ? "md-list-save is-saved" : "md-list-save"}' in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "listSaveKeepsList()" in button
    assert "listClipboardText(source)" in button
    assert "Save list" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 237. v2.37" in SPEC
    assert "test_ios_list_save.py" in CI
    assert "listSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios list save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
