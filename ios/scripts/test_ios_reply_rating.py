#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.20 rate a reply.

A completed assistant reply offers muted Good and Bad. Tap marks
that reply. Tapping the same mark clears it. Good and Bad are
exclusive. The mark stays on this client and is not sent. A
streaming reply, a user message, and tool or card rows are not
offered. The control does not take composer focus. No new
animation. No new shortcut. No new HTTP. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "ReplyRating.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "replyRating.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.20 rate a reply"
GOOD = "good"
BAD = "bad"


def offers(from_user: bool, kind_message: bool, completed: bool) -> bool:
    return (not from_user) and kind_message and completed


def toggled(ratings: dict[str, str], message_id: str, pick: str) -> dict[str, str]:
    if not message_id or pick not in (GOOD, BAD):
        return ratings
    next_ratings = dict(ratings)
    if next_ratings.get(message_id) == pick:
        del next_ratings[message_id]
    else:
        next_ratings[message_id] = pick
    return next_ratings


def parse(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    ratings: dict[str, str] = {}
    for message_id, value in parsed.items():
        if message_id and value in (GOOD, BAD):
            ratings[message_id] = value
    return ratings


def test_rules() -> None:
    assert offers(False, True, True)
    assert not offers(True, True, True)
    assert not offers(False, False, True)
    assert not offers(False, True, False)
    assert toggled({}, "m1", GOOD) == {"m1": GOOD}
    assert toggled({"m1": GOOD}, "m1", BAD) == {"m1": BAD}
    assert toggled({"m1": BAD}, "m1", BAD) == {}
    assert toggled({"m1": GOOD, "m2": BAD}, "m1", GOOD) == {"m2": BAD}
    kept = {"m1": GOOD}
    assert toggled(kept, "", BAD) is kept
    assert parse(None) == {}
    assert parse("nope") == {}
    assert parse("[]") == {}
    assert parse('{"a":"good","b":"nope","c":1,"":"good","d":"bad"}') == {
        "a": GOOD,
        "d": BAD,
    }


def test_clients_rate_finished_replies() -> None:
    assert 'static let storageKey = "snorlax.replyRating"' in SWIFT
    assert 'static let goodLabel = "Good"' in SWIFT
    assert 'static let badLabel = "Bad"' in SWIFT
    assert 'static let goodAria = "Good response"' in SWIFT
    assert 'static let badAria = "Bad response"' in SWIFT
    assert "static func offers" in SWIFT
    assert "static func toggled" in SWIFT
    assert "/v1/" not in SWIFT
    assert "ReplyRating.offers(" in CHAT
    assert "fromUser: message.isFromUser" in CHAT
    assert "model.toggleReplyRating(id: message.id, pick: pick)" in CHAT
    assert "ReplyRating.label(pick)" in CHAT
    assert "ReplyRating.accessibilityLabel(pick)" in CHAT
    assert "ReplyRating.pressed(current: current, pick: pick)" in CHAT
    user = CHAT.split("} else if isUser {", 1)[1].split("AssistantMarkdown(", 1)[0]
    assert "ReplyRating" not in user
    row = CHAT.split("if showRegenerate {", 1)[1].split("if isUser, let jump", 1)[0]
    assert "if offersReplyRating" in row
    assert "replyRatingControl(ReplyRating.good" in row
    assert "replyRatingControl(ReplyRating.bad" in row
    assert "wantsComposerFocus" not in row
    menu = CHAT.split("private struct BubbleTimestampMenu", 1)[1].split(
        "private struct AttachmentShareSheet", 1
    )[0]
    assert "if showReplyRating" in menu
    assert "Button(ReplyRating.goodLabel)" in menu
    assert "Button(ReplyRating.badLabel)" in menu
    toggle = MODEL.split("func toggleReplyRating(", 1)[1].split("var isConfigured", 1)[0]
    assert "ReplyRating.toggled(replyRatings, id: id, pick: pick)" in toggle
    assert "/v1/" not in toggle
    assert "send(" not in toggle
    assert "wantsComposerFocus" not in toggle
    assert "ReplyRating.read()" in MODEL
    assert "ReplyRating.write(replyRatings)" in MODEL
    assert "offersReplyRating(" in APP
    assert 'onRate("good")' in APP
    assert 'onRate("bad")' in APP
    assert "writeReplyRatings(browserReplyRatingStorage(), next)" in APP
    assert "snorlax.replyRating" in DESKTOP
    assert "Good response" not in SHORTCUTS
    assert "/v1/" not in DESKTOP


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 220. v2.20" in SPEC
    assert "test_ios_reply_rating.py" in CI
    assert "replyRating.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_rules()
    test_clients_rate_finished_replies()
    test_docs_and_openapi()
    print("ios reply rating ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
