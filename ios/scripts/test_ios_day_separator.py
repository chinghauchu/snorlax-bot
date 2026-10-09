#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.67 iOS day separators.

A muted Today / Yesterday / weekday / date line sits above the first
painted transcript row of each local day. Collapsed tool lines do not
count. No animation. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
SWIFT = (IOS / "DaySeparator.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_TS = (ROOT / "desktop" / "src" / "daySeparator.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
DESKTOP_CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.67 day separators (a muted Today / Yesterday / weekday / date line "
    "above the first message of each local day; collapsed tool lines do not "
    "count; no animation; no new HTTP)"
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
WEEKDAYS = (
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
)


def day_separator_label(created: datetime | None, now: datetime) -> str | None:
    """Same rules as DaySeparator.swift / daySeparator.ts. Local calendar."""
    if created is None:
        return None
    days = (now.date() - created.date()).days
    if days == 0:
        return "Today"
    if days == 1:
        return "Yesterday"
    if 2 <= days <= 6:
        # datetime.weekday() is Monday=0. WEEKDAYS is Sunday-first, matching Date.getDay.
        return WEEKDAYS[(created.weekday() + 1) % 7]
    day = f"{MONTHS[created.month - 1]} {created.day}"
    if created.year != now.year:
        return f"{day}, {created.year}"
    return day


def test_labels_match_desktop_rules() -> None:
    now = datetime(2026, 10, 9, 16, 0, 0)
    assert day_separator_label(datetime(2026, 10, 9, 15, 4), now) == "Today"
    assert day_separator_label(datetime(2026, 10, 9, 0, 0), now) == "Today"
    assert day_separator_label(datetime(2026, 10, 8, 23, 59), now) == "Yesterday"
    assert day_separator_label(datetime(2026, 10, 7, 12, 0), now) == "Wednesday"
    assert day_separator_label(datetime(2026, 10, 3, 8, 0), now) == "Saturday"
    assert day_separator_label(datetime(2026, 10, 2, 8, 0), now) == "Oct 2"
    assert day_separator_label(datetime(2026, 1, 1, 8, 1), now) == "Jan 1"
    assert day_separator_label(datetime(2025, 10, 8, 15, 4), now) == "Oct 8, 2025"
    assert day_separator_label(datetime(2026, 10, 10, 1, 0), now) == "Oct 10"
    assert day_separator_label(None, now) is None
    assert "days == 0" in SWIFT
    assert "days == 1" in SWIFT
    assert "(2...6).contains(days)" in SWIFT
    assert 'todayLabel = "Today"' in SWIFT
    assert 'yesterdayLabel = "Yesterday"' in SWIFT
    assert "if (days === 0)" in DESKTOP_TS
    assert "if (days === 1)" in DESKTOP_TS
    assert "days >= 2 && days <= 6" in DESKTOP_TS
    assert "No animation" in SWIFT
    assert "No animation" in DESKTOP_TS
    assert "withAnimation" not in SWIFT
    for name in MONTHS:
        assert f'"{name}"' in SWIFT
        assert f'"{name}"' in DESKTOP_TS
    for name in WEEKDAYS:
        assert f'"{name}"' in SWIFT
        assert f'"{name}"' in DESKTOP_TS


def test_transcript_paints_a_header_and_skips_collapsed_tools() -> None:
    assert "DaySeparator.labels(" in CHAT
    assert "DaySeparator.Row(" in CHAT
    assert "hidden: CompactToolTraces.hidePersisted(" in CHAT
    assert "Text(dayLabel)" in CHAT
    assert ".font(.system(size: 12))" in CHAT
    assert ".foregroundStyle(.secondary)" in CHAT
    assert ".accessibilityAddTraits(.isHeader)" in CHAT
    assert "daySeparatorLabels(" in DESKTOP_APP
    assert 'className="day-separator"' in DESKTOP_APP
    assert 'role="heading"' in DESKTOP_APP
    assert "aria-level={2}" in DESKTOP_APP
    assert "hidden: hidePersistedTool(" in DESKTOP_APP
    css_at = DESKTOP_CSS.find("\n.day-separator {")
    assert css_at >= 0
    rule = DESKTOP_CSS[css_at : DESKTOP_CSS.find("}", css_at) + 1]
    assert "font-size: 12px" in rule
    assert "color: var(--text-muted)" in rule
    assert "text-align: center" in rule
    assert "transition" not in rule
    assert "animation" not in rule
    assert 'className="jump-latest"' in DESKTOP_APP
    assert "StickToBottom.jumpLabel" in CHAT


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_day_separator.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in DESKTOP_TS
    assert "/v1/" not in SWIFT
    assert "/v1/" not in DESKTOP_TS


def main() -> int:
    tests = [
        test_labels_match_desktop_rules,
        test_transcript_paints_a_header_and_skips_collapsed_tools,
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
