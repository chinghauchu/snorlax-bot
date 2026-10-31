#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.32 save the open chat transcript.

An open chat with loaded message text offers a muted Save in the
header. Tap or click writes that loaded transcript as transcript.txt,
the same plain text the copy chord copies. Desktop downloads the file.
iOS opens the system share sheet from the header control and does not
ask for photo-library permission. The label reads Saved for 1.5s. The
copy chord still copies and does not write the file. Reply Save stays
reply.md. User-message Save stays message.txt. The control does not
take composer focus. No new animation. No new shortcut. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TranscriptSave.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "transcriptSave.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.32 save the open chat transcript"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    if stop < 0:
        raise AssertionError(f"missing {end}")
    return src[at:stop]


def test_labels_and_file() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save transcript"' in SWIFT
    assert 'static let filename = "transcript.txt"' in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "snorlax-transcript" in SWIFT
    assert "return nil" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "No new HTTP" in SWIFT
    assert "func showsSave" in SWIFT
    assert "func bodyText" in SWIFT
    assert "func keepsChat" in SWIFT
    assert "func animation" in SWIFT
    assert 'TRANSCRIPT_FILENAME = "transcript.txt"' in DESKTOP
    assert "function showTranscriptSave" in DESKTOP
    assert "function transcriptSaveBody" in DESKTOP
    assert "Never animate" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_header_save_leaves_the_copy_chord() -> None:
    bar = _slice(CHAT, ".toolbar {", ".sheet(isPresented: $model.showProfile)")
    assert "if offersTranscriptSave" in bar
    assert "TranscriptSave.label(saved: transcriptSaved)" in bar
    assert "TranscriptSave.accessibilityLabel(saved: transcriptSaved)" in bar
    assert "saveOpenTranscript()" in bar
    assert ".font(.system(size: 12, weight: .medium))" in bar
    save = _slice(CHAT, "private func saveOpenTranscript", "private func chatNavKey")
    assert "TranscriptSave.keepsChat()" in save
    assert "CopyTranscript.plainText(messages: visible)" in save
    assert "TranscriptSave.bodyText(text)" in save
    assert "TranscriptSave.writeFile" in save
    assert "TranscriptSave.filename" in save
    assert "transcriptShareURL = file" in save
    assert "UIPasteboard" not in save
    assert "composerFocused" not in save
    assert "model.send(" not in save
    copy = _slice(CHAT, "private func copyOpenTranscript", "private func noteLinkCopied")
    assert "UIPasteboard.general.string = text" in copy
    assert "TranscriptSave" not in copy
    assert "transcript.txt" not in copy
    reply = _slice(CHAT, "private func saveReply", "private func copyMessageText")
    assert "TranscriptSave" not in reply
    user = _slice(CHAT, "private func saveUserMessage", "private struct BubbleTimestampMenu")
    assert "TranscriptSave" not in user
    assert "Save transcript" not in SHORTCUTS
    head = _slice(APP, '<header className="chat-head">', "</header>")
    assert "showTranscriptSave" in head
    assert "onSaveTranscript" in head
    assert "transcript.txt" not in _slice(
        APP, "copyTranscriptRef.current = () => {", "function onSaveTranscript"
    )


def test_openapi_roadmap() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 232. v2.32" in SPEC
    assert "python3 ios/scripts/test_ios_transcript_save.py" in CI
    assert not PANE.exists()


def main() -> int:
    tests = [
        test_labels_and_file,
        test_header_save_leaves_the_copy_chord,
        test_openapi_roadmap,
    ]
    for test in tests:
        test()
    return 0


if __name__ == "__main__":
    sys.exit(main())
