#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.30 save a reply as markdown.

A completed assistant reply offers a muted Save beside Copy. Tap or
click writes that reply's markdown source as reply.md. One file covers
the whole reply. Desktop downloads the file. iOS opens the system share
sheet and does not ask for photo-library permission. The label reads
Saved for 1.5s. Copy still copies that source. A streaming reply hides
Save. A user bubble has no Save. Code, table, and math Save stay on
those blocks. The control does not take composer focus. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ReplyMarkdownSave.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "replyMarkdownSave.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.30 save a reply as markdown"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save reply"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "reply.md"' in SWIFT
    assert "static func showsSave(fromUser: Bool, kindMessage: Bool, completed: Bool) -> Bool" in SWIFT
    assert "completed && !fromUser && kindMessage" in SWIFT
    assert "static func bodyText(_ markdown: String) -> String" in SWIFT
    assert "static func writeFile(markdown: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-reply" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'REPLY_MARKDOWN_SAVE_LABEL = "Save"' in DESKTOP
    assert 'REPLY_MARKDOWN_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'REPLY_MARKDOWN_SAVE_ARIA = "Save reply"' in DESKTOP
    assert 'REPLY_MARKDOWN_FILENAME = "reply.md"' in DESKTOP
    assert "export function replyMarkdownSaveBody" in DESKTOP
    assert "export function showReplyMarkdownSave" in DESKTOP
    assert "export function downloadReplyMarkdown" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "1_500_000_000" not in CHAT


def test_save_beside_copy() -> None:
    row = _slice(CHAT, 'Button("Copy")', "if showSpeak")
    assert "offersReplySave" in row
    assert "ReplyMarkdownSave.label(saved: replySaved)" in row
    assert "ReplyMarkdownSave.accessibilityLabel(saved: replySaved)" in row
    assert "saveReply()" in row
    assert "focusable(false)" in row
    assert "UIPasteboard.general.string = message.content" in row
    save = _slice(CHAT, "private func saveReply", "private func copyMessageText")
    assert "ReplyMarkdownSave.keepsReply()" in save
    assert "ReplyMarkdownSave.bodyText(message.content)" in save
    assert "ReplyMarkdownSave.writeFile(markdown: markdown, filename: ReplyMarkdownSave.filename)" in save
    assert "ReplyMarkdownSave.feedbackNanoseconds" in save
    assert "shareURL = file" in save
    assert "UIPasteboard" not in save
    assert "PHPhotoLibrary" not in save
    assert "UIActivityViewController" in CHAT
    menu = _slice(CHAT, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet")
    assert "if showReplySave" in menu
    assert "ReplyMarkdownSave.label(saved: replySaved)" in menu
    assert "onSaveReply()" in menu
    offer = _slice(CHAT, "private var offersReplySave", "private var offersReplyRating")
    assert "ReplyMarkdownSave.showsSave(" in offer
    assert "fromUser: message.isFromUser" in offer
    assert "!message.isHandoffRoot" in offer
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "ReplyMarkdownSave" not in user
    assert "ReplyMarkdownSave" not in MARKDOWN
    actions = _slice(APP, "function MessageActions(", "function QuoteMessageButton(")
    assert "showReplyMarkdownSave(" in actions
    assert "downloadReplyMarkdown(" in actions
    assert 'className="message-action message-save"' in actions
    assert "replyMarkdownSaveBody(content)" in actions
    user_copy = _slice(APP, "function UserMessageCopy(", "function AgentSkillRow")
    assert "replyMarkdownSave" not in user_copy
    assert "Save reply" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 230. v2.30" in SPEC
    assert "test_ios_reply_markdown_save.py" in CI
    assert "replyMarkdownSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios reply markdown save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
