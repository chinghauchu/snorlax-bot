#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.65 iOS bubble timestamps.

Long-press context menu shows the bubble's local time (existing createdAt)
as a non-actionable header beside Copy / Speak / Regenerate. Hide while
that bubble is still streaming. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "BubbleTime.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_TS = (ROOT / "desktop" / "src" / "bubbleTime.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
V1 = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")

PHRASE = (
    "v0.65 bubble timestamps (hover / long-press shows local time from "
    "createdAt; hide while streaming; no layout shift; no new HTTP)"
)

MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def format_bubble_time(created: datetime | None, now: datetime) -> str | None:
    """Same rules as BubbleTime.swift / bubbleTime.ts. Local calendar."""
    if created is None:
        return None
    hour = created.hour
    suffix = "PM" if hour >= 12 else "AM"
    hour = hour % 12
    if hour == 0:
        hour = 12
    clock = f"{hour}:{created.minute:02d} {suffix}"
    if created.date() == now.date():
        return clock
    day = f"{MONTHS[created.month - 1]} {created.day}"
    if created.year != now.year:
        day = f"{day}, {created.year}"
    return f"{day}, {clock}"


def show_bubble_timestamp(streaming: bool) -> bool:
    return not streaming


def test_format_matches_desktop_rules() -> None:
    now = datetime(2026, 10, 9, 16, 0, 0)
    assert format_bubble_time(datetime(2026, 10, 9, 15, 4), now) == "3:04 PM"
    assert format_bubble_time(datetime(2026, 10, 9, 9, 5), now) == "9:05 AM"
    assert format_bubble_time(datetime(2026, 10, 9, 0, 0), now) == "12:00 AM"
    assert format_bubble_time(datetime(2026, 10, 9, 12, 0), now) == "12:00 PM"
    assert format_bubble_time(datetime(2026, 10, 8, 15, 4), now) == "Oct 8, 3:04 PM"
    assert (
        format_bubble_time(datetime(2025, 10, 8, 15, 4), now) == "Oct 8, 2025, 3:04 PM"
    )
    assert format_bubble_time(None, now) is None
    assert show_bubble_timestamp(True) is False
    assert show_bubble_timestamp(False) is True
    assert "h:mm AM" in SWIFT or "h:mm AM" in DESKTOP_TS
    assert "inSameDayAs" in SWIFT
    assert "guard !streaming" in SWIFT
    assert "reduceMotion ? 0 : fadeMs" in SWIFT
    assert 'static let fadeMs = 120' in SWIFT
    assert "BUBBLE_TIME_FADE_MS = 120" in DESKTOP_TS
    assert "return reduceMotion ? 0 : BUBBLE_TIME_FADE_MS" in DESKTOP_TS
    for month in MONTHS:
        assert f'"{month}"' in SWIFT


def test_long_press_header_is_not_an_action() -> None:
    assert CHAT.count(".modifier(timeMenu)") >= 2
    assert "streaming: !completed" in CHAT
    assert "BubbleTime.label" in CHAT
    menu = _slice(CHAT, "struct BubbleTimestampMenu", "struct AttachmentShareSheet")
    assert ".contextMenu" in menu
    header = _slice(menu, "} header: {", "}")
    assert "Text(stamp)" in header
    assert "Button" not in header
    assert ".font(.system(size: 12))" in header
    assert "foregroundStyle(.secondary)" in header
    assert 'Button("Copy")' in menu
    assert 'Button("Regenerate")' in menu
    assert "Button(Speak.label(speaking))" in menu
    assert "Button(stamp)" in menu
    assert ".disabled(true)" in menu
    # The inline Copy / Regenerate row stays; the menu does not replace it.
    inline = _slice(CHAT, 'Button("Copy")', "if showSpeak")
    assert "UIPasteboard.general.string = message.content" in inline
    assert 'Button("Regenerate")' in CHAT
    assert "StreamingCaretView()" in CHAT
    assert "className=\"streaming-caret\"" in DESKTOP_APP or 'className="streaming-caret"' in DESKTOP_APP
    assert "bubbleTimeLabel" in DESKTOP_APP
    assert 'className="bubble-time"' in DESKTOP_APP or "bubble-time" in DESKTOP_CSS
    time_css = DESKTOP_CSS[
        DESKTOP_CSS.find("\n.bubble-time {") : DESKTOP_CSS.find(
            "}", DESKTOP_CSS.find("\n.bubble-time {")
        )
        + 1
    ]
    assert "position: absolute" in time_css
    assert "pointer-events: none" in time_css
    assert "opacity: 0" in time_css
    assert "transition: opacity 120ms" in time_css


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_bubble_time.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in DESKTOP_TS
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP_TS
    assert "var createdAt: Date" in V1
    assert "MessageActions" in DESKTOP_APP


def main() -> int:
    tests = [
        test_format_matches_desktop_rules,
        test_long_press_header_is_not_an_action,
        test_openapi_roadmap_ci_no_computer_pane,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
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
