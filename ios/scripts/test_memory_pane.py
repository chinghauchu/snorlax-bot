#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.37 iOS memory pane on the agent identity sheet.

Below Skills: 12pt muted Memory header, no trailing Add. 44pt wrapping
14pt fact rows, trailing 12pt muted Remove. Empty still shows the header
plus No memories yet. Confirm is Remove {fact}? then danger Remove.
Channel pane has no Memory block. GET /memory + DELETE { fact } wrap
v0.36 load_facts / forget_fact. OpenAPI stays 0.18.0.
Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SHEET = (IOS / "ProfileSheet.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
SETTINGS = (IOS / "SettingsSheet.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = (ROOT / "desktop" / "src" / "computerPane.ts")


def test_agent_sheet_memory_below_skills_no_add() -> None:
    agent = SHEET[
        SHEET.index("private var agentPane") : SHEET.index("private var computerBlock")
    ]
    assert "skillsList" in agent
    assert "memoryList" in agent
    assert agent.index("skillsList") < agent.index("memoryList")
    memory = SHEET[
        SHEET.index("private var memoryList") : SHEET.index("private var channelPane")
    ]
    assert 'Text("Memory")' in memory
    assert "No memories yet." in memory
    assert 'Button("Remove")' in memory
    assert 'Button("Add")' not in memory
    assert 'Button("Edit")' not in memory
    assert "size: 12" in memory
    assert "size: 14" in memory
    assert "minHeight: 44" in memory
    assert "fixedSize(horizontal: false, vertical: true)" in memory
    assert "pendingRemove = .memory(fact)" in memory
    assert "New skill" not in memory
    assert "AgentAvatar" not in memory


def test_remove_confirm_is_skills_family() -> None:
    assert 'pendingRemove.map { "Remove \\($0.name)?" }' in SHEET
    assert "case .memory(let fact)" in SHEET
    assert "removeMemory" in SHEET
    assert 'Button("Remove", role: .destructive)' in SHEET
    assert "case memory(String)" in SHEET


def test_http_wraps_v036_store() -> None:
    assert "listMemory" in CLIENT
    assert "forgetMemory" in CLIENT
    assert "/memory" in CLIENT
    assert "MemoryForget(fact: fact)" in CLIENT
    assert 'method: "DELETE"' in CLIENT
    assert "loadMemories" in MODEL
    assert "removeMemory" in MODEL
    assert "client.listMemory" in MODEL
    assert "client.forgetMemory" in MODEL
    assert "struct AgentMemory" in TYPES
    assert "struct MemoryForget" in TYPES
    assert "var facts: [String]" in TYPES
    assert "/v1/agents/{id}/memory" in OPENAPI
    assert "getMemory" in OPENAPI
    assert "deleteMemory" in OPENAPI
    assert "version: 0.18.0" in OPENAPI
    assert "v0.37" in OPENAPI
    assert "0.18.0" in TYPES


def test_channel_pane_and_settings_have_no_memory() -> None:
    channel = SHEET[
        SHEET.index("private var channelPane") : SHEET.index("private var channelEditForm")
    ]
    assert "memoryList" not in channel
    assert "listMemory" not in channel
    assert "No memories yet." not in channel
    assert 'Text("Memory")' not in channel
    assert "Memory" not in SETTINGS
    assert "listMemory" not in SETTINGS
    assert "computerPane.ts" not in SHEET
    assert "computerPane.ts" not in CLIENT
    assert "computerPane.ts" not in MODEL
    assert not DESKTOP_PANE.exists()


def main() -> int:
    tests = [
        test_agent_sheet_memory_below_skills_no_add,
        test_remove_confirm_is_skills_family,
        test_http_wraps_v036_store,
        test_channel_pane_and_settings_have_no_memory,
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
    sys.exit(main())
