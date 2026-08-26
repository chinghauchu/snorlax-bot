# SPDX-License-Identifier: Apache-2.0
"""Per-agent 1280x800 sandbox display owned by the runtime.

This is a headless framebuffer the runtime screenshots as PNG. It is not a
second product window, not VNC, and not a static decorative asset. Idle
still counts as on: every screenshot is captured from the live buffer.

v0.15: a user takeover session maps pointer/key into this 1280x800 buffer.
The agent does not drive the sandbox while that session exists.
v0.16: Record inside that session captures pointer/key (and screenshots)
so POST /skills can write a runnable SKILL.md.
"""

from __future__ import annotations

import secrets
import struct
import zlib
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

WIDTH = 1280
HEIGHT = 800
TAIPEI = ZoneInfo("Asia/Taipei")

# 5x7 glyphs, one int per column, bit 0 = top row.
_FONT: dict[str, tuple[int, int, int, int, int]] = {
    " ": (0x00, 0x00, 0x00, 0x00, 0x00),
    "-": (0x08, 0x08, 0x08, 0x08, 0x08),
    ".": (0x00, 0x40, 0x00, 0x00, 0x00),
    ":": (0x00, 0x14, 0x00, 0x00, 0x00),
    "?": (0x02, 0x01, 0x51, 0x09, 0x06),
    "/": (0x40, 0x20, 0x10, 0x08, 0x04),
    "0": (0x3E, 0x51, 0x49, 0x45, 0x3E),
    "1": (0x00, 0x42, 0x7F, 0x40, 0x00),
    "2": (0x42, 0x61, 0x51, 0x49, 0x46),
    "3": (0x21, 0x41, 0x45, 0x4B, 0x31),
    "4": (0x18, 0x14, 0x12, 0x7F, 0x10),
    "5": (0x27, 0x45, 0x45, 0x45, 0x39),
    "6": (0x3C, 0x4A, 0x49, 0x49, 0x30),
    "7": (0x01, 0x71, 0x09, 0x05, 0x03),
    "8": (0x36, 0x49, 0x49, 0x49, 0x36),
    "9": (0x06, 0x49, 0x49, 0x29, 0x1E),
    "A": (0x7E, 0x11, 0x11, 0x11, 0x7E),
    "B": (0x7F, 0x49, 0x49, 0x49, 0x36),
    "C": (0x3E, 0x41, 0x41, 0x41, 0x22),
    "D": (0x7F, 0x41, 0x41, 0x22, 0x1C),
    "E": (0x7F, 0x49, 0x49, 0x49, 0x41),
    "F": (0x7F, 0x09, 0x09, 0x09, 0x01),
    "G": (0x3E, 0x41, 0x49, 0x49, 0x7A),
    "H": (0x7F, 0x08, 0x08, 0x08, 0x7F),
    "I": (0x00, 0x41, 0x7F, 0x41, 0x00),
    "J": (0x20, 0x40, 0x41, 0x3F, 0x01),
    "K": (0x7F, 0x08, 0x14, 0x22, 0x41),
    "L": (0x7F, 0x40, 0x40, 0x40, 0x40),
    "M": (0x7F, 0x02, 0x0C, 0x02, 0x7F),
    "N": (0x7F, 0x04, 0x08, 0x10, 0x7F),
    "O": (0x3E, 0x41, 0x41, 0x41, 0x3E),
    "P": (0x7F, 0x09, 0x09, 0x09, 0x06),
    "Q": (0x3E, 0x41, 0x51, 0x21, 0x5E),
    "R": (0x7F, 0x09, 0x19, 0x29, 0x46),
    "S": (0x46, 0x49, 0x49, 0x49, 0x31),
    "T": (0x01, 0x01, 0x7F, 0x01, 0x01),
    "U": (0x3F, 0x40, 0x40, 0x40, 0x3F),
    "V": (0x1F, 0x20, 0x40, 0x20, 0x1F),
    "W": (0x3F, 0x40, 0x38, 0x40, 0x3F),
    "X": (0x63, 0x14, 0x08, 0x14, 0x63),
    "Y": (0x07, 0x08, 0x70, 0x08, 0x07),
    "Z": (0x61, 0x51, 0x49, 0x45, 0x43),
}


def image_url(agent_id: str) -> str:
    return f"/v1/agents/{agent_id}/computer/screenshot"


