#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.14 load earlier messages in a long chat.

The clients already stop at the newest page of 100. Load earlier
messages uses the existing before cursor and prepends the older page
on desktop and iOS. No new HTTP. OpenAPI stays 0.18.0.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "EarlierMessages.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "earlierMessages.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
API = (ROOT / "desktop" / "src" / "api.ts").read_text(encoding="utf-8")
CSS = (ROOT / "desktop" / "src" / "styles.css").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.14 load earlier messages"


def test_logic_matches() -> None:
    assert 'static let label = "Load earlier messages"' in SWIFT
    assert 'static let loadingLabel = "Loading earlier messages"' in SWIFT
    assert 'static let failedLabel = "Couldn\'t load earlier messages"' in SWIFT
    assert "static let pageSize = 100" in SWIFT
    assert "static func pageMayHaveEarlier" in SWIFT
    assert "static func mergeEarlier" in SWIFT
    assert "static func mergeLatest" in SWIFT
    assert "static func stillHasEarlier" in SWIFT
    assert "static func cursor" in SWIFT
    assert 'export const LOAD_EARLIER_LABEL = "Load earlier messages"' in DESKTOP
    assert "export const EARLIER_PAGE_SIZE = 100" in DESKTOP
    assert "export function applyEarlierPage" in DESKTOP
    assert "export function mergeLatestPage" in DESKTOP
    assert "export function earlierCursor" in DESKTOP
    assert "No new HTTP" in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "computerPane.ts" not in DESKTOP


def test_clients_wire_the_control() -> None:
    assert "func loadEarlier()" in MODEL
    assert "noteFreshEarlier" in MODEL
    assert "listedKeepingEarlier" in MODEL
    assert "earlierHold = true" in MODEL
    assert "clearEarlier()" in MODEL
    assert "before: cursor" in MODEL
    assert "EarlierMessages.pageSize" in MODEL
    assert "func listMessages" in CLIENT
    assert 'URLQueryItem(name: "before"' in CLIENT
    assert "EarlierMessages.label" in CHAT
    assert "EarlierMessages.loadingLabel" in CHAT
    assert "EarlierMessages.failedLabel" in CHAT
    assert "model.loadEarlier()" in CHAT
    assert "model.earlierHold" in CHAT
    assert "scrollTo(edge: .top)" in CHAT
    assert "disablesAnimations = true" in CHAT
    hold = CHAT.split("if model.earlierHold", 1)[1].split("followStream(proxy)", 1)[0]
    assert "scrollTo(edge: .top)" in hold
    assert "followStream(proxy)" not in hold
    assert 'className="load-earlier"' in APP
    assert "void loadEarlier()" in APP
    assert "applyEarlierPage" in APP
    assert "mergeLatestPage" in APP
    assert 'params.set("before", opts.before)' in API
    assert 'params.set("limit", String(opts.limit))' in API
    block = CSS[CSS.find(".load-earlier {") : CSS.find(".transcript-line {")]
    assert "transition" not in block
    assert "animation" not in block


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "name: before" in OPENAPI
    assert "/v1/agents/{id}/messages" in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "OpenAPI stays **0.18.0**" in SPEC
    assert "test_ios_earlier_messages.py" in CI
    assert not PANE.exists()


if __name__ == "__main__":
    test_logic_matches()
    test_clients_wire_the_control()
    test_docs_and_openapi()
    print("ios earlier messages ok")
