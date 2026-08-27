# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

import pytest

from snorlax_runtime.tools import done_summary
from snorlax_runtime.watch import (
    ERR_UNKNOWN_ATTACHMENT,
    format_size,
    format_watch_text,
    parse_attachment_id,
    probe_video,
    watch_video_tool,
)


def test_parse_attachment_id() -> None:
    assert parse_attachment_id('{"attachmentId": "att_abc"}') == "att_abc"
    assert parse_attachment_id('{"attachment_id": "att_abc"}') == "att_abc"
    assert parse_attachment_id("{") == ""
    assert parse_attachment_id("{}") == ""


def test_format_watch_text_is_plain_not_json_or_bytes() -> None:
    secret = b"secret-video-bytes-do-not-send"
    body = format_watch_text(
        name="clip.mp4",
        size=len(secret),
        probe={"duration": 4.2, "width": 1280, "height": 720, "codec": "h264"},
        caption="A person waves.",
    )
    assert body.startswith("clip.mp4")
    assert not body.startswith("{")
    assert "size:" in body
    assert "duration: 4.2s" in body
    assert "1280x720" in body
    assert "A person waves." in body
    assert secret.decode("ascii") not in body
    assert "secret-video-bytes" not in body


def test_format_watch_text_caps_body() -> None:
    body = format_watch_text(
        name="clip.mp4",
        size=12,
        caption="x" * 20_000,
    )
    assert len(body) <= 8000
    assert body.startswith("clip.mp4")


def test_format_size_units() -> None:
    assert format_size(16) == "16 bytes"
    assert "KB" in format_size(2048)
    assert "MB" in format_size(2 * 1024 * 1024)


def test_probe_without_file_is_empty(tmp_path: Path) -> None:
    assert probe_video(tmp_path / "missing.mp4") == {}


def test_done_summary_watched_name() -> None:
    assert (
        done_summary(
            "watch_video",
            {"attachmentId": "att_x"},
            True,
            "clip.mp4\nsize: 16 bytes",
        )
        == "Watched clip.mp4"
    )
    assert (
        done_summary("watch_video", {"attachmentId": "att_x"}, False, "Error: nope")
        == "watch_video failed"
    )


@pytest.mark.asyncio
async def test_watch_video_tool_without_store_is_unknown() -> None:
    out = await watch_video_tool(
        '{"attachmentId": "att_x"}',
        conversation_id="snorlax-bot",
        store=None,
    )
    assert out == ERR_UNKNOWN_ATTACHMENT


@pytest.mark.asyncio
async def test_watch_video_tool_missing_id() -> None:
    class _Store:
        async def get_attachment_row(self, attachment_id: str):
            raise AssertionError("should not lookup")

    out = await watch_video_tool(
        "{}", conversation_id="snorlax-bot", store=_Store()
    )
    assert out == ERR_UNKNOWN_ATTACHMENT
