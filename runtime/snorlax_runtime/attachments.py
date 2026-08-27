# SPDX-License-Identifier: Apache-2.0
"""Chat attachments: kind, size limits, and model-turn payload."""

from __future__ import annotations

import base64
from typing import Any

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ERR_MAX = "Max 10MB."
ERR_VIDEO = "Video isn’t supported yet."
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


def attachment_kind(mime: str, filename: str = "") -> str:
    """image for image/* (not video); file otherwise. video/* raises."""
    mime = (mime or "").split(";")[0].strip().lower()
    ext = _ext(filename)
    if mime.startswith("video/") or ext in VIDEO_EXTS:
        raise AttachmentError(ERR_VIDEO)
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
    filename + extracted text. Other files are a short note.
    """
    text_bits: list[str] = []
    stripped = (content or "").strip()
    if stripped:
        text_bits.append(content)
    image_parts: list[dict[str, Any]] = []
    for row in attachments:
        kind = str(row.get("kind") or "file")
        name = str(row.get("name") or "file")
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
