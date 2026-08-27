# SPDX-License-Identifier: Apache-2.0
"""Local watch_video tool: text description, never raw video bytes."""

from __future__ import annotations

import asyncio
import base64
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from snorlax_runtime.inference import BACKEND_MOCK, InferenceError, StreamPart

ERR_UNKNOWN_ATTACHMENT = "Error: unknown attachment id"
ERR_NOT_VIDEO = "Error: not a video"
WATCH_RESULT_CAP = 8_000
CAPTION_CAP = 2_000
MAX_FRAMES = 3
FRAME_WIDTH = 320
FFPROBE_TIMEOUT = 15.0
FFMPEG_TIMEOUT = 20.0
CAPTION_PROMPT = (
    "Describe these video frames in a few sentences. What is shown? "
    "Do not mention that they are stills or screenshots."
)


def parse_attachment_id(arguments: str) -> str:
    try:
        args = json.loads(arguments) if (arguments or "").strip() else {}
    except json.JSONDecodeError:
        return ""
    if not isinstance(args, dict):
        return ""
    return str(args.get("attachmentId") or args.get("attachment_id") or "").strip()


def format_size(n: int) -> str:
    if n < 1024:
        return f"{n} bytes"
    if n < 1024 * 1024:
        kb = n / 1024
        return f"{kb:.1f} KB"
    mb = n / (1024 * 1024)
    return f"{mb:.1f} MB"


def format_watch_text(
    *,
    name: str,
    size: int,
    probe: dict[str, Any] | None = None,
    caption: str = "",
) -> str:
    """Plain-text tool result. First line is the filename (done_summary)."""
    safe = (name or "video").replace("\n", " ").replace("\r", " ").strip() or "video"
    lines = [safe, f"size: {format_size(int(size or 0))}"]
    info = probe or {}
    duration = info.get("duration")
    if isinstance(duration, (int, float)) and duration > 0:
        lines.append(f"duration: {duration:.1f}s")
    width = info.get("width")
    height = info.get("height")
    if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
        lines.append(f"resolution: {width}x{height}")
    codec = str(info.get("codec") or "").strip()
    if codec:
        lines.append(f"codec: {codec}")
    note = (caption or "").strip()
    if note:
        lines.append("")
        lines.append(note)
    body = "\n".join(lines).strip()
    if len(body) > WATCH_RESULT_CAP:
        body = body[: WATCH_RESULT_CAP - 1] + "…"
    return body


def probe_video(path: Path) -> dict[str, Any]:
    """ffprobe duration/size/resolution. Empty dict if ffprobe is missing or fails."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe or not path.is_file():
        return {}
    try:
        proc = subprocess.run(
            [
                ffprobe,
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            timeout=FFPROBE_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {}
    if proc.returncode != 0 or not proc.stdout:
        return {}
    try:
        payload = json.loads(proc.stdout.decode("utf-8", "replace"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    out: dict[str, Any] = {}
    fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    raw_dur = fmt.get("duration") if fmt else None
    try:
        duration = float(raw_dur) if raw_dur is not None else 0.0
    except (TypeError, ValueError):
        duration = 0.0
    if duration > 0:
        out["duration"] = duration
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    for stream in streams:
        if not isinstance(stream, dict):
            continue
        if str(stream.get("codec_type") or "") != "video":
            continue
        try:
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
        except (TypeError, ValueError):
            width, height = 0, 0
        if width > 0 and height > 0:
            out["width"] = width
            out["height"] = height
        codec = str(stream.get("codec_name") or "").strip()
        if codec:
            out["codec"] = codec
        break
    return out


def extract_video_frames(path: Path, duration: float | None) -> list[bytes]:
    """A few JPEG frames via ffmpeg. Empty list if ffmpeg is missing or decode fails."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not path.is_file():
        return []
    times = _frame_timestamps(duration)
    frames: list[bytes] = []
    for stamp in times:
        try:
            proc = subprocess.run(
                [
                    ffmpeg,
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{stamp:.3f}",
                    "-i",
                    str(path),
                    "-frames:v",
                    "1",
                    "-vf",
                    f"scale='min({FRAME_WIDTH},iw)':-2",
                    "-f",
                    "image2pipe",
                    "-vcodec",
                    "mjpeg",
                    "pipe:1",
                ],
                capture_output=True,
                timeout=FFMPEG_TIMEOUT,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        blob = proc.stdout or b""
        if proc.returncode == 0 and blob.startswith(b"\xff\xd8"):
            frames.append(blob)
        if len(frames) >= MAX_FRAMES:
            break
    return frames


def _frame_timestamps(duration: float | None) -> list[float]:
    if duration is not None and duration > 0.15:
        return [duration * frac for frac in (0.1, 0.5, 0.9)]
    return [0.0, 0.5, 1.0]


def _backend_can_caption(backend: Any) -> bool:
    if backend is None or not hasattr(backend, "generate"):
        return False
    name = str(getattr(backend, "name", "") or "").strip().lower()
    return name not in {"", BACKEND_MOCK, "mock"}


async def caption_frames(backend: Any, frames: list[bytes]) -> str:
    """Caption extracted JPEGs via the local OpenAI-compat backend. Never the video file."""
    if not frames or not _backend_can_caption(backend):
        return ""
    parts: list[dict[str, Any]] = [{"type": "text", "text": CAPTION_PROMPT}]
    for jpeg in frames[:MAX_FRAMES]:
        b64 = base64.b64encode(jpeg).decode("ascii")
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            }
        )
    messages = [
        {
            "role": "system",
            "content": (
                "You caption video frames for a local assistant. Be concise. "
                "Plain text only."
            ),
        },
        {"role": "user", "content": parts},
    ]
    chunks: list[str] = []
    try:
        async for part in backend.generate(messages, tools=None):
            if isinstance(part, StreamPart) and part.text:
                chunks.append(part.text)
            elif isinstance(part, str):
                chunks.append(part)
    except (InferenceError, Exception):  # noqa: BLE001 — caption is optional
        return ""
    text = "".join(chunks).strip()
    if len(text) > CAPTION_CAP:
        text = text[: CAPTION_CAP - 1] + "…"
    return text


async def watch_video_tool(
    arguments: str,
    *,
    conversation_id: str | None,
    store: Any | None,
    backend: Any | None = None,
) -> str:
    """Describe a kind=video attachment on this conversation as plain text."""
    attachment_id = parse_attachment_id(arguments)
    if not attachment_id or store is None or not (conversation_id or "").strip():
        return ERR_UNKNOWN_ATTACHMENT
    row = await store.get_attachment_row(attachment_id)
    if row is None or str(row.get("conversation_id") or "") != conversation_id:
        return ERR_UNKNOWN_ATTACHMENT
    if str(row.get("kind") or "") != "video":
        return ERR_NOT_VIDEO
    name = str(row.get("name") or "video")
    size = int(row.get("size") or 0)
    path = Path(str(row.get("storage_path") or ""))
    probe = await asyncio.to_thread(probe_video, path) if path.is_file() else {}
    duration = probe.get("duration") if isinstance(probe.get("duration"), (int, float)) else None
    frames = (
        await asyncio.to_thread(extract_video_frames, path, duration)
        if path.is_file()
        else []
    )
    caption = await caption_frames(backend, frames)
    return format_watch_text(name=name, size=size, probe=probe, caption=caption)