def encode_png(width: int, height: int, rgb: bytes) -> bytes:
    """Encode an RGB buffer as a PNG. Stdlib only — no decorative asset file."""
    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)
        start = y * stride
        raw.extend(rgb[start : start + stride])
    compressed = zlib.compress(bytes(raw), 6)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def png_size(png: bytes) -> tuple[int, int]:
    if len(png) < 24 or png[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    width, height = struct.unpack(">II", png[16:24])
    return (width, height)


def _fill_row(pixels: bytearray, y: int, color: tuple[int, int, int]) -> None:
    r, g, b = color
    start = y * WIDTH * 3
    pixels[start : start + WIDTH * 3] = bytes((r, g, b)) * WIDTH


def _fill_rect(
    pixels: bytearray,
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int],
) -> None:
    r, g, b = color
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(WIDTH, x + w)
    y1 = min(HEIGHT, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    row = bytes((r, g, b)) * (x1 - x0)
    for yy in range(y0, y1):
        start = (yy * WIDTH + x0) * 3
        pixels[start : start + len(row)] = row


def _blend_rect(
    pixels: bytearray,
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int],
    alpha: float,
) -> None:
    a = max(0.0, min(1.0, alpha))
    ia = 1.0 - a
    cr, cg, cb = color
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(WIDTH, x + w)
    y1 = min(HEIGHT, y + h)
    for yy in range(y0, y1):
        row = yy * WIDTH * 3
        for xx in range(x0, x1):
            i = row + xx * 3
            pixels[i] = int(pixels[i] * ia + cr * a)
            pixels[i + 1] = int(pixels[i + 1] * ia + cg * a)
            pixels[i + 2] = int(pixels[i + 2] * ia + cb * a)


def _draw_char(
    pixels: bytearray,
    x: int,
    y: int,
    ch: str,
    color: tuple[int, int, int],
    scale: int = 2,
) -> int:
    glyph = _FONT.get(ch) or _FONT.get(ch.upper()) or _FONT["?"]
    r, g, b = color
    for col, bits in enumerate(glyph):
        for row in range(7):
            if bits & (1 << row):
                _fill_rect(
                    pixels,
                    x + col * scale,
                    y + row * scale,
                    scale,
                    scale,
                    (r, g, b),
                )
    return 6 * scale


def _draw_text(
    pixels: bytearray,
    x: int,
    y: int,
    text: str,
    color: tuple[int, int, int],
    scale: int = 2,
) -> None:
    cx = x
    for ch in text:
        if ch == "\n":
            continue
        cx += _draw_char(pixels, cx, y, ch, color, scale)


def _workspace_names(data_dir: Path, agent_id: str) -> list[str]:
    root = data_dir / "workspaces" / "agents" / agent_id
    if not root.is_dir():
        return []
    names: list[str] = []
    try:
        for path in sorted(root.iterdir(), key=lambda p: p.name.lower()):
            if path.name.startswith("."):
                continue
            names.append(path.name[:18])
            if len(names) >= 8:
                break
    except OSError:
        return []
    return names


def _tint_for(agent_id: str) -> tuple[int, int, int]:
    h = zlib.crc32(agent_id.encode("utf-8")) & 0xFFFFFFFF
    return (40 + (h & 31), 48 + ((h >> 5) & 31), 72 + ((h >> 10) & 47))


