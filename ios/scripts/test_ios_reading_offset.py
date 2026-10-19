#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v1.30 transcript reading offset.

v0.74 remembers whether a chat was near the bottom or parked on an
earlier row, and coming back aligns that row's top. This cut also
remembers how far into the row the viewport started, as a fraction
of the row height, so a text-size change and new messages still land
in the same place. Near the bottom still opens at the latest. An
anchor that is gone opens at the latest. A new tail shows Jump to
latest and does not yank. In-chat find, a quote jump, a jump to one
of your sent messages, and Home/End win over the saved place. The
restore is instant. Session memory only. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
PLACE = (IOS / "ReadingPlace.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "readingPlace.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v1.30 transcript reading offset"


def fraction(row_top: float, row_bottom: float, viewport_top: float) -> float:
    height = row_bottom - row_top
    if height <= 0:
        return 0.0
    return (viewport_top - row_top) / height


def offset_for(rows: list[dict], anchor_id: str | None, viewport_top: float) -> float:
    if not anchor_id:
        return 0.0
    for row in rows:
        if row["id"] == anchor_id:
            return fraction(row["top"], row["bottom"], viewport_top)
    return 0.0


def scroll_top(
    row_top: float,
    viewport_top: float,
    scroll: float,
    offset: float = 0.0,
    row_height: float = 0.0,
) -> float:
    aligned = row_top - viewport_top + scroll
    shift = offset * row_height if row_height > 0 else 0.0
    next_top = aligned + shift
    return 0.0 if next_top < 0 else next_top


def content_offset(min_y: float, max_y: float, frac: float) -> float:
    height = max_y - min_y
    shift = frac * height if height > 0 else 0.0
    return max(0.0, min_y + shift)


def decision(scheduled: int, current: int, kind: str) -> str:
    if scheduled == current:
        return "place"
    if kind == "top":
        return "top"
    if kind == "bottom":
        return "bottom"
    return "keep"


def capture(near_bottom: bool, anchor_id: str | None, tail_id: str | None, offset: float = 0.0) -> dict:
    parked = (not near_bottom) and anchor_id is not None
    return {
        "nearBottom": near_bottom,
        "anchorId": None if near_bottom else anchor_id,
        "anchorOffset": offset if parked else 0.0,
        "tailId": tail_id,
    }


def test_fraction_tracks_the_row_not_raw_pixels() -> None:
    rows = [
        {"id": "m1", "top": 0, "bottom": 80},
        {"id": "m2", "top": 80, "bottom": 280},
    ]
    assert fraction(80, 280, 130) == 0.25
    assert fraction(80, 80, 80) == 0
    assert offset_for(rows, "m2", 130) == 0.25
    assert offset_for(rows, None, 130) == 0
    assert offset_for(rows, "gone", 130) == 0
    # The same fraction, measured again after the row grows, stays put.
    assert scroll_top(100, 180, 900, fraction(100, 300, 180), 200) == 900
    assert scroll_top(400, 0, 0, 0.4, 400) == 560
    assert scroll_top(240, 80, 100) == 260
    assert scroll_top(10, 80, 20) == 0
    assert content_offset(400, 800, 0.25) == 500
    assert content_offset(40, 40, 0.5) == 40
    parked = capture(False, "m2", "m9", 0.25)
    assert parked["anchorOffset"] == 0.25
    assert capture(True, "m2", "m9", 0.4)["anchorId"] is None
    assert capture(True, "m2", "m9", 0.4)["anchorOffset"] == 0
    assert decision(3, 3, "message") == "place"
    assert decision(3, 4, "message") == "keep"
    assert decision(3, 4, "bottom") == "bottom"
    assert decision(3, 4, "top") == "top"


def test_clients_restore_the_fraction_without_animation_or_http() -> None:
    assert "func restoredContentOffset" in PLACE
    assert "func fraction(minY:" in PLACE
    assert "func anchorOffset(rows:" in PLACE
    assert "func decision(scheduled:" in PLACE
    assert "case keep" in PLACE
    assert "No HTTP" in PLACE
    assert "UserDefaults" not in PLACE
    assert "/v1/" not in PLACE
    assert "anchorOffset" in DESKTOP
    assert "readingRestoreDecision" in DESKTOP
    assert "localStorage" not in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "anchorOffset: anchorOffsetForId(" in APP
    assert "readingRestoreDecision(" in APP
    assert 'targetedScrollKind.current = "message"' in APP
    assert 'targetedScrollKind.current = "top"' in APP
    assert 'targetedScrollKind.current = "bottom"' in APP
    restore = CHAT.split("private func applyPendingRestore", 1)[1].split(
        "private func snapToBottom", 1
    )[0]
    assert "ReadingPlace.decision" in restore
    assert "ReadingPlace.restoredContentOffset" in restore
    assert "proxy.scrollTo(anchor, anchor: .top)" in restore
    assert "DispatchQueue.main.async" not in restore
    assert "scrollIntoView" not in restore
    assert "claimTargetedScroll(.message)" in CHAT
    assert "claimTargetedScroll(.top)" in CHAT
    assert "claimTargetedScroll(.bottom)" in CHAT
    assert "readingOffsetPendingID" in CHAT
    assert "func noteTargetedScroll" in MODEL
    assert "pendingReadingTargeted = targetedScrollToken" in MODEL
    assert "anchorOffset: anchorOffset" in MODEL
    assert "UserDefaults.standard.set(reading" not in MODEL


def test_openapi_stays_0180() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v1.30 " in ROADMAP
    assert "## 130. v1.30" in SPEC
    assert "test_ios_reading_offset.py" in CI
    assert not DESKTOP_PANE.exists()


def main() -> None:
    test_fraction_tracks_the_row_not_raw_pixels()
    test_clients_restore_the_fraction_without_animation_or_http()
    test_openapi_stays_0180()
    print("ios reading offset ok")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
