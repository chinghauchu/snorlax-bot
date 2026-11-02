#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.40 copy and save message links.

A completed assistant reply that contains links offers muted Copy links
and Save as links.md. Tap or click writes each link's label and URL as
links.md. Desktop downloads the file. iOS opens the system share sheet
and does not ask for photo-library permission. Copy links writes that
same text. The labels read Copied or Saved for 1.5s. Desktop reveals
the controls on hover or focus. iOS shows them in the action row. A
streaming reply hides them and stays plain text. A user bubble has
neither control. Per-link Copy link still copies one URL. Reply Save
still writes reply.md. The control does not take composer focus. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MessageLinks.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
TITLES = (IOS / "MarkdownLinkTitle.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "messageLinks.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.40 copy and save message links"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let copyLabel = "Copy links"' in SWIFT
    assert 'static let copiedLabel = "Copied"' in SWIFT
    assert 'static let saveLabel = "Save as links.md"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let filename = "links.md"' in SWIFT
    assert "static func shows(" in SWIFT
    assert "completed && !fromUser && kindMessage && !links(in: markdown).isEmpty" in SWIFT
    assert "static func bodyText(_ markdown: String) -> String" in SWIFT
    assert "static func clipboardText(_ markdown: String) -> String" in SWIFT
    assert "static func writeFile(markdown: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-links" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'MESSAGE_LINKS_COPY_LABEL = "Copy links"' in DESKTOP
    assert 'MESSAGE_LINKS_SAVE_LABEL = "Save as links.md"' in DESKTOP
    assert 'MESSAGE_LINKS_FILENAME = "links.md"' in DESKTOP
    assert "export function messageLinksBody" in DESKTOP
    assert "export function showMessageLinks" in DESKTOP
    assert "export function downloadMessageLinks" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "listedSpans" in TITLES
    assert "protectedSpans" in TITLES
    assert "1_500_000_000" not in CHAT


def test_row_and_share() -> None:
    row = _slice(CHAT, 'Button("Copy")', "if showSpeak")
    assert "offersMessageLinks" in row
    assert "MessageLinks.label(copied: linksCopied)" in row
    assert "MessageLinks.fileLabel(saved: linksSaved)" in row
    assert "copyLinks()" in row
    assert "saveLinks()" in row
    assert "focusable(false)" in row
    assert "UIPasteboard.general.string = message.content" in row
    copy_call = _slice(CHAT, "private func copyLinks", "private func saveLinks")
    assert "MessageLinks.clipboardText(message.content)" in copy_call
    assert "UIPasteboard.general.string = text" in copy_call
    assert "MessageLinks.feedbackNanoseconds" in copy_call
    assert "writeFile" not in copy_call
    save_call = _slice(CHAT, "private func saveLinks", "private func saveReply")
    assert "MessageLinks.keepsReply()" in save_call
    assert "MessageLinks.bodyText(message.content)" in save_call
    assert "MessageLinks.writeFile" in save_call
    assert "MessageLinks.filename" in save_call
    assert "shareURL = file" in save_call
    assert "UIPasteboard" not in save_call
    assert "PHPhotoLibrary" not in save_call
    assert "UIActivityViewController" in CHAT
    menu = _slice(CHAT, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet")
    assert "if showMessageLinks" in menu
    assert "onCopyLinks()" in menu
    assert "onSaveLinks()" in menu
    offer = _slice(CHAT, "private var offersMessageLinks", "private var offersReplySave")
    assert "MessageLinks.shows(" in offer
    assert "!message.isHandoffRoot" in offer
    assert "MessageLinks" not in MARKDOWN
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "MessageLinks" not in user
    assert "copyLinks" not in user
    actions = _slice(APP, "function MessageActions(", "function QuoteMessageButton(")
    assert "showMessageLinks" in actions
    assert "downloadMessageLinks(content, MESSAGE_LINKS_FILENAME)" in actions
    assert "copyText(messageLinksBody(content))" in actions
    assert "Copy links" not in SHORTCUTS
    assert "Save as links.md" not in SHORTCUTS


def test_docs() -> None:
    for text in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in text
        assert "version: 0.19" not in text
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 240. v2.40" in SPEC
    assert "python3 ios/scripts/test_ios_message_links.py" in CI
    assert not PANE.exists()
    assert "computerPane.ts" not in DESKTOP


def main() -> None:
    test_label_and_body()
    test_row_and_share()
    test_docs()
    print("ok")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        sys.exit(1)
