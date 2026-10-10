#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.74 per-chat reading place.

Switching away remembers whether the transcript was at the latest
messages or parked on an earlier one. Coming back restores that
place. Within ~64px of the bottom, the chat still opens at the
latest. A new reply while away shows Jump to latest. Send,
Regenerate, and Jump still snap to the bottom. Session memory only.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
PLACE = (IOS / "ReadingPlace.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "readingPlace.ts").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.74 per-chat reading place (switching away remembers if you were "
    "at the latest messages or parked on an earlier one; coming back "
    "restores that place; within ~64px of the bottom still opens at the "
    "latest; a new reply while you were away shows Jump to latest; Send, "
    "Regenerate, and Jump still snap to the bottom; session memory only; "
    "no new HTTP)"
)


def key(agent_id: str, thread_id: str | None) -> str:
    return f"{agent_id}\n{thread_id or ''}"


def capture(near_bottom: bool, anchor_id: str | None, tail_id: str | None) -> dict:
    return {
        "nearBottom": near_bottom,
        "anchorId": None if near_bottom else anchor_id,
        "tailId": tail_id,
    }


def top_visible(rows: list[dict], viewport_top: float) -> str | None:
    ordered = sorted(
        (row for row in rows if row["id"]),
        key=lambda row: (row["top"], row["bottom"]),
    )
    fallback = None
    for row in ordered:
        fallback = row["id"]
        if row["bottom"] > viewport_top + 1:
            return row["id"]
    return fallback


def restore(saved: dict | None, anchor_ids: list[str]) -> str:
    if not saved or saved["nearBottom"] or not saved["anchorId"]:
        return "bottom"
    if saved["anchorId"] not in anchor_ids:
        return "bottom"
    return "anchor"


def tail_grew(saved: dict | None, tail_id: str | None) -> bool:
    if not saved or not tail_id:
        return False
    if not saved["tailId"]:
        return True
    return saved["tailId"] != tail_id


def stick(mode: str, grew: bool) -> dict:
    if mode == "bottom":
        return {"armed": True, "showJump": False}
    return {"armed": False, "showJump": grew}


def test_place_rules_match_desktop() -> None:
    assert key("snorlax", None) == "snorlax\n"
    assert key("group", None) != key("group", "thread-1")
    parked = capture(False, "m2", "m9")
    assert capture(True, "m2", "m9")["anchorId"] is None
    assert top_visible(
        [
            {"id": "late", "top": 400, "bottom": 480},
            {"id": "early", "top": 0, "bottom": 40},
            {"id": "mid", "top": 80, "bottom": 200},
        ],
        100,
    ) == "mid"
    assert restore(None, ["m2"]) == "bottom"
    assert restore(capture(True, "m2", "m9"), ["m2"]) == "bottom"
    assert restore(parked, ["m1"]) == "bottom"
    assert restore(parked, ["m2"]) == "anchor"
    assert tail_grew(parked, "m9") is False
    assert tail_grew(parked, "m10") is True
    assert stick("bottom", True) == {"armed": True, "showJump": False}
    assert stick("anchor", False) == {"armed": False, "showJump": False}
    assert stick("anchor", True) == {"armed": False, "showJump": True}
    assert "func topVisibleAnchor" in PLACE
    assert "func restore(saved:" in PLACE
    assert "showJump: tailGrew" in PLACE
    assert "No HTTP" in PLACE
    assert "UserDefaults" not in PLACE
    assert "/v1/" not in PLACE
    assert "export function readingRestore" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "localStorage" not in DESKTOP


def test_chat_restores_and_send_still_snaps() -> None:
    assert "readingAnchor(message.id)" in CHAT
    assert "ReadingPlace.coordinateSpace" in CHAT
    assert "applyPendingRestore(proxy)" in CHAT
    assert 'proxy.scrollTo(anchor, anchor: .top)' in CHAT
    assert 'proxy.scrollTo("bottom", anchor: .bottom)' in CHAT
    assert "if model.pendingReadingKey != nil { return }" in CHAT
    assert "onChange(of: model.stickBump)" in CHAT
    assert "snapToBottom(proxy)" in CHAT
    assert "followStream(proxy)" in CHAT
    start = MODEL.index("func loadConversation")
    end = MODEL.index("func createAgent", start)
    load = MODEL[start:end]
    assert load.index("readingPublishLocked = true") < load.index("selectedAgentID = id")
    assert load.index("messages = rows") < load.index("readingTranscriptToken += 1")
    assert "readingPlaces[key] = ReadingPlace.capture" in MODEL
    assert "func consumeReadingRestore" in MODEL
    assert "stickBump += 1" in MODEL
    send = MODEL[MODEL.index("func send(") : MODEL.index("func regenerate(")]
    regen = MODEL[MODEL.index("func regenerate(") : MODEL.index("func refreshMessages(")]
    assert "stickBump += 1" in send
    assert "stickBump += 1" in regen


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "test_ios_reading_place.py" in CI
    assert not DESKTOP_PANE.exists()


def main() -> None:
    test_place_rules_match_desktop()
    test_chat_restores_and_send_still_snaps()
    test_openapi_stays_0180_and_no_computer_pane()
    print("ios reading place ok")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
