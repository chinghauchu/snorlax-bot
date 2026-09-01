#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.40 Settings shared-memory list + v0.38 agent Memory pane chrome.

Settings (desktop + iOS) lists user facts from GET /v1/memory with the
same Remove chrome as the agent pane. Agent pane stays agent-only
(GET /v1/agents/{id}/memory). Channel pane has no Memory block.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
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
    assert "1.2" in memory
    assert "minHeight: 44" in memory
    assert "lineLimit(2)" in memory
    assert "truncationMode(.tail)" in memory
    assert "onLongPressGesture" in memory
    assert "UIPasteboard.general.string = fact" in memory
    assert "fixedSize(horizontal: false, vertical: true)" not in memory
    assert "pendingRemove = .memory(fact)" in memory
    assert "New skill" not in memory
    assert "AgentAvatar" not in memory
    assert "listUserMemory" not in memory
    assert "userMemories" not in memory


def test_remove_confirm_never_interpolates_the_fact() -> None:
    assert '"Remove this memory?"' in SHEET
    assert "removeConfirmTitle" in SHEET
    assert "case .memory" in SHEET
    assert "removeMemory" in SHEET
    assert 'Button("Remove", role: .destructive)' in SHEET
    assert 'Button("Cancel", role: .cancel)' in SHEET
    assert "case memory(String)" in SHEET
    memory_title = SHEET[
        SHEET.index("private var removeConfirmTitle") : SHEET.index(
            "init(agent: Agent)"
        )
    ]
    assert '"Remove this memory?"' in memory_title
    assert "Remove \\(fact)?" not in memory_title
    assert "Remove \\($0.name)?" not in SHEET


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
    assert "0.18.0" in TYPES


def test_http_user_memory_is_v1_memory() -> None:
    assert "listUserMemory" in CLIENT
    assert "forgetUserMemory" in CLIENT
    assert 'get("v1/memory")' in CLIENT
    user_forget = CLIENT[
        CLIENT.index("func forgetUserMemory") : CLIENT.index("func createRoutine")
    ]
    assert '"v1/memory"' in user_forget
    assert "MemoryForget(fact: fact)" in user_forget
    assert 'method: "DELETE"' in user_forget
    assert "loadUserMemories" in MODEL
    assert "removeUserMemory" in MODEL
    assert "client.listUserMemory" in MODEL
    assert "client.forgetUserMemory" in MODEL
    assert "getUserMemory" in OPENAPI
    assert "deleteUserMemory" in OPENAPI
    assert "v0.40" in OPENAPI
    assert "version: 0.18.0" in OPENAPI


def test_open_pane_refetch_after_remembered_forgot() -> None:
    assert "refreshOpenMemory" in MODEL
    assert "isMemoryToolLine" in MODEL
    assert '"Remembered"' in MODEL
    assert '"Forgot"' in MODEL
    assert "showProfile" in MODEL
    assert "loadMemories(for: agent.id)" in MODEL
    assert "isChannel" in MODEL
    handle = MODEL[MODEL.index("private func handle") :]
    assert "refreshOpenMemory(from: message.content)" in handle
    assert "refreshOpenMemory(from: summary)" in handle


def test_open_settings_refetch_user_memory() -> None:
    assert "refreshOpenUserMemory" in MODEL
    assert "showSettings" in MODEL
    assert "loadUserMemories()" in MODEL
    handle = MODEL[MODEL.index("private func handle") :]
    assert "refreshOpenUserMemory(from: message.content)" in handle
    assert "refreshOpenUserMemory(from: summary)" in handle
    refresh = MODEL[
        MODEL.index("private func refreshOpenUserMemory") : MODEL.index(
            "func handleSceneActive"
        )
    ]
    assert "showSettings" in refresh
    assert "isMemoryToolLine" in refresh
    assert "loadUserMemories()" in refresh
    assert "loadMemories(for:" not in refresh
    assert "guard showSettings, Self.isMemoryToolLine(text)" in refresh
    assert "scope ==" not in refresh
    assert 'scope: "user"' not in refresh
    assert "SCOPE_USER" not in refresh
    assert "ANY Remembered" in OPENAPI
    assert "special-case user scope" in OPENAPI


def test_channel_pane_has_no_memory() -> None:
    channel = SHEET[
        SHEET.index("private var channelPane") : SHEET.index("private var channelEditForm")
    ]
    assert "memoryList" not in channel
    assert "listMemory" not in channel
    assert "listUserMemory" not in channel
    assert "No memories yet." not in channel
    assert 'Text("Memory")' not in channel
    assert "computerPane.ts" not in SHEET
    assert "computerPane.ts" not in CLIENT
    assert "computerPane.ts" not in MODEL
    assert not DESKTOP_PANE.exists()


def test_settings_lists_user_memory_above_plugins() -> None:
    assert 'Text("Memory")' in SETTINGS
    assert "No memories yet." in SETTINGS
    assert "userMemories" in SETTINGS
    assert "loadUserMemories" in SETTINGS
    assert "removeUserMemory" in SETTINGS
    assert '"Remove this memory?"' in SETTINGS
    assert "Remove \\(fact)?" not in SETTINGS
    assert 'Button("Remove")' in SETTINGS
    assert "lineLimit(2)" in SETTINGS
    assert "truncationMode(.tail)" in SETTINGS
    assert "onLongPressGesture" in SETTINGS
    assert "UIPasteboard.general.string = fact" in SETTINGS
    assert "minHeight: 44" in SETTINGS
    assert "size: 12" in SETTINGS
    assert "size: 14" in SETTINGS
    assert "1.2" in SETTINGS
    assert SETTINGS.index('Text("Memory")') < SETTINGS.index('Text("Plugins")')
    memory = SETTINGS[
        SETTINGS.index('Text("Memory")') : SETTINGS.index('Text("Plugins")')
    ]
    assert 'Button("Add")' not in memory
    assert 'Button("Edit")' not in memory
    assert "listMemory" not in SETTINGS
    assert "listUserMemory" not in SETTINGS
    assert "computerPane.ts" not in SETTINGS


def main() -> int:
    tests = [
        test_agent_sheet_memory_below_skills_no_add,
        test_remove_confirm_never_interpolates_the_fact,
        test_http_wraps_v036_store,
        test_http_user_memory_is_v1_memory,
        test_open_pane_refetch_after_remembered_forgot,
        test_open_settings_refetch_user_memory,
        test_channel_pane_has_no_memory,
        test_settings_lists_user_memory_above_plugins,
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
