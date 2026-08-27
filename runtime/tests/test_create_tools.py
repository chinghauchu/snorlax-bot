# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.roster import ERR_MISSING_NAME
from snorlax_runtime.skills import SEED_TEAMMATES_SLUG
from snorlax_runtime.tools import done_summary, offered_tool_definitions
from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"


def _send(client, dest: str, content: str):
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json={"content": content},
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, parse_sse(body)


def _msgs(client, dest: str) -> list[dict]:
    return client.get(f"/v1/agents/{dest}/messages", headers=AUTH).json()


def _tool_dones(events: list[tuple[str, dict]], name: str) -> list[dict]:
    return [
        p
        for n, p in events
        if n == "tool.done" and p.get("name") == name
    ]


def test_create_tools_are_offered() -> None:
    names = [
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    ]
    assert "create_agent" in names
    assert "create_channel" in names


def test_done_summary_created_name() -> None:
    assert (
        done_summary("create_agent", {"name": "B"}, True, "Created B\nid: b")
        == "Created B"
    )
    assert (
        done_summary("create_channel", {"name": "Ops"}, True, "Created Ops")
        == "Created Ops"
    )
    assert (
        done_summary("create_agent", {"name": "B"}, False, ERR_MISSING_NAME)
        == "create_agent failed"
    )
    assert (
        done_summary("create_channel", {"name": "Ops"}, False, "Error: Unknown member id")
        == "create_channel failed"
    )


def test_create_agent_tool_success(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_agent {"name": "B"}'
    )
    assert status == 200
    dones = _tool_dones(events, "create_agent")
    assert dones
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Created B"
    assert dones[0]["name"] == "create_agent"
    roster = client.get("/v1/agents", headers=AUTH).json()
    created = next(a for a in roster if a["name"] == "B")
    assert created["kind"] == "agent"
    assert created["id"] == "b"
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools
    assert tools[-1]["content"] == "Created B"
    assert tools[-1]["senderId"] == SEED


def test_create_channel_tool_success_snapshots_roster(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_channel {"name": "Ops"}'
    )
    assert status == 200
    dones = _tool_dones(events, "create_channel")
    assert dones
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Created Ops"
    roster = client.get("/v1/agents", headers=AUTH).json()
    created = next(a for a in roster if a["name"] == "Ops")
    assert created["kind"] == "channel"
    assert created["id"] == "ops"
    assert "snorlax-bot" in created["memberIds"]
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "Created Ops"


def test_create_channel_empty_member_ids_still_snapshots(client) -> None:
    status, events = _send(
        client,
        SEED,
        'SNORLAX_TOOL create_channel {"name": "Studio", "memberIds": []}',
    )
    assert status == 200
    dones = _tool_dones(events, "create_channel")
    assert dones[0]["ok"] is True
    created = client.get("/v1/agents/studio", headers=AUTH).json()
    assert created["kind"] == "channel"
    assert "snorlax-bot" in created["memberIds"]


def test_create_agent_empty_name_is_tool_error_not_422(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_agent {"name": ""}'
    )
    assert status == 200
    dones = _tool_dones(events, "create_agent")
    assert dones
    assert dones[0]["ok"] is False
    assert dones[0]["summary"] == "create_agent failed"
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "create_agent failed"
    roster = client.get("/v1/agents", headers=AUTH).json()
    names = {a["name"] for a in roster if a["kind"] == "agent"}
    assert names == {"Snorlax"}


def test_create_channel_empty_name_is_tool_error_not_422(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_channel {"name": "  "}'
    )
    assert status == 200
    dones = _tool_dones(events, "create_channel")
    assert dones[0]["ok"] is False
    assert dones[0]["summary"] == "create_channel failed"
    roster = client.get("/v1/agents", headers=AUTH).json()
    channels = [a for a in roster if a["kind"] == "channel"]
    assert {c["id"] for c in channels} == {CHANNEL}


def test_create_channel_unknown_member_ids_tool_error_http_still_422(client) -> None:
    status, events = _send(
        client,
        SEED,
        'SNORLAX_TOOL create_channel {"name": "Ghost", "memberIds": ["nope"]}',
    )
    assert status == 200
    dones = _tool_dones(events, "create_channel")
    assert dones[0]["ok"] is False
    assert dones[0]["summary"] == "create_channel failed"
    http = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Ghost room", "kind": "channel", "memberIds": ["nope"]},
    )
    assert http.status_code == 422
    assert "Unknown member id" in http.json()["error"]
    roster = client.get("/v1/agents", headers=AUTH).json()
    assert all(a["id"] != "ghost" for a in roster)


def test_create_agent_isolation_does_not_paint_b_into_a(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_agent {"name": "B"}'
    )
    assert status == 200
    created = next(
        a for a in client.get("/v1/agents", headers=AUTH).json() if a["name"] == "B"
    )
    a_msgs = _msgs(client, SEED)
    senders = {m["senderId"] for m in a_msgs}
    assert created["id"] not in senders
    assert SEED in senders
    assert all(m.get("kind") != "message" or m["senderId"] in {"user", SEED} for m in a_msgs)
    b_msgs = _msgs(client, created["id"])
    assert b_msgs == []
    sse_senders = {
        payload.get("senderId")
        for name, payload in events
        if name in {"message.delta", "message.done", "tool.start", "tool.done"}
    }
    assert created["id"] not in sse_senders


def test_seed_skill_maps_project_and_staff(client) -> None:
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH).json()
    ids = {row["id"] for row in listed}
    names = {row["name"] for row in listed}
    assert SEED_TEAMMATES_SLUG in ids
    assert "teammates" in names
    body = client.get(
        f"/v1/agents/{SEED}/skills/{SEED_TEAMMATES_SLUG}", headers=AUTH
    ).json()
    text = body["body"]
    assert "create_agent" in text
    assert "create_channel" in text
    assert "项目" in text
    assert "员工" in text
    assert "POST /v1/agents" in text
