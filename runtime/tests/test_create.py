# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.create import (
    ERR_NAME_REQUIRED,
    format_created,
    parse_create_args,
)
from snorlax_runtime.tools import done_summary, offered_tool_definitions
from tests.conftest import AUTH, HIRE_SKILL_ID, HIRE_SKILL_NAME, parse_sse

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


def _msgs(client, dest: str, thread_id: str | None = None) -> list[dict]:
    params = {"threadId": thread_id} if thread_id else None
    return client.get(
        f"/v1/agents/{dest}/messages", headers=AUTH, params=params
    ).json()


def test_parse_create_args() -> None:
    assert parse_create_args('{"name": "Inbox"}') == {"name": "Inbox"}
    assert parse_create_args("{") == {}
    assert parse_create_args("[]") == {}
    assert parse_create_args("") == {}


def test_format_created_plain_text_id_and_name() -> None:
    body = format_created({"id": "inbox", "name": "Inbox"})
    assert body.startswith("Inbox")
    assert "id: inbox" in body
    assert not body.startswith("{")


def test_done_summary_created_name() -> None:
    assert (
        done_summary("create_agent", {"name": "Inbox"}, True, "Inbox\nid: inbox")
        == "Created Inbox"
    )
    assert (
        done_summary(
            "create_channel", {"name": "Ops"}, True, "Ops\nid: ops"
        )
        == "Created Ops"
    )
    assert (
        done_summary("create_agent", {"name": "Inbox"}, False, ERR_NAME_REQUIRED)
        == "create_agent failed"
    )
    assert (
        done_summary(
            "create_channel", {"name": "Ops"}, False, "Error: Unknown member id"
        )
        == "create_channel failed"
    )


def test_create_tools_are_offered() -> None:
    names = [
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    ]
    assert "create_agent" in names
    assert "create_channel" in names
    assert "watch_video" in names


def test_hire_skill_is_listed(client) -> None:
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    rows = listed.json()
    assert any(row["id"] == HIRE_SKILL_ID and row["name"] == HIRE_SKILL_NAME for row in rows)
    got = client.get(f"/v1/agents/{SEED}/skills/{HIRE_SKILL_ID}", headers=AUTH)
    assert got.status_code == 200
    body = got.json()["body"]
    assert "create_channel" in body
    assert "create_agent" in body
    assert "项目" in body
    assert "员工" in body


def test_create_agent_success_listed(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_agent {"name": "Inbox", "title": "Mail"}'
    )
    assert status == 200
    start = next(p for n, p in events if n == "tool.start")
    done = next(p for n, p in events if n == "tool.done")
    assert start["name"] == "create_agent"
    assert done["name"] == "create_agent"
    assert done["ok"] is True
    assert done["summary"] == "Created Inbox"
    tool_msgs = [p for n, p in events if n == "message.done" and p.get("kind") == "tool"]
    assert tool_msgs
    assert tool_msgs[0]["content"] == "Created Inbox"
    listed = _msgs(client, SEED)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools[0]["content"] == "Created Inbox"
    roster = client.get("/v1/agents", headers=AUTH).json()
    inbox = next(a for a in roster if a["name"] == "Inbox")
    assert inbox["kind"] == "agent"
    assert inbox["title"] == "Mail"
    assert inbox["id"] == "inbox"
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert tool_roles
    result = str(tool_roles[0].get("content") or "")
    assert "Inbox" in result
    assert "id: inbox" in result
    assert not result.startswith("{")


def test_create_channel_kind_channel(client) -> None:
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_channel {"name": "Ops"}'
    )
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["name"] == "create_channel"
    assert done["ok"] is True
    assert done["summary"] == "Created Ops"
    listed = _msgs(client, SEED)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools[0]["content"] == "Created Ops"
    row = client.get("/v1/agents/ops", headers=AUTH).json()
    assert row["kind"] == "channel"
    assert row["name"] == "Ops"
    assert "snorlax-bot" in row["memberIds"]
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert "id: ops" in str(tool_roles[0].get("content") or "")


