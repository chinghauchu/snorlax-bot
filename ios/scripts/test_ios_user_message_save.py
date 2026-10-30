#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.31 save a user message.

A settled user message offers a muted Save beside Copy. Tap or click
writes that message's text as message.txt. Desktop downloads the file.
iOS opens the system share sheet from the long-press menu and does not
ask for photo-library permission. The label reads Saved for 1.5s. Copy
still copies that text. An in-flight optimistic send hides Save. An
assistant reply keeps reply.md. The control does not take composer
focus. No new animation. No new shortcut. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "UserMessageSave.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "userMessageSave.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.31 save a user message"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save message"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "message.txt"' in SWIFT
    assert "static func showsSave(fromUser: Bool, kindMessage: Bool, pending: Bool) -> Bool" in SWIFT
    assert "fromUser && kindMessage && !pending" in SWIFT
    assert "static func bodyText(_ text: String) -> String" in SWIFT
    assert "static func writeFile(text: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-user-message" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'USER_MESSAGE_SAVE_LABEL = "Save"' in DESKTOP
    assert 'USER_MESSAGE_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'USER_MESSAGE_SAVE_ARIA = "Save message"' in DESKTOP
    assert 'USER_MESSAGE_FILENAME = "message.txt"' in DESKTOP
    assert "export function userMessageSaveBody" in DESKTOP
    assert "export function showUserMessageSave" in DESKTOP
    assert "export function downloadUserMessage" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "1_500_000_000" not in CHAT


def test_save_beside_copy() -> None:
    menu = _slice(CHAT, "private struct BubbleTimestampMenu", "private struct AttachmentShareSheet")
    assert "if showUserSave" in menu
    assert "UserMessageSave.label(saved: userSaved)" in menu
    assert "UserMessageSave.accessibilityLabel(saved: userSaved)" in menu
    assert "onSaveUser()" in menu
    assert "userSaveButton" in menu
    save = _slice(CHAT, "private func saveUserMessage", "private struct BubbleTimestampMenu")
    assert "UserMessageSave.keepsMessage()" in save
    assert "UserMessageSave.bodyText(message.content)" in save
    assert "UserMessageSave.writeFile(text: text, filename: UserMessageSave.filename)" in save
    assert "UserMessageSave.feedbackNanoseconds" in save
    assert "shareURL = file" in save
    assert "UIPasteboard" not in save
    assert "PHPhotoLibrary" not in save
    assert "UIActivityViewController" in CHAT
    offer = _slice(CHAT, "private var offersUserSave", "private var offersReplySave")
    assert "UserMessageSave.showsSave(" in offer
    assert "fromUser: message.isFromUser" in offer
    assert "OptimisticSend.isOptimistic(message.id)" in offer
    reply = _slice(CHAT, "private func saveReply", "private func copyMessageText")
    assert "UserMessageSave" not in reply
    assert "message.txt" not in reply
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "UserMessageSave" not in user
    actions = _slice(APP, "function MessageActions(", "function QuoteMessageButton(")
    assert "userMessageSave" not in actions
    assert "downloadUserMessage" not in actions
    user_copy = _slice(APP, "function UserMessageCopy(", "function AgentSkillRow")
    assert "showUserMessageSave(" in user_copy
    assert "downloadUserMessage(" in user_copy
    assert 'className="message-action user-save"' in user_copy
    assert "userMessageSaveBody(content)" in user_copy
    assert "fromUser: true" in user_copy
    assert "Save message" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 231. v2.31" in SPEC
    assert "test_ios_user_message_save.py" in CI
    assert "userMessageSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios user message save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
