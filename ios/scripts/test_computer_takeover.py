#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.19 iOS takeover + v0.20 iOS Record chrome lock.

Runtime protocol is unchanged: v0.15 POST/DELETE /computer/session plus
pointer/key, then v0.16 POST/DELETE /computer/record and POST /skills { name }.
Discard is omit the skills POST. Record only inside a takeover session.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHROME = (IOS / "ComputerSession.swift").read_text(encoding="utf-8")
TAKEOVER = (IOS / "ComputerTakeover.swift").read_text(encoding="utf-8")
SHEET = (IOS / "ProfileSheet.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
CONTENT = (IOS / "ContentView.swift").read_text(encoding="utf-8")

SANDBOX_WIDTH = 1280
SANDBOX_HEIGHT = 800
TAP_SLOP = 8


def can_open(has_sandbox: bool | None) -> bool:
    return has_sandbox is True


def open_posts_session(has_sandbox: bool | None) -> bool:
    return can_open(has_sandbox)


def record_offered(session_open: bool) -> bool:
    return session_open


def record_control_label(recording: bool) -> str:
    return "Stop" if recording else "Record"


def done_disabled(recording: bool) -> bool:
    return recording


def save_disabled(name: str) -> bool:
    return not (name or "").strip()


def writes_skill(saved: bool) -> bool:
    return saved


def letterbox(
    container_width: float,
    container_height: float,
    source_width: float = SANDBOX_WIDTH,
    source_height: float = SANDBOX_HEIGHT,
) -> dict[str, float]:
    scale = min(container_width / source_width, container_height / source_height)
    width = source_width * scale
    height = source_height * scale
    return {
        "x": (container_width - width) / 2,
        "y": (container_height - height) / 2,
        "width": width,
        "height": height,
        "scale": scale,
    }


def map_pointer(
    local_x: float,
    local_y: float,
    container_width: float,
    container_height: float,
) -> dict[str, int] | None:
    box = letterbox(container_width, container_height)
    x = local_x - box["x"]
    y = local_y - box["y"]
    if x < 0 or y < 0 or x > box["width"] or y > box["height"]:
        return None
    return {
        "x": max(0, min(SANDBOX_WIDTH - 1, math.floor(x / box["scale"]))),
        "y": max(0, min(SANDBOX_HEIGHT - 1, math.floor(y / box["scale"]))),
    }


def is_tap(dx: float, dy: float) -> bool:
    return math.hypot(dx, dy) < TAP_SLOP


def pointer_type(dx: float, dy: float, ended: bool) -> str | None:
    tap = is_tap(dx, dy)
    if ended:
        return "click" if tap else None
    return None if tap else "move"


def test_open_only_when_has_sandbox() -> None:
    assert can_open(True) is True
    assert can_open(False) is False
    assert can_open(None) is False
    assert open_posts_session(True) is True
    assert open_posts_session(False) is False
    assert 'static let openLabel = "Open"' in CHROME
    assert "static func canOpen(hasSandbox: Bool?) -> Bool" in CHROME
    assert "hasSandbox == true" in CHROME
    computer = SHEET[
        SHEET.index("private var computerBlock") : SHEET.index("private var paneRoutines")
    ]
    assert "ComputerTakeoverChrome.canOpen" in computer
    assert "ComputerTakeoverChrome.openLabel" in computer
    assert "No computer yet." in computer or "noComputerYet" in computer
    empty = computer[computer.index("else") :]
    assert "openLabel" not in empty
    assert 'Button(ComputerTakeoverChrome.openLabel)' not in empty


def test_tap_posts_session() -> None:
    assert open_posts_session(True) is True
    assert "func openComputer(for agentId: String)" in MODEL
    assert "openComputerSession" in MODEL
    assert "openPostsSession" in MODEL
    assert "client.openComputerSession(agentId: agentId)" in MODEL
    assert "computer/session" in CLIENT
    assert "func openComputerSession" in CLIENT
    assert 'method: "POST"' in CLIENT
    computer = SHEET[
        SHEET.index("private var computerBlock") : SHEET.index("private var paneRoutines")
    ]
    assert "model.openComputer" in computer
    assert "onTapGesture" in computer
    assert "fullScreenCover" in CONTENT
    assert "ComputerTakeoverView" in CONTENT


def test_open_chrome() -> None:
    assert 'static let drivingLabel = "You\'re driving · agent paused"' in CHROME
    assert "static let barHeight: CGFloat = 52" in CHROME
    assert "static let avatarSize: CGFloat = 24" in CHROME
    assert "static let doneHeight: CGFloat = 44" in CHROME
    assert "static let labelSize: CGFloat = 12" in CHROME
    assert 'static let keyboardLabel = "Keyboard"' in CHROME
    assert 'static let doneLabel = "Done"' in CHROME
    assert "fullScreenCover" in CONTENT
    assert "Open is full-screen" in TAKEOVER or "Full-screen iOS Open" in TAKEOVER
    assert "interactiveDismissDisabled" in TAKEOVER
    assert "navigationBarBackButtonHidden" in TAKEOVER
    assert "Swipe-back disabled" in TAKEOVER
    assert "HiddenKeyboardField" in TAKEOVER
    assert "POST" in CHROME or "keyPath" in CHROME
    assert "computer/key" in CLIENT
    assert "closeComputerSession" in MODEL
    assert "DELETE" in CLIENT
    assert "computerTakeoverOpen" in MODEL
    assert "!computerTakeoverOpen" in MODEL


def test_letterbox_tap_click_pan_move() -> None:
    box = letterbox(640, 500)
    assert abs(box["scale"] - 0.5) < 1e-9
    assert box["width"] == 640
    assert box["height"] == 400
    assert box["x"] == 0
    assert box["y"] == 50
    assert map_pointer(160, 150, 640, 500) == {"x": 320, "y": 200}
    assert map_pointer(10, 10, 640, 500) is None
    assert pointer_type(0, 0, ended=True) == "click"
    assert pointer_type(20, 0, ended=False) == "move"
    assert pointer_type(20, 0, ended=True) is None
    assert "tap is click" in CHROME.lower() or "Tap is click" in CHROME
    assert "pointerType" in CHROME
    assert ".click" in CHROME
    assert ".move" in CHROME
    assert "MagnificationGesture" in TAKEOVER
    assert "pinch" in CHROME.lower()


def test_record_stop_save_chrome() -> None:
    assert record_control_label(False) == "Record"
    assert record_control_label(True) == "Stop"
    assert done_disabled(True) is True
    assert done_disabled(False) is False
    assert save_disabled("") is True
    assert save_disabled("   ") is True
    assert save_disabled("Demo") is False
    assert 'static let recordLabel = "Record"' in CHROME
    assert 'static let stopLabel = "Stop"' in CHROME
    assert 'static let saveAsSkillTitle = "Save as skill"' in CHROME
    assert 'static let saveLabel = "Save"' in CHROME
    assert 'static let savedLabel = "Saved"' in CHROME
    assert 'static let cancelLabel = "Cancel"' in CHROME
    assert "static let recordDotSize: CGFloat = 6" in CHROME
    assert "static let labelSize: CGFloat = 12" in CHROME
    assert "static let savedFeedbackMs = 1500" in CHROME
    assert "--danger" in CHROME
    assert "ff6b6b" in CHROME
    assert "static func recordControlLabel(recording: Bool) -> String" in CHROME
    assert "static func doneDisabled(recording: Bool) -> Bool" in CHROME
    assert "static func saveDisabled(name: String) -> Bool" in CHROME
    assert "recordControlLabel" in TAKEOVER
    assert "doneDisabled" in TAKEOVER
    record_btn = TAKEOVER.index("recordControl")
    done_btn = TAKEOVER.index("ComputerTakeoverChrome.doneLabel")
    assert record_btn < done_btn
    assert "RecordDot" in TAKEOVER
    assert "accessibilityReduceMotion" in TAKEOVER
    assert "SaveAsSkillSheet" in TAKEOVER
    assert "saveAsSkillTitle" in TAKEOVER
    assert "skillNameSize" in TAKEOVER or "skillNameSize" in CHROME
    assert "saveButtonHeight" in TAKEOVER
    assert "saveDisabled" in TAKEOVER
    assert "cancelLabel" in TAKEOVER
    assert 'Image(systemName: "xmark")' in TAKEOVER
    assert "savedLabel" in TAKEOVER
    assert "computer/record" in CLIENT
    assert "func startComputerRecord" in CLIENT
    assert "func stopComputerRecord" in CLIENT
    assert 'method: "POST"' in CLIENT
    assert 'method: "DELETE"' in CLIENT
    assert "func createSkill" in CLIENT
    assert "SkillCreate" in CLIENT
    assert "startComputerRecord" in MODEL
    assert "stopComputerRecord" in MODEL
    assert "saveRecordedSkill" in MODEL
    assert "startComputerRecord" in TAKEOVER
    assert "stopComputerRecord" in TAKEOVER
    assert "saveRecordedSkill" in TAKEOVER
    # Keyboard / tap-click / pan-move / Done from v0.19 stay.
    assert "keyboardLabel" in TAKEOVER
    assert "doneLabel" in TAKEOVER


def test_record_without_session_not_offered() -> None:
    assert record_offered(True) is True
    assert record_offered(False) is False
    assert "static func recordOffered(sessionOpen: Bool) -> Bool" in CHROME
    assert "recordOffered(sessionOpen:" in TAKEOVER
    assert "recordOffered(sessionOpen: computerTakeoverOpen)" in MODEL
    computer = SHEET[
        SHEET.index("private var computerBlock") : SHEET.index("private var paneRoutines")
    ]
    assert "recordLabel" not in computer
    assert "Record" not in computer
    assert "Save as skill" not in computer
    assert "computer/record" not in SHEET
    assert "computer/record" not in CHAT
    assert "computer/record" not in CONTENT
    assert "Save as skill" not in SHEET
    assert "Save as skill" not in CHAT
    assert "Save as skill" not in CONTENT
    skills = SHEET[SHEET.index("private var skillsList") : SHEET.index("private var channelPane")]
    assert 'Button("Add")' not in skills
    assert "New skill" not in skills
    channel = SHEET[SHEET.index("channelPane") : SHEET.index("channelEditForm")]
    assert "recordLabel" not in channel
    assert "SaveAsSkillSheet" not in channel


def test_discard_writes_nothing() -> None:
    assert writes_skill(False) is False
    assert writes_skill(True) is True
    assert "static func writesSkill(saved: Bool) -> Bool" in CHROME
    assert "saved" in CHROME[CHROME.index("func writesSkill") :]
    discard = TAKEOVER[
        TAKEOVER.index("private func discardSave") : TAKEOVER.index("private func saveSkill")
    ]
    assert "createSkill" not in discard
    assert "saveRecordedSkill" not in discard
    assert "POST /skills" in discard or "omit POST" in discard or "no SKILL.md" in discard
    assert "onCancel: discardSave" in TAKEOVER
    save = TAKEOVER[TAKEOVER.index("private func saveSkill") :]
    assert "saveRecordedSkill" in save
    stop = MODEL[MODEL.index("func stopComputerRecord") : MODEL.index("func saveRecordedSkill")]
    assert "createSkill" not in stop
    assert "DELETE" in CLIENT
    create = CLIENT[CLIENT.index("func createSkill") :]
    assert 'method: "POST"' in create
    assert "/skills" in create


def main() -> int:
    tests = [
        test_open_only_when_has_sandbox,
        test_tap_posts_session,
        test_open_chrome,
        test_letterbox_tap_click_pan_move,
        test_record_stop_save_chrome,
        test_record_without_session_not_offered,
        test_discard_writes_nothing,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL  {test.__name__}: {exc}")
    if failed:
        print(f"{failed} failed")
        return 1
    print(f"{len(tests)} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