def test_create_channel_from_channel_thread(client) -> None:
    inbox = client.post("/v1/agents", headers=AUTH, json={"name": "Inbox"}).json()
    status, events = _send(
        client,
        CHANNEL,
        f'@Inbox SNORLAX_TOOL create_channel {{"name": "War room", "memberIds": ["{SEED}"]}}',
    )
    assert status == 200
    dones = [p for n, p in events if n == "tool.done"]
    assert any(p.get("name") == "create_channel" and p.get("ok") is True for p in dones)
    row = client.get("/v1/agents/war-room", headers=AUTH).json()
    assert row["kind"] == "channel"
    assert row["memberIds"] == [SEED]
    seed_msgs = _msgs(client, SEED)
    assert all(m.get("kind") != "tool" or "War room" not in (m.get("content") or "") for m in seed_msgs)


def test_empty_name_tool_error_post_200(client) -> None:
    before = {a["id"] for a in client.get("/v1/agents", headers=AUTH).json()}
    status, events = _send(client, SEED, "SNORLAX_TOOL create_agent {}")
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["name"] == "create_agent"
    assert done["ok"] is False
    assert done["summary"] == "create_agent failed"
    listed = _msgs(client, SEED)
    users = [m for m in listed if m["role"] == "user"]
    assert users
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools[0]["content"] == "create_agent failed"
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert ERR_NAME_REQUIRED in str(tool_roles[0].get("content") or "")
    after = {a["id"] for a in client.get("/v1/agents", headers=AUTH).json()}
    assert after == before

    status, events = _send(client, SEED, 'SNORLAX_TOOL create_channel {"name": ""}')
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["name"] == "create_channel"
    assert done["ok"] is False
    assert done["summary"] == "create_channel failed"
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert ERR_NAME_REQUIRED in str(tool_roles[0].get("content") or "")


def test_unknown_member_id_tool_error(client) -> None:
    status, events = _send(
        client,
        SEED,
        'SNORLAX_TOOL create_channel {"name": "Ghost", "memberIds": ["nope"]}',
    )
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["ok"] is False
    assert done["summary"] == "create_channel failed"
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert "Error: Unknown member id" in str(tool_roles[0].get("content") or "")
    roster = client.get("/v1/agents", headers=AUTH).json()
    assert all(a["id"] != "ghost" for a in roster)

    status, events = _send(
        client,
        SEED,
        'SNORLAX_TOOL create_channel {"name": "Bad", "memberIds": ["snorlax-bot-group"]}',
    )
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["ok"] is False
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert "Error: memberIds must be agent ids" in str(tool_roles[0].get("content") or "")


def test_new_agent_one_to_one_is_empty_not_a_copy(client) -> None:
    _send(client, SEED, "hello from A")
    a_before = _msgs(client, SEED)
    assert any(m["role"] == "user" and "hello from A" in (m.get("content") or "") for m in a_before)
    status, events = _send(
        client, SEED, 'SNORLAX_TOOL create_agent {"name": "Peer"}'
    )
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["ok"] is True
    assert done["summary"] == "Created Peer"
    peer = client.get("/v1/agents/peer", headers=AUTH).json()
    assert peer["kind"] == "agent"
    b_msgs = _msgs(client, peer["id"])
    assert b_msgs == []
    a_after = _msgs(client, SEED)
    assert all(m.get("senderId") != peer["id"] for m in a_after)
    assert not any(
        m.get("kind") == "message"
        and m.get("role") == "assistant"
        and peer["id"] == m.get("agentId")
        for m in a_after
        if m.get("agentId") and m.get("agentId") != SEED
    )


def test_create_not_auto_invoked_without_tool_call(client) -> None:
    before = {a["id"] for a in client.get("/v1/agents", headers=AUTH).json()}
    status, events = _send(client, SEED, "请建一个项目叫 Alpha，再雇一个员工 Bob")
    assert status == 200
    assert not any(
        n == "tool.start" and p.get("name") in {"create_agent", "create_channel"}
        for n, p in events
    )
    assert not any(
        n == "tool.done" and p.get("name") in {"create_agent", "create_channel"}
        for n, p in events
    )
    after = {a["id"] for a in client.get("/v1/agents", headers=AUTH).json()}
    assert after == before
    listed = _msgs(client, SEED)
    assert not any(
        m.get("kind") == "tool" and "Created " in (m.get("content") or "")
        for m in listed
    )


def test_no_chats_resource_on_create_paths(client) -> None:
    missing = client.post("/v1/chats/snorlax-bot/messages", headers=AUTH, json={})
    assert missing.status_code in {404, 405, 422}
