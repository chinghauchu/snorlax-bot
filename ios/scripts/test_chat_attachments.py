#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.25 iOS composer + user-right attachment chrome lock.

Paperclip opens Photos or Files. Pending chips wrap above the bar with
6pt gap. Image thumb 56×56 + 20px ×. File chip 36px, 13pt name, 12pt
muted size. iOS chips 44pt hit. Send on if text or any chip. Over 10MB
is 12pt danger `Max 10MB.`. v0.27: in-limit video is a pending chip
(not `Video isn’t supported yet.`); over 50MB is `Max 50MB.`. User-right
and LEFT kind=message images 220×160; video player 220×160 native
controls no autoplay; files are 36px name chips that open the Bearer
URL. No /v1/chats/. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
COMPOSER = (IOS / "ComposerTextView.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
MODELS = (IOS / "Models.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")


def test_paperclip_photos_or_files() -> None:
    assert 'Image(systemName: "paperclip")' in CHAT
    assert 'Button("Photos")' in CHAT
    assert 'Button("Files")' in CHAT
    assert ".photosPicker(" in CHAT
    assert ".fileImporter(" in CHAT
    assert "confirmationDialog" in CHAT
    assert "Attach image" not in CHAT
    assert ".images, .videos" in CHAT or ".videos" in CHAT


def test_pending_chips_wrap_and_sizes() -> None:
    assert "FlowWrap(spacing: 6)" in CHAT
    assert ".frame(width: 56, height: 56)" in CHAT
    assert ".frame(width: 20, height: 20)" in CHAT
    assert ".frame(height: 36)" in CHAT
    assert ".font(.system(size: 13))" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert ".frame(minHeight: 44)" in CHAT or ".frame(width: 44, height: 44)" in CHAT
    assert 'ChatAttachment.errMax' in MODELS or '"Max 10MB."' in MODELS
    assert "Max 50MB." in MODELS
    assert "Video isn’t supported yet." not in MODELS
    assert "Video isn’t supported yet." not in CHAT
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
    assert "case video" in TYPES


def test_video_player_220x160_native_controls_no_autoplay() -> None:
    assert "RemoteVideo" in CHAT
    assert "RemoteVideo" in COMPONENTS
    assert "VideoPlayer" in COMPONENTS
    assert "import AVKit" in COMPONENTS
    assert ".frame(width: 220, height: 160)" in CHAT
    assert ".frame(width: 220, height: 160)" in COMPONENTS
    assert "cornerRadius: 8" in COMPONENTS
    assert "lineWidth: 1" in COMPONENTS
    assert ".font(.system(size: 24))" in COMPONENTS
    assert ".font(.system(size: 16))" in CHAT
    assert "play.fill" in COMPONENTS
    assert "play.fill" in CHAT
    assert "player?.pause()" in COMPONENTS
    assert "next.pause()" in COMPONENTS
    assert "player?.play()" in COMPONENTS
    assert "autoPlay" not in COMPONENTS
    assert "playing = false" in COMPONENTS or "@State private var playing = false" in COMPONENTS


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


def test_ime_enter_does_not_send_while_marked_text() -> None:
    assert "markedTextRange" in COMPOSER
    assert "shouldChangeTextIn" in COMPOSER
    assert "onSubmit" in COMPOSER
    assert "onSubmit" in CHAT
    assert "refreshRoster" in MODEL
    assert "create_agent" in MODEL
    assert "create_channel" in MODEL
    assert "CreateAgentSheet" not in CHAT
    assert "CreateChannelSheet" not in CHAT
    assert "computerPane.ts" not in COMPOSER


def test_no_chats_resource_or_computer_pane() -> None:
    assert "/v1/chats/" not in CHAT
    assert "/v1/chats/" not in CLIENT
    assert "/v1/chats/" not in MODEL
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MODEL
    assert "computerPane.ts" not in CLIENT
    assert "watch_video" not in CHAT
    assert "Watch button" not in CHAT
    assert '"Watch"' not in CHAT


def main() -> int:
    tests = [
        test_paperclip_photos_or_files,
        test_pending_chips_wrap_and_sizes,
        test_send_text_or_chip,
        test_user_right_image_and_file_chip,
        test_video_player_220x160_native_controls_no_autoplay,
        test_left_streak_reuses_user_right_chrome,
        test_no_chats_resource_or_computer_pane,
        test_ime_enter_does_not_send_while_marked_text,
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
