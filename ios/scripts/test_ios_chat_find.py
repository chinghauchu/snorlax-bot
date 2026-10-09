#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.71 in-chat find over messages already loaded.

Desktop Cmd/Ctrl-F opens a find bar. Matches highlight. Enter /
Shift-Enter and the up/down buttons move between them. Esc closes and
clears highlights. iOS search filters user / assistant / handoff rows
and highlights the same loaded messages. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
FIND = (IOS / "ChatFind.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_FIND = (ROOT / "desktop" / "src" / "chatFind.ts").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.71 in-chat find (Cmd/Ctrl-F in an open chat shows a find bar "
    "over the loaded transcript; matches highlight; Enter/Shift-Enter "
    "and up/down jump between them; n of m; Esc closes and clears "
    "highlights; iOS search filters and highlights those loaded "
    "messages; no new HTTP)"
)


def query_active(query: str) -> bool:
    return query.strip() != ""


def index_hits(text: str, query: str) -> list[tuple[int, int]]:
    if not query_active(query):
        return []
    lowered = text.lower()
    needle = query.lower()
    hits: list[tuple[int, int]] = []
    search = 0
    while search <= len(lowered) - len(needle):
        at = lowered.find(needle, search)
        if at < 0:
            break
        hits.append((at, at + len(needle)))
        search = at + len(needle)
    return hits


def count_label(index: int, total: int) -> str:
    if total <= 0 or index < 0 or index >= total:
        return "0 of 0"
    return f"{index + 1} of {total}"


def step(index: int, total: int, direction: int) -> int:
    if total <= 0:
        return -1
    if index < 0 or index >= total:
        return 0 if direction > 0 else total - 1
    return (index + direction) % total


def omits(searchable: bool, texts: list[str], query: str) -> bool:
    if not query_active(query) or not searchable:
        return False
    return not any(index_hits(text, query) for text in texts)


def test_matches_count_and_wrap() -> None:
    assert index_hits("Say Hello", "HELLO") == [(4, 9)]
    hits = index_hits("hello again, hello.", "hello")
    assert hits == [(0, 5), (13, 18)]
    assert count_label(0, 3) == "1 of 3"
    assert count_label(-1, 0) == "0 of 0"
    assert step(2, 3, 1) == 0
    assert step(0, 3, -1) == 2
    assert step(0, 0, 1) == -1
    assert index_hits("a.b a.b", "a.b") == [(0, 3), (4, 7)]
    assert omits(True, ["nope"], "hello") is True
    assert omits(True, ["Hello"], "hello") is False
    assert omits(False, ["nope"], "hello") is False
    assert omits(True, ["Hello"], " ") is False


def test_ios_wires_find_bar_filter_and_escape() -> None:
    assert "Find in chat" in FIND
    assert "Previous match" in FIND
    assert "Next match" in FIND
    assert "Close find" in FIND
    assert "No matches" in FIND
    assert "0 of 0" in FIND
    assert "func omits" in FIND
    assert "magnifyingglass" in CHAT
    assert "ChatFind.inputLabel" in CHAT
    assert "ChatFind.previousLabel" in CHAT
    assert "ChatFind.nextLabel" in CHAT
    assert "find-bar" not in CHAT
    assert "func findOmits" in CHAT
    assert "onEscapeFind" in CHAT
    escape = CHAT.split("onEscapeStop:", 1)[1].split("onArrowUpRecall", 1)[0]
    assert escape.index("onEscapeFind()") < escape.index("stopGeneratingFromEscape")
    assert "closeFind()" in CHAT
    assert "chevron.up" in CHAT
    assert "chevron.down" in CHAT
    assert "No HTTP" in FIND
    assert "/v1/" not in FIND


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    for doc in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.18.0" in doc
        assert "version: 0.19" not in doc
    assert PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_find.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in FIND
    assert "computerPane.ts" not in CHAT
    assert "/v1/" not in DESKTOP_FIND
    assert "No HTTP" in DESKTOP_FIND


def main() -> int:
    tests = [
        test_matches_count_and_wrap,
        test_ios_wires_find_bar_filter_and_escape,
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
