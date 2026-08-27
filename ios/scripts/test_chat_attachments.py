#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.25 iOS composer + user-right attachment chrome lock.

Paperclip opens Photos or Files. Pending chips wrap above the bar with
6pt gap. Image thumb 56×56 + 20px ×. File chip 36px, 13pt name, 12pt
muted size. iOS chips 44pt hit. Send on if text or any chip. Over 10MB
and video share the 12pt danger line. User-right images 220×160; files
are 36px name chips that open the Bearer URL. v0.26: LEFT kind=message
reuses that same chrome. No /v1/chats/. Never reintroduce
computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
MODELS = (IOS / "Models.swift").read_text(encoding="utf-8")


def test_paperclip_photos_or_files() -> None:
    assert 'Image(systemName: "paperclip")' in CHAT
    assert 'Button("Photos")' in CHAT
    assert 'Button("Files")' in CHAT
    assert ".photosPicker(" in CHAT
    assert ".fileImporter(" in CHAT
    assert "confirmationDialog" in CHAT
    assert "Attach image" not in CHAT


def test_pending_chips_wrap_and_sizes() -> None:
    assert "FlowWrap(spacing: 6)" in CHAT
    assert ".frame(width: 56, height: 56)" in CHAT
    assert ".frame(width: 20, height: 20)" in CHAT
    assert ".frame(height: 36)" in CHAT
    assert ".font(.system(size: 13))" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert ".frame(minHeight: 44)" in CHAT or ".frame(width: 44, height: 44)" in CHAT
    assert 'ChatAttachment.errMax' in MODELS or '"Max 10MB."' in MODELS
    assert "Video isn’t supported yet." in MODELS
    assert "attachError" in CHAT
    assert ".font(.system(size: 12))" in CHAT


def test_send_text_or_chip() -> None:
    assert "pendingAttachments.isEmpty" in CHAT
    assert "attachmentIds" in MODEL
    assert "uploadAttachment" in CLIENT
    assert "v1/agents/" in CLIENT and "attachments" in CLIENT
    assert "addPendingFile" in MODEL
    assert "canSend" in CHAT


def test_user_right_image_and_file_chip() -> None:
    assert "maxWidth: 220" in CHAT
    assert "maxHeight: 160" in CHAT
    assert "userRightAttachments" in CHAT
    assert "openAttachment" in CHAT
    assert "struct Attachment" in TYPES
    assert "var attachmentIds" in TYPES
    assert "var attachments: [Attachment]" in TYPES


def test_left_streak_reuses_user_right_chrome() -> None:
    assert CHAT.count("userAttachments") >= 2
    assert "maxWidth: 220" in CHAT
    assert "maxHeight: 160" in CHAT
    assert ".frame(height: 36)" in CHAT
    assert ".font(.system(size: 13))" in CHAT
    assert ".frame(minHeight: 44)" in CHAT or ".frame(width: 44, height: 44)" in CHAT
    assert "AssistantMarkdown" in CHAT
    assert "VStack(alignment: .leading, spacing: 6)" in CHAT
    handoff = CHAT[CHAT.find("private struct HandoffTimelineRow") :]
    assert "userAttachments" not in handoff
    assert "WidgetCardView" in CHAT
    widget_block = CHAT[CHAT.find("message.isWidget") : CHAT.find("message.isConnect")]
    assert "userAttachments" not in widget_block
    tool_block = CHAT[CHAT.find("message.isToolLine") : CHAT.find("message.isWidget")]
    assert "userAttachments" not in tool_block
    connect_block = CHAT[CHAT.find("message.isConnect") : CHAT.find("} else if threadRoot")]
    assert "userAttachments" not in connect_block
    assert "onDrop" not in CHAT
    assert "agentPicker" not in CHAT


def test_no_chats_resource_or_computer_pane() -> None:
    assert "/v1/chats/" not in CHAT
    assert "/v1/chats/" not in CLIENT
    assert "/v1/chats/" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CLIENT


def main() -> int:
    tests = [
        test_paperclip_photos_or_files,
        test_pending_chips_wrap_and_sizes,
        test_send_text_or_chip,
        test_user_right_image_and_file_chip,
        test_left_streak_reuses_user_right_chrome,
        test_no_chats_resource_or_computer_pane,
    ]
    failed = 0
    for test in tests:
        try:
            test()
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}", file=sys.stderr)
    if failed:
        print(f"{failed} failed", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