def paint_desktop_pixels(
    agent_id: str, name: str, data_dir: Path | None = None
) -> bytearray:
    """Paint the live idle desktop into an RGB buffer."""
    pixels = bytearray(WIDTH * HEIGHT * 3)
    top = _tint_for(agent_id)
    bottom = (max(8, top[0] - 18), max(10, top[1] - 18), max(18, top[2] - 22))
    for y in range(HEIGHT):
        t = y / max(HEIGHT - 1, 1)
        color = (
            int(top[0] + (bottom[0] - top[0]) * t),
            int(top[1] + (bottom[1] - top[1]) * t),
            int(top[2] + (bottom[2] - top[2]) * t),
        )
        _fill_row(pixels, y, color)

    bar = (18, 20, 28)
    _fill_rect(pixels, 0, 0, WIDTH, 36, bar)
    _fill_rect(pixels, 0, HEIGHT - 56, WIDTH, 56, (16, 18, 24))
    _fill_rect(pixels, 0, 36, WIDTH, 1, (48, 52, 64))
    _fill_rect(pixels, 0, HEIGHT - 56, WIDTH, 1, (48, 52, 64))

    label = (name or agent_id).strip() or "Computer"
    if len(label) > 28:
        label = label[:27] + "."
    _draw_text(pixels, 16, 10, label.upper(), (236, 236, 239), scale=2)
    clock = datetime.now(TAIPEI).strftime("%H:%M")
    _draw_text(pixels, WIDTH - 16 - 6 * 2 * len(clock), 10, clock, (139, 141, 148), scale=2)

    # Idle window chrome — the desktop is on even when nothing is running.
    win_x, win_y, win_w, win_h = 280, 120, 720, 480
    _fill_rect(pixels, win_x, win_y, win_w, win_h, (24, 26, 34))
    _fill_rect(pixels, win_x, win_y, win_w, 32, (32, 36, 46))
    _fill_rect(pixels, win_x, win_y, win_w, 1, (72, 78, 96))
    _fill_rect(pixels, win_x, win_y + win_h - 1, win_w, 1, (72, 78, 96))
    _fill_rect(pixels, win_x, win_y, 1, win_h, (72, 78, 96))
    _fill_rect(pixels, win_x + win_w - 1, win_y, 1, win_h, (72, 78, 96))
    for i, dot in enumerate(((255, 107, 107), (232, 196, 104), (109, 186, 137))):
        _fill_rect(pixels, win_x + 14 + i * 18, win_y + 12, 10, 10, dot)
    _draw_text(pixels, win_x + 72, win_y + 9, "DESKTOP", (139, 141, 148), scale=2)
    _draw_text(
        pixels,
        win_x + 40,
        win_y + 200,
        "IDLE",
        (109, 139, 255),
        scale=4,
    )

    files = _workspace_names(data_dir, agent_id) if data_dir is not None else []
    if files:
        icon_y = HEIGHT - 200
        icon_x = 48
        for fname in files:
            _fill_rect(pixels, icon_x, icon_y, 72, 88, (36, 40, 52))
            _fill_rect(pixels, icon_x + 12, icon_y + 10, 48, 56, (58, 64, 82))
            _draw_text(pixels, icon_x, icon_y + 72, fname[:10].upper(), (200, 202, 210), scale=1)
            icon_x += 100

    # Dock dots — always-on chrome, not a click target.
    dock_n = 5
    dock_w = dock_n * 44
    dock_x = (WIDTH - dock_w) // 2
    for i in range(dock_n):
        _blend_rect(pixels, dock_x + i * 44, HEIGHT - 44, 28, 28, (109, 139, 255), 0.35)

    return pixels


def paint_desktop(agent_id: str, name: str, data_dir: Path | None = None) -> bytes:
    """Capture the live idle desktop for this agent as PNG bytes."""
    return encode_png(WIDTH, HEIGHT, bytes(paint_desktop_pixels(agent_id, name, data_dir)))


