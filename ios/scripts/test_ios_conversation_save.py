#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.42 save the open conversation as markdown.

An open chat with a loaded user or assistant message offers
Save as conversation.md in the header. Tap or click writes
conversation.md: speaker labels and the bubble clock, in order.
Desktop downloads the file. iOS opens the system share sheet from
the header control and does not ask for photo-library permission.
The label reads Saved for 1.5s. Transcript Save still writes
transcript.txt without speaker labels. Reply Save stays reply.md.
The control does not take composer focus. No new animation. No new
shortcut. No new HTTP. OpenAPI stays 0.18.0. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ConversationSave.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "conversationSave.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.42 save the open conversation as markdown"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    if stop < 0:
        raise AssertionError(f"missing {end}")
    return src[at:stop]


def test_labels_and_file() -> None:
    assert 'static let saveLabel = "Save as conversation.md"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save as conversation.md"' in SWIFT
    assert 'static let filename = "conversation.md"' in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "snorlax-conversation" in SWIFT
    assert "return nil" in SWIFT
    assert "BubbleTime.format" in SWIFT
    assert 'kind == nil || kind == .message' in SWIFT
    assert 'return fromUser ? "You" : "Assistant"' in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "No new HTTP" in SWIFT
    assert "func showsSave" in SWIFT
    assert "func markdown" in SWIFT
    assert "func bodyText" in SWIFT
    assert "func keepsChat" in SWIFT
    assert "func animation" in SWIFT
    assert 'CONVERSATION_FILENAME = "conversation.md"' in DESKTOP
    assert "function conversationMarkdown" in DESKTOP
    assert "function showConversationSave" in DESKTOP
    assert "Never animate" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_header_save_leaves_transcript_save() -> None:
    bar = _slice(CHAT, ".toolbar {", ".sheet(isPresented: $model.showProfile)")
    assert "if offersConversationSave" in bar
    assert "ConversationSave.label(saved: conversationSaved)" in bar
    assert "ConversationSave.accessibilityLabel(saved: conversationSaved)" in bar
    assert "saveOpenConversation()" in bar
    assert ".font(.system(size: 12, weight: .medium))" in bar
    save = _slice(CHAT, "private func saveOpenConversation", "private func chatNavKey")
    assert "ConversationSave.keepsChat()" in save
    assert "ConversationSave.markdown(turns: conversationTurns())" in save
    assert "ConversationSave.bodyText(text)" in save
    assert "ConversationSave.writeFile" in save
    assert "ConversationSave.filename" in save
    assert "conversationShareURL = file" in save
    assert "UIPasteboard" not in save
    assert "composerFocused" not in save
    assert "model.send(" not in save
    assert "TranscriptSave" not in save
    transcript = _slice(CHAT, "private func saveOpenTranscript", "private func saveOpenConversation")
    assert "TranscriptSave.filename" in transcript
    assert "conversation.md" not in transcript
    reply = _slice(CHAT, "private func saveReply", "private func copyMessageText")
    assert "ConversationSave" not in reply
    assert "Save as conversation.md" not in SHORTCUTS
    head = _slice(APP, '<header className="chat-head">', "</header>")
    assert "showConversationSave" in head
    assert "onSaveConversation" in head
    assert "conversation.md" not in _slice(
        APP, "copyTranscriptRef.current = () => {", "function onSaveTranscript"
    )


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 242. v2.42" in SPEC
    assert "python3 ios/scripts/test_ios_conversation_save.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_labels_and_file,
        test_header_save_leaves_transcript_save,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
    return 0


if __name__ == "__main__":
    sys.exit(main())
