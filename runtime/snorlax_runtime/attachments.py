# SPDX-License-Identifier: Apache-2.0
"""Chat attachments: kind, size limits, and model-turn payload."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Any

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
ERR_MAX = "Max 10MB."
ERR_MAX_VIDEO = "Max 50MB."
ERR_EMPTY = "Empty file."
ERR_UNKNOWN = "Unknown attachment id"

IMAGE_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".heic",
    ".heif",
}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
TEXT_EXTRACT_CAP = 100_000


class AttachmentError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _ext(name: str) -> str:
    raw = (name or "").strip().lower()
    if "." not in raw:
        return ""
    return "." + raw.rsplit(".", 1)[-1]


def mime_for_filename(name: str) -> str:
    mime, _ = mimetypes.guess_type(name or "")
    guessed = (mime or "").split(";")[0].strip().lower()
    return guessed or "application/octet-stream"


def max_bytes_for_kind(kind: str) -> int:
    return MAX_VIDEO_BYTES if kind == "video" else MAX_ATTACHMENT_BYTES


def err_max_for_kind(kind: str) -> str:
    return ERR_MAX_VIDEO if kind == "video" else ERR_MAX


def agent_attachment_from_bytes(
    name: str, data: bytes, mime: str = ""
) -> dict[str, Any] | None:
    """Public attachment payload for runtime-produced files, or None to skip.

    Skip empty and oversize (video 50MB, image/file 10MB). kind is image for
    image/*, video for video/* or a video extension, else file.
    """
    raw = data if isinstance(data, (bytes, bytearray)) else b""
    if not raw:
        return None
    filename = Path(name or "file").name or "file"
    guessed = (mime or "").split(";")[0].strip().lower() or mime_for_filename(
        filename
    )
    kind = attachment_kind(guessed, filename)
    if len(raw) > max_bytes_for_kind(kind):
        return None
    return {
        "name": filename,
        "mime": guessed,
        "data": bytes(raw),
        "kind": kind,
    }


def attachment_kind(mime: str, filename: str = "") -> str:
    """image for image/*; video for video/* or a video ext; else file."""
    mime = (mime or "").split(";")[0].strip().lower()
    ext = _ext(filename)
    if mime.startswith("video/") or ext in VIDEO_EXTS:
        return "video"
    if mime.startswith("image/"):
        return "image"
    if ext in IMAGE_EXTS:
        return "image"
    return "file"


def content_text(content: Any) -> str:
    """Plain text of an OpenAI message content (string or multimodal list)."""
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
        return "\n".join(parts)
    return str(content or "")


def apply_to_user_content(
    content: str, attachments: list[dict[str, Any]]
) -> str | list[dict[str, Any]]:
    """Include this turn's attachments for the model.

    Image kinds become OpenAI image_url parts. text/* files contribute
    filename + extracted text. Other files are a short note. kind=video
    is never sent as bytes (no transcription, no in-model watch); a
    short `user attached {name}` stub is fine.
    """
    text_bits: list[str] = []
    stripped = (content or "").strip()
    if stripped:
        text_bits.append(content)
    image_parts: list[dict[str, Any]] = []
    for row in attachments:
        kind = str(row.get("kind") or "file")
        name = str(row.get("name") or "file")
        if kind == "video":
            text_bits.append(f"user attached {name}")
            continue
        mime = str(row.get("mime") or "application/octet-stream")
        data = row.get("data")
        raw = data if isinstance(data, (bytes, bytearray)) else b""
        if kind == "image":
            b64 = base64.b64encode(bytes(raw)).decode("ascii")
            image_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"},
                }
            )
            continue
        if mime.startswith("text/"):
            extract = bytes(raw).decode("utf-8", "replace")
            if len(extract) > TEXT_EXTRACT_CAP:
                extract = extract[: TEXT_EXTRACT_CAP - 1] + "…"
            text_bits.append(f"{name}\n{extract}")
        else:
            text_bits.append(f"user attached {name}")
    text = "\n\n".join(text_bits)
    if not image_parts:
        return text
    parts: list[dict[str, Any]] = []
    if text:
        parts.append({"type": "text", "text": text})
    parts.extend(image_parts)
    return parts