def _draw_cursor(pixels: bytearray, x: int, y: int) -> None:
    # Simple pointer: filled triangle with a 1px outline.
    for dy in range(16):
        span = max(1, dy // 2)
        _fill_rect(pixels, x, y + dy, span, 1, (236, 236, 239))
        _fill_rect(pixels, x, y + dy, 1, 1, (18, 20, 28))
        _fill_rect(pixels, x + span - 1, y + dy, 1, 1, (18, 20, 28))
    _fill_rect(pixels, x, y, 2, 2, (18, 20, 28))


def _draw_click_mark(pixels: bytearray, x: int, y: int) -> None:
    _fill_rect(pixels, x - 3, y - 3, 7, 7, (109, 139, 255))
    _fill_rect(pixels, x - 1, y - 1, 3, 3, (236, 236, 239))


POINTER_TYPES = frozenset({"move", "down", "up", "click"})
KEY_TYPES = frozenset({"down", "up", "type"})
SANDBOX_DRIVE_TOOLS = frozenset({"computer_click", "computer_key"})
MAX_CAPTURE_EVENTS = 400
MAX_CAPTURE_FRAMES = 8

_HUB: ComputerHub | None = None


class ComputerError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class Capture:
    """In-memory demonstration. Disk write happens only on POST /skills."""

    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []
        self.start_png: bytes | None = None
        self.end_png: bytes | None = None
        self.frames: list[bytes] = []
        self._pending_move: dict[str, object] | None = None

    def add_pointer(self, x: int, y: int, kind: str) -> None:
        event = {"kind": "pointer", "type": kind, "x": x, "y": y}
        if kind == "move":
            self._pending_move = event
            return
        if self._pending_move is not None:
            self._append(self._pending_move)
            self._pending_move = None
        self._append(event)

    def add_key(self, key: str, kind: str, text: str | None) -> None:
        if self._pending_move is not None:
            self._append(self._pending_move)
            self._pending_move = None
        event: dict[str, object] = {"kind": "key", "type": kind, "key": key}
        if text:
            event["text"] = text
        self._append(event)

    def add_frame(self, png: bytes) -> None:
        if len(self.frames) >= MAX_CAPTURE_FRAMES:
            return
        if png:
            self.frames.append(png)

    def finish(self) -> None:
        if self._pending_move is not None:
            self._append(self._pending_move)
            self._pending_move = None

    def _append(self, event: dict[str, object]) -> None:
        if len(self.events) >= MAX_CAPTURE_EVENTS:
            return
        self.events.append(event)


def configure_computer(hub: ComputerHub | None) -> None:
    global _HUB
    _HUB = hub


def current_hub() -> ComputerHub | None:
    return _HUB


def session_blocks_agent(agent_id: str) -> bool:
    return _HUB is not None and _HUB.has_session(agent_id)


def agent_id_from_workspace(workspace: Path) -> str | None:
    parts = Path(workspace).resolve().parts
    for label in ("agents", "channels"):
        if label in parts:
            idx = parts.index(label)
            if idx + 1 < len(parts):
                return parts[idx + 1]
    return None


class ComputerHub:
    """In-process per-agent displays. Detach to simulate no sandbox."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self._detached: set[str] = set()
        self._last: dict[str, bytes] = {}
        self._pixels: dict[str, bytearray] = {}
        self._cursor: dict[str, tuple[int, int]] = {}
        self._typed: dict[str, str] = {}
        self._sessions: dict[str, str] = {}
        self._driver: dict[str, str] = {}
        self._names: dict[str, str] = {}
        self._recording: set[str] = set()
        self._captures: dict[str, Capture] = {}

    def detach(self, agent_id: str) -> None:
        self._detached.add(agent_id)
        self._last.pop(agent_id, None)
        self._pixels.pop(agent_id, None)
        self._cursor.pop(agent_id, None)
        self._typed.pop(agent_id, None)
        self._sessions.pop(agent_id, None)
        self._driver.pop(agent_id, None)
        self._names.pop(agent_id, None)
        self._recording.discard(agent_id)
        self._captures.pop(agent_id, None)

    def has_sandbox(self, agent_id: str) -> bool:
        return agent_id not in self._detached

    def has_session(self, agent_id: str) -> bool:
        return agent_id in self._sessions and self.has_sandbox(agent_id)

    def driving(self, agent_id: str) -> str:
        if self.has_session(agent_id):
            return "user"
        if self._driver.get(agent_id) == "agent":
            return "agent"
        return "idle"

    def is_recording(self, agent_id: str) -> bool:
        return agent_id in self._recording and self.has_session(agent_id)

    def preview(self, agent_id: str) -> dict[str, object]:
        if not self.has_sandbox(agent_id):
            return {"hasSandbox": False, "width": WIDTH, "height": HEIGHT}
        body: dict[str, object] = {
            "hasSandbox": True,
            "width": WIDTH,
            "height": HEIGHT,
            "imageUrl": image_url(agent_id),
            "driving": self.driving(agent_id),
        }
        body["recording"] = self.is_recording(agent_id)
        return body

    def open_session(self, agent_id: str, name: str = "") -> dict[str, str] | None:
        if not self.has_sandbox(agent_id):
            return None
        if name:
            self._names[agent_id] = name
        self._ensure_pixels(agent_id)
        existing = self._sessions.get(agent_id)
        if existing:
            return {"sessionId": existing}
        session_id = f"sess_{secrets.token_hex(8)}"
        self._sessions[agent_id] = session_id
        return {"sessionId": session_id}

    def close_session(self, agent_id: str, session_id: str | None = None) -> None:
        if session_id is not None:
            current = self._sessions.get(agent_id)
            if current != session_id:
                raise ComputerError(404, "no computer session")
        if agent_id in self._sessions:
            self._snapshot(agent_id)
        self._sessions.pop(agent_id, None)
        self._recording.discard(agent_id)
        self._captures.pop(agent_id, None)

    def start_record(self, agent_id: str) -> dict[str, bool]:
        if not self.has_session(agent_id):
            raise ComputerError(409, "no computer session")
        if agent_id in self._recording:
            raise ComputerError(409, "already recording")
        capture = Capture()
        png = self._png_now(agent_id)
        capture.start_png = png
        capture.add_frame(png)
        self._captures[agent_id] = capture
        self._recording.add(agent_id)
        return {"recording": True}

    def stop_record(self, agent_id: str) -> None:
        if not self.has_session(agent_id):
            raise ComputerError(409, "no computer session")
        capture = self._captures.get(agent_id)
        if agent_id in self._recording and capture is not None:
            capture.finish()
            png = self._png_now(agent_id)
            capture.end_png = png
            capture.add_frame(png)
        self._recording.discard(agent_id)

    def take_capture(self, agent_id: str) -> Capture:
        if self.is_recording(agent_id):
            raise ComputerError(422, "no pending capture")
        capture = self._captures.pop(agent_id, None)
        if capture is None:
            raise ComputerError(422, "no pending capture")
        capture.finish()
        return capture

    def pointer(
        self,
        agent_id: str,
        x: int,
        y: int,
        kind: str,
        *,
        user: bool,
    ) -> None:
        self._require_drive(agent_id, user=user)
        self._ensure_pixels(agent_id)
        x = max(0, min(WIDTH - 1, int(x)))
        y = max(0, min(HEIGHT - 1, int(y)))
        self._cursor[agent_id] = (x, y)
        if kind in {"down", "click"}:
            _draw_click_mark(self._pixels[agent_id], x, y)
        if not user:
            self._driver[agent_id] = "agent"
        self._snapshot(agent_id)
        if user:
            self._record_pointer(agent_id, x, y, kind)

    def key(
        self,
        agent_id: str,
        key: str,
        kind: str,
        *,
        user: bool,
        text: str | None = None,
    ) -> None:
        self._require_drive(agent_id, user=user)
        self._ensure_pixels(agent_id)
        buf = self._typed.get(agent_id, "")
        typed = (text or "").strip() if kind == "type" else ""
        if kind == "type" and typed:
            buf = (buf + typed)[:80]
        else:
            token = (key or "").strip()
            if kind in {"down", "type"} and token:
                if token in {"Backspace", "Delete"}:
                    buf = buf[:-1]
                elif token in {"Enter", "Return"}:
                    buf = (buf + " ")[:80]
                elif len(token) == 1:
                    buf = (buf + token)[:80]
        self._typed[agent_id] = buf
        if not user:
            self._driver[agent_id] = "agent"
        self._snapshot(agent_id)
        if user:
            self._record_key(agent_id, key, kind, text)

    def screenshot_png(self, agent_id: str, name: str = "") -> bytes | None:
        if not self.has_sandbox(agent_id):
            return None
        if name:
            self._names[agent_id] = name
        png = encode_png(WIDTH, HEIGHT, bytes(self._composite(agent_id)))
        self._last[agent_id] = png
        return png

    def last_png(self, agent_id: str) -> bytes | None:
        return self._last.get(agent_id)

    def _require_drive(self, agent_id: str, *, user: bool) -> None:
        if not self.has_sandbox(agent_id):
            raise ComputerError(404, "no computer")
        if user and not self.has_session(agent_id):
            raise ComputerError(409, "no computer session")
        if not user and self.has_session(agent_id):
            raise ComputerError(409, "computer session is active")

    def _ensure_pixels(self, agent_id: str) -> bytearray:
        existing = self._pixels.get(agent_id)
        if existing is None:
            existing = paint_desktop_pixels(
                agent_id, self._names.get(agent_id, ""), self.data_dir
            )
            self._pixels[agent_id] = existing
        return existing

    def _composite(self, agent_id: str) -> bytearray:
        if agent_id not in self._pixels:
            return paint_desktop_pixels(
                agent_id, self._names.get(agent_id, ""), self.data_dir
            )
        pixels = bytearray(self._pixels[agent_id])
        typed = self._typed.get(agent_id) or ""
        if typed:
            _draw_text(pixels, 320, 400, typed.upper()[:40], (236, 236, 239), scale=2)
        cursor = self._cursor.get(agent_id)
        if cursor is not None and self.has_session(agent_id):
            _draw_cursor(pixels, cursor[0], cursor[1])
        return pixels

    def _snapshot(self, agent_id: str) -> None:
        png = encode_png(WIDTH, HEIGHT, bytes(self._composite(agent_id)))
        self._last[agent_id] = png

    def _png_now(self, agent_id: str) -> bytes:
        self._snapshot(agent_id)
        return self._last[agent_id]

    def _record_pointer(self, agent_id: str, x: int, y: int, kind: str) -> None:
        if agent_id not in self._recording:
            return
        capture = self._captures.get(agent_id)
        if capture is None:
            return
        capture.add_pointer(x, y, kind)
        if kind in {"down", "click"}:
            capture.add_frame(self._png_now(agent_id))

    def _record_key(
        self, agent_id: str, key: str, kind: str, text: str | None
    ) -> None:
        if agent_id not in self._recording:
            return
        capture = self._captures.get(agent_id)
        if capture is None:
            return
        capture.add_key(key, kind, text)
