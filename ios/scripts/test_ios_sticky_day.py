#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.85 sticky day header.

The v0.67 Today / Yesterday / weekday / date line pins to the top
of the transcript while scrolling through that day. The next day
pushes it off. It stays above that day's first message and above
New messages. No animation. No new HTTP. OpenAPI stays 0.18.0.
Clipboard image paste already shipped in v0.30, so this cut does
not add a second paste path. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
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
    "v0.85 sticky day header (the v0.67 Today / Yesterday / weekday / date "
    "line pins to the top of the transcript while scrolling through that day; "
    "the next day pushes it off; it stays above that day's first message and "
    "above New messages; no animation; no new HTTP)"
)


def groups(labels: list[str | None]) -> list[tuple[str | None, int, int]]:
    """Same split as DaySeparator.groups / dayGroups."""
    if not labels:
        return []
    out: list[tuple[str | None, int, int]] = []
    start = 0
    label = labels[0]
    for index in range(1, len(labels)):
        nxt = labels[index]
        if nxt is None:
            continue
        out.append((label, start, index))
        label = nxt
        start = index
    out.append((label, start, len(labels)))
    return out


def pinned(
    spans: list[tuple[str | None, float, float]], viewport: float
) -> str | None:
    """Same rule as pinnedDayLabel. The next top pushes the previous off."""
    for label, top, bottom in spans:
        if bottom <= viewport:
            continue
        if top > viewport:
            break
        return label
    return None


def css_rule(selector: str) -> str:
    needle = f"\n{selector} {{"
    at = DESKTOP_CSS.find(needle)
    assert at >= 0, selector
    return DESKTOP_CSS[at : DESKTOP_CSS.find("}", at) + 1]


def test_groups_and_pin_rule() -> None:
    assert groups([]) == []
    assert groups([None, None]) == [(None, 0, 2)]
    assert groups(["Today", None, None]) == [("Today", 0, 3)]
    assert groups(["Yesterday", None, "Today", None]) == [
        ("Yesterday", 0, 2),
        ("Today", 2, 4),
    ]
    assert groups([None, "Today"]) == [(None, 0, 1), ("Today", 1, 2)]
    spans = [("Yesterday", 0, 400), ("Today", 400, 900)]
    assert pinned([], 0) is None
    assert pinned(spans, -10) is None
    assert pinned(spans, 0) == "Yesterday"
    assert pinned(spans, 399) == "Yesterday"
    assert pinned(spans, 400) == "Today"
    assert pinned(spans, 899) == "Today"
    assert pinned(spans, 900) is None
    assert pinned([(None, 0, 200)], 40) is None
    assert "func groups(" in SWIFT
    assert "func pinnedDayLabel(" in SWIFT
    assert "group.bottom <= viewportTop" in SWIFT
    assert "group.top > viewportTop" in SWIFT
    assert "export function dayGroups" in DESKTOP_TS
    assert "export function pinnedDayLabel" in DESKTOP_TS
    assert "group.bottom <= viewportTop" in DESKTOP_TS
    assert "group.top > viewportTop" in DESKTOP_TS
    assert "withAnimation" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "fetch(" not in DESKTOP_TS


def test_both_clients_pin_the_existing_line() -> None:
    assert "pinnedViews: [.sectionHeaders]" in CHAT
    assert "DaySeparator.groups(" in CHAT
    header = CHAT.index("if let dayLabel = group.label")
    band = CHAT[header : header + 700]
    assert "Text(dayLabel)" in band
    assert ".font(.system(size: 12))" in band
    assert ".foregroundStyle(.secondary)" in band
    assert ".accessibilityAddTraits(.isHeader)" in band
    assert "Color(uiColor: .systemBackground)" in band
    assert "withAnimation" not in band
    assert "animation(" not in band
    divider = CHAT.index("NewMessagesDivider()")
    row = CHAT.index("transcriptItem(", divider)
    assert divider < row < header

    line = css_rule(".day-separator")
    assert "position: sticky" in line
    assert "top: 0" in line
    assert "z-index: 2" in line
    assert "background: var(--bg)" in line
    assert "font-size: 12px" in line
    assert "color: var(--text-muted)" in line
    assert "text-align: center" in line
    assert "transition" not in line
    assert "animation" not in line
    group = css_rule(".day-group")
    assert "display: flex" in group
    assert "flex-direction: column" in group
    assert "overflow" not in group
    anchor = css_rule(".day-reading-anchor")
    assert "height: 0" in anchor
    assert "min-height: 0" in anchor
    assert 'className="day-group"' in DESKTOP_APP
    assert "dayGroups(dayLabels)" in DESKTOP_APP
    assert 'className="day-reading-anchor"' in DESKTOP_APP
    sep = DESKTOP_APP.index('className="day-separator"')
    sep_tag = DESKTOP_APP[sep : DESKTOP_APP.index("</p>", sep)]
    assert "data-reading-id" not in sep_tag
    assert 'data-reading-id={`day:${message.id}`}' in DESKTOP_APP


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_sticky_day.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in SWIFT
    assert "computerPane.ts" not in DESKTOP_TS


def main() -> int:
    tests = [
        test_groups_and_pin_rule,
        test_both_clients_pin_the_existing_line,
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
